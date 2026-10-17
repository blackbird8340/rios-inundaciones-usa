import { db } from '../../src/lib/db.ts';
import { statusFor, trendFor } from '../../src/lib/flood.ts';
import { toCfs, val, type NwpsStageflow } from './nwps.ts';

const OBS_SPACING_MS = 15 * 60_000;
export const OBS_RETENTION_DAYS = 30;

// Guarda observado (raleado a 1 punto cada 15 min) y reemplaza el pronóstico.
// Devuelve true si el medidor tiene pronóstico vigente.
export async function saveStageflow(gaugeId: number, sf: NwpsStageflow): Promise<boolean> {
  const obs = sf.observed;
  if (obs?.data?.length) {
    const rows: unknown[][] = [];
    let lastT = 0;
    for (const p of obs.data) {
      const t = Date.parse(p.validTime);
      const stage = val(p.primary);
      if (stage == null || t - lastT < OBS_SPACING_MS) continue;
      lastT = t;
      rows.push([gaugeId, new Date(t), stage, toCfs(p.secondary, obs.secondaryUnits), 'nwps']);
    }
    await insertObservations(rows);
  }

  const fc = sf.forecast;
  const fcRows = (fc?.data ?? [])
    .filter((p) => val(p.primary) != null)
    .map((p) => [gaugeId, new Date(p.validTime), new Date(fc!.issuedTime), val(p.primary), toCfs(p.secondary, fc!.secondaryUnits)]);
  const conn = await db().getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM forecasts WHERE gauge_id = ?', [gaugeId]);
    if (fcRows.length) await conn.query('INSERT INTO forecasts (gauge_id, valid_at, issued_at, stage_ft, flow_cfs) VALUES ?', [fcRows]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return fcRows.length > 0;
}

export async function insertObservations(rows: unknown[][]) {
  for (let i = 0; i < rows.length; i += 1000) {
    await db().query(
      `INSERT INTO observations (gauge_id, observed_at, stage_ft, flow_cfs, source) VALUES ?
       ON DUPLICATE KEY UPDATE stage_ft = VALUES(stage_ft), flow_cfs = VALUES(flow_cfs), source = VALUES(source)`,
      [rows.slice(i, i + 1000)],
    );
  }
}

// Recalcula nivel actual, semáforo, tendencia y cresta pronosticada a partir de lo guardado.
export async function recomputeDerived(gaugeIds: number[]) {
  if (!gaugeIds.length) return;
  const since = new Date(Date.now() - 6 * 3600_000);
  const [gauges] = await db().query<any[]>(
    'SELECT id, action_ft, minor_ft, moderate_ft, major_ft FROM gauges WHERE id IN (?)',
    [gaugeIds],
  );
  const [obs] = await db().query<any[]>(
    `SELECT gauge_id, observed_at, stage_ft, flow_cfs FROM observations
     WHERE gauge_id IN (?) AND observed_at >= ? ORDER BY gauge_id, observed_at`,
    [gaugeIds, since],
  );
  const [latest] = await db().query<any[]>(
    `SELECT o.gauge_id, o.observed_at, o.stage_ft, o.flow_cfs FROM observations o
     JOIN (SELECT gauge_id, MAX(observed_at) m FROM observations WHERE gauge_id IN (?) GROUP BY gauge_id) x
       ON x.gauge_id = o.gauge_id AND x.m = o.observed_at`,
    [gaugeIds],
  );
  const [crests] = await db().query<any[]>(
    `SELECT f.gauge_id, f.valid_at, f.stage_ft FROM forecasts f
     JOIN (SELECT gauge_id, MAX(stage_ft) m FROM forecasts WHERE gauge_id IN (?) AND valid_at > NOW() GROUP BY gauge_id) x
       ON x.gauge_id = f.gauge_id AND x.m = f.stage_ft
     WHERE f.valid_at > NOW() ORDER BY f.valid_at`,
    [gaugeIds],
  );

  const byGauge = new Map<number, { t: Date; v: number }[]>();
  for (const o of obs) {
    if (o.stage_ft == null) continue;
    if (!byGauge.has(o.gauge_id)) byGauge.set(o.gauge_id, []);
    byGauge.get(o.gauge_id)!.push({ t: o.observed_at, v: o.stage_ft });
  }
  const latestBy = new Map(latest.map((l) => [l.gauge_id, l]));
  const crestBy = new Map<number, any>();
  for (const c of crests) if (!crestBy.has(c.gauge_id)) crestBy.set(c.gauge_id, c);

  const now = new Date();
  for (const g of gauges) {
    let l = latestBy.get(g.id);
    // Un dato de más de un día no sirve para el semáforo.
    if (l && now.getTime() - l.observed_at.getTime() > 86400_000) l = undefined;
    const c = crestBy.get(g.id);
    await db().execute(
      `UPDATE gauges SET stage_ft = ?, flow_cfs = ?, observed_at = ?, status = ?, trend = ?,
         forecast_crest_ft = ?, forecast_crest_at = ?, forecast_status = ?, levels_updated_at = ? WHERE id = ?`,
      [
        l?.stage_ft ?? null,
        l?.flow_cfs ?? null,
        l?.observed_at ?? null,
        statusFor(l?.stage_ft, g),
        trendFor(byGauge.get(g.id) ?? []),
        c?.stage_ft ?? null,
        c?.valid_at ?? null,
        statusFor(c?.stage_ft, g),
        now,
        g.id,
      ],
    );
  }
}

export async function pruneObservations() {
  await db().execute('DELETE FROM observations WHERE observed_at < ?', [new Date(Date.now() - OBS_RETENTION_DAYS * 86400_000)]);
}

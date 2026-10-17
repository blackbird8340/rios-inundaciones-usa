import { db } from './db.ts';

export type GaugeRow = {
  id: number; slug: string; lid: string | null; usgs_id: string | null; name: string; place_name: string | null;
  state_code: string; state_name: string; state_slug: string; county_name: string | null; county_fips: string | null;
  river_name: string | null; river_slug: string | null; lat: number; lon: number; time_zone: string | null;
  wfo: string | null; upstream_lid: string | null; downstream_lid: string | null; in_service: number; has_forecast: number;
  action_ft: number | null; minor_ft: number | null; moderate_ft: number | null; major_ft: number | null;
  stage_ft: number | null; flow_cfs: number | null; observed_at: Date | null; status: string; trend: string | null;
  forecast_crest_ft: number | null; forecast_crest_at: Date | null; forecast_status: string; levels_updated_at: Date | null;
};

export async function getGaugePage(slug: string) {
  const [[gauge]] = await db().execute<any[]>(
    `SELECT g.*, s.name state_name, s.slug state_slug, r.name river_name, r.slug river_slug
     FROM gauges g JOIN states s ON s.code = g.state_code LEFT JOIN rivers r ON r.id = g.river_id
     WHERE g.slug = ?`,
    [slug],
  );
  if (!gauge) return null;
  const g = gauge as GaugeRow;
  const weekAgo = new Date(Date.now() - 7 * 86400_000);

  const [[impacts], [crests], [observations], [forecast], [alerts], [neighbors], [lastObs]] = await Promise.all([
    db().execute<any[]>('SELECT stage_ft, statement FROM gauge_impacts WHERE gauge_id = ? ORDER BY stage_ft DESC', [g.id]),
    db().execute<any[]>(
      `SELECT occurred_at, stage_ft, preliminary FROM gauge_crests WHERE gauge_id = ? AND kind = 'historic'
       ORDER BY stage_ft DESC LIMIT 5`,
      [g.id],
    ),
    db().execute<any[]>('SELECT observed_at t, stage_ft v FROM observations WHERE gauge_id = ? AND observed_at >= ? ORDER BY observed_at', [g.id, weekAgo]),
    db().execute<any[]>('SELECT valid_at t, stage_ft v, issued_at FROM forecasts WHERE gauge_id = ? ORDER BY valid_at', [g.id]),
    g.county_fips
      ? db().execute<any[]>(
          `SELECT a.* FROM alerts a JOIN alert_counties ac ON ac.alert_id = a.id
           WHERE ac.county_fips = ? AND (a.expires_at IS NULL OR a.expires_at > NOW()) ORDER BY a.sent_at DESC`,
          [g.county_fips],
        )
      : Promise.resolve([[]] as any),
    db().execute<any[]>(
      'SELECT lid, slug, name, stage_ft, status FROM gauges WHERE lid IN (?, ?)',
      [g.upstream_lid ?? '', g.downstream_lid ?? ''],
    ),
    db().execute<any[]>('SELECT observed_at, stage_ft, flow_cfs FROM observations WHERE gauge_id = ? ORDER BY observed_at DESC LIMIT 1', [g.id]),
  ]);
  const [[alertsRun]] = await db().execute<any[]>(
    "SELECT MAX(finished_at) t FROM ingest_runs WHERE job = 'alerts' AND ok",
  );

  return {
    gauge: g,
    impacts: impacts as { stage_ft: number; statement: string }[],
    crests: crests as { occurred_at: Date; stage_ft: number; preliminary: number }[],
    observations: observations as { t: Date; v: number }[],
    forecast: forecast as { t: Date; v: number; issued_at: Date }[],
    alerts: alerts as any[],
    alertsCheckedAt: (alertsRun?.t as Date | null) ?? null,
    upstream: (neighbors as any[]).find((n) => n.lid === g.upstream_lid) ?? null,
    downstream: (neighbors as any[]).find((n) => n.lid === g.downstream_lid) ?? null,
    lastObservation: (lastObs as any[])[0] ?? null,
  };
}

export async function listGauges() {
  const [rows] = await db().execute<any[]>(
    `SELECT g.slug, g.name, g.state_code, g.stage_ft, g.status, g.observed_at FROM gauges g ORDER BY g.state_code, g.name`,
  );
  return rows as { slug: string; name: string; state_code: string; stage_ft: number | null; status: string; observed_at: Date | null }[];
}

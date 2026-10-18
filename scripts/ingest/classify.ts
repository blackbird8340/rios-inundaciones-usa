// Clasifica medidores en river | reservoir | tidal para excluir embalses y marea de "Rising fastest".
// 1) USGS site_tp_cd (servicio de sitios NWIS): LK = lago/embalse; ES, OC, OC-CO, ST-TS = marea/estuario/costa.
// 2) Heurísticas por nombre/datum cuando no hay usgs_id o USGS no responde (ver README de abajo):
//    tidal: "MLLW" o "NAVD" en el nombre, o Sound/Inlet/Bay/Ocean/Atlantic/Harbor.
//    reservoir: Lake/Reservoir/Pool, "Central PA Dams", "above ... Dam" (no Tailwater/below/Lock and Dam),
//               o umbrales/nivel > 300 ft (cota de embalse, no altura de río).
// 3) Señal de marea en los datos: ≥24 cambios de dirección (>0.15 ft) en 7 días de promedios horarios
//    (~2 ciclos por día). Atrapa estuarios que USGS marca como ST. Puede fallar con sensores ruidosos.
// Uso: npm run ingest:classify
import { db } from '../../src/lib/db.ts';
import { runJob } from '../lib/run.ts';

const TIDAL_USGS = new Set(['ES', 'OC', 'OC-CO', 'ST-TS']);

// El servicio responde 400 si algún id del lote no existe: partimos el lote hasta aislarlo.
async function usgsTypes(ids: string[], out = new Map<string, string>()): Promise<Map<string, string>> {
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await fetch(`https://waterservices.usgs.gov/nwis/site/?format=rdb&siteStatus=all&sites=${chunk.join(',')}`);
    if (res.status === 400 || res.status === 404) {
      if (chunk.length > 1) {
        const mid = Math.ceil(chunk.length / 2);
        await usgsTypes(chunk.slice(0, mid), out);
        await usgsTypes(chunk.slice(mid), out);
      }
      continue;
    }
    if (!res.ok) throw new Error(`USGS site service ${res.status}`);
    for (const line of (await res.text()).split('\n')) {
      const f = line.split('\t');
      if (f[0] === 'USGS' && f[3]) out.set(f[1], f[3]);
    }
  }
  return out;
}

async function tidalCycles(): Promise<Map<number, number>> {
  const [rows] = await db().query<any[]>(
    `SELECT gauge_id, DATE_FORMAT(observed_at, '%Y-%m-%d %H') h, AVG(stage_ft) v FROM observations
     WHERE observed_at > UTC_TIMESTAMP() - INTERVAL 7 DAY GROUP BY gauge_id, h ORDER BY gauge_id, h`,
  );
  const series = new Map<number, number[]>();
  for (const r of rows) (series.get(r.gauge_id) ?? series.set(r.gauge_id, []).get(r.gauge_id)!).push(Number(r.v));
  const out = new Map<number, number>();
  for (const [id, v] of series) {
    let dir = 0, ext = v[0], n = 0;
    for (const x of v) {
      if (dir >= 0 && x < ext - 0.15) { if (dir === 1) n++; dir = -1; ext = x; }
      else if (dir <= 0 && x > ext + 0.15) { if (dir === -1) n++; dir = 1; ext = x; }
      else if ((dir === 1 && x > ext) || (dir === -1 && x < ext)) ext = x;
    }
    out.set(id, n);
  }
  return out;
}

function heuristicType(name: string, maxLevel: number | null): { type: 'river' | 'reservoir' | 'tidal'; source: string } | null {
  if (/\bMLLW\b|\bNAVD/i.test(name)) return { type: 'tidal', source: 'name:datum' };
  if (/\b(Sound|Inlet|Bay|Ocean|Atlantic|Harbor)\b/i.test(name)) return { type: 'tidal', source: 'name:water-body' };
  if (/tailwater|below .*dam|lock and dam|L\/D/i.test(name)) return null;
  if (/\b(Lake|Reservoir|Pool)\b|Central PA Dams|above .*Dam\b|\bDam$/i.test(name)) return { type: 'reservoir', source: 'name:reservoir' };
  if (maxLevel != null && maxLevel > 300) return { type: 'reservoir', source: 'level>300ft' };
  return null;
}

runJob('classify', async () => {
  // Agrega la columna si la base es anterior al cambio de esquema (MySQL/TiDB no tienen ADD COLUMN IF NOT EXISTS en todos lados).
  const [cols] = await db().query<any[]>("SHOW COLUMNS FROM gauges LIKE 'gauge_type'");
  if (!cols.length) {
    await db().query("ALTER TABLE gauges ADD COLUMN gauge_type ENUM('river','reservoir','tidal') NOT NULL DEFAULT 'river', ADD COLUMN gauge_type_source VARCHAR(40) NULL");
  }
  const [gauges] = await db().query<any[]>(
    'SELECT id, name, usgs_id, GREATEST(COALESCE(action_ft,0), COALESCE(minor_ft,0), COALESCE(stage_ft,0)) lvl FROM gauges',
  );
  let types = new Map<string, string>();
  try {
    types = await usgsTypes([...new Set(gauges.map((g) => g.usgs_id).filter(Boolean) as string[])]);
  } catch (err) {
    console.warn('USGS site types unavailable, using name heuristics only', err);
  }
  const cycles = await tidalCycles();
  const counts: Record<string, number> = {};
  for (const g of gauges) {
    const tp = g.usgs_id ? types.get(g.usgs_id) : undefined;
    let r: { type: string; source: string } = { type: 'river', source: tp ? `usgs:${tp}` : 'default' };
    if (tp === 'LK') r = { type: 'reservoir', source: 'usgs:LK' };
    else if (tp && TIDAL_USGS.has(tp)) r = { type: 'tidal', source: `usgs:${tp}` };
    else r = heuristicType(g.name, g.lvl) ?? r;
    if (r.type === 'river' && (cycles.get(g.id) ?? 0) >= 24) r = { type: 'tidal', source: 'obs:tidal-cycle' };
    counts[r.type] = (counts[r.type] ?? 0) + 1;
    await db().execute('UPDATE gauges SET gauge_type = ?, gauge_type_source = ? WHERE id = ?', [r.type, r.source, g.id]);
  }
  return Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ');
});

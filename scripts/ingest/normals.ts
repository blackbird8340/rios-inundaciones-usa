// Diario: percentiles de caudal (00060) por día del año para los sitios USGS de los medidores.
// Refresca como máximo --limit sitios por corrida (default 150), los que faltan o tienen más de 60 días,
// para no gastar el cupo de 1.000 requests/hora de la API key. Uso: npm run ingest:normals [-- --limit 50]
import { db } from '../../src/lib/db.ts';
import { fetchJson, HttpError, usgsHeaders } from '../../src/lib/http.ts';
import { USGS_STATS_BASE } from '../../src/lib/config.ts';
import { arg, pool, runJob } from '../lib/run.ts';

type Resp = { features: { properties: { data: { parameter_code: string; values: { time_of_year: string; time_of_year_type: string; values: string[]; percentiles: string[]; sample_count: number }[] }[] } }[] };
const KEYS = ['5', '10', '25', '50', '75', '90', '95'];

runJob('normals', async () => {
  const limit = Math.max(1, Number(arg('limit') ?? 150));
  const [sites] = await db().query<any[]>(
    `SELECT DISTINCT g.usgs_id FROM gauges g LEFT JOIN flow_normals_sites s ON s.usgs_id = g.usgs_id
     WHERE g.usgs_id IS NOT NULL AND (s.usgs_id IS NULL OR s.fetched_at < NOW() - INTERVAL 60 DAY)
     ORDER BY s.fetched_at IS NOT NULL, s.fetched_at LIMIT ${limit}`,
  );
  let withData = 0;
  const errors = await pool(sites.map((s) => s.usgs_id as string), 3, async (id) => {
    let res: Resp | null = null;
    try {
      res = await fetchJson<Resp>(
        `${USGS_STATS_BASE}/observationNormals?monitoring_location_id=USGS-${id}&parameter_code=00060&computation_type=percentile`,
        { headers: usgsHeaders(), timeoutMs: 60_000, retries: 2 },
      );
    } catch (err) {
      if (!(err instanceof HttpError && err.status === 404)) throw err;
    }
    const rows: (string | number | null)[][] = [];
    for (const f of res?.features ?? []) for (const d of f.properties.data) {
      if (d.parameter_code !== '00060') continue;
      for (const v of d.values) {
        if (v.time_of_year_type !== 'day_of_year' || !/^\d\d-\d\d$/.test(v.time_of_year)) continue;
        const m = new Map(v.percentiles.map((p, i) => [String(Number(p)), v.values[i] == null ? null : Number(v.values[i])]));
        rows.push([id, v.time_of_year, ...KEYS.map((k) => (Number.isFinite(m.get(k)) ? m.get(k)! : null)), v.sample_count ?? null]);
      }
    }
    if (rows.length) {
      withData++;
      await db().query(
        `INSERT INTO flow_normals (usgs_id, doy, p05, p10, p25, p50, p75, p90, p95, years) VALUES ?
         ON DUPLICATE KEY UPDATE p05=VALUES(p05), p10=VALUES(p10), p25=VALUES(p25), p50=VALUES(p50), p75=VALUES(p75), p90=VALUES(p90), p95=VALUES(p95), years=VALUES(years)`,
        [rows],
      );
    }
    await db().execute('REPLACE INTO flow_normals_sites (usgs_id, fetched_at, ok) VALUES (?, NOW(), ?)', [id, rows.length > 0]);
  });
  if (errors.length) console.error(`${errors.length} sites failed`, String(errors[0].err));
  return `${sites.length} sites checked, ${withData} with flow percentiles, ${errors.length} errors`;
});

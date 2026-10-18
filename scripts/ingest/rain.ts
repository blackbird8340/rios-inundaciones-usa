// Cada corrida: lluvia pronosticada 72 h de WPC (NOAA MapServer, capa "QPF 72 Hour Day 1-3") en cada medidor.
// Una sola consulta por corrida (contornos para el bbox de los estados) + punto-en-polígono local.
import { db } from '../../src/lib/db.ts';
import { fetchJson } from '../../src/lib/http.ts';
import { STATES, WPC_QPF_72H } from '../../src/lib/config.ts';
import { runJob } from '../lib/run.ts';

type F = { properties: { qpf: number; start_time: string; end_time: string; issue_time: string }; geometry: { type: string; coordinates: any } | null };

const inRing = (x: number, y: number, r: number[][]) => {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
// GeoJSON de ArcGIS: anillos exteriores y agujeros mezclados; la paridad par/impar los resuelve.
const contains = (g: F['geometry'], x: number, y: number) => {
  if (!g) return false;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  let n = 0;
  for (const p of polys) for (const r of p) if (inRing(x, y, r)) n++;
  return n % 2 === 1;
};
const utc = (s: string) => (s ? new Date(s.replace(' ', 'T') + 'Z') : null);

runJob('rain', async () => {
  const xs = STATES.flatMap((s) => [s.bbox[0], s.bbox[2]]), ys = STATES.flatMap((s) => [s.bbox[1], s.bbox[3]]);
  const env = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].join(',');
  const url = `${WPC_QPF_72H}/query?where=1%3D1&outFields=qpf,start_time,end_time,issue_time&geometry=${env}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outSR=4326&geometryPrecision=3&f=geojson`;
  const fc = await fetchJson<{ features: F[] }>(url, { timeoutMs: 90_000 });
  const bands = fc.features.filter((f) => f.geometry && Number.isFinite(f.properties.qpf)).sort((a, b) => a.properties.qpf - b.properties.qpf);
  const levels = [...new Set(bands.map((b) => b.properties.qpf))];
  const [gauges] = await db().query<any[]>('SELECT id, lat, lon FROM gauges');
  const rows: any[][] = [];
  for (const g of gauges) {
    const x = Number(g.lon), y = Number(g.lat);
    let hit: F | null = null;
    for (const b of bands) if ((!hit || b.properties.qpf > hit.properties.qpf) && contains(b.geometry, x, y)) hit = b;
    const p = hit?.properties;
    const q = p?.qpf ?? 0;
    const next = p ? levels.find((l) => l > q) ?? null : (levels[0] ?? 0.01);
    rows.push([g.id, q, next, utc(p?.start_time ?? bands[0]?.properties.start_time), utc(p?.end_time ?? bands[0]?.properties.end_time), utc(p?.issue_time ?? bands[0]?.properties.issue_time)]);
  }
  await db().query('DELETE FROM gauge_rain');
  if (rows.length) await db().query('INSERT INTO gauge_rain (gauge_id, qpf_in, next_in, valid_from, valid_to, issued_at) VALUES ?', [rows]);
  const wet = rows.filter((r) => r[1] >= 0.5).length;
  return `${bands.length} QPF bands, ${rows.length} gauges, ${wet} with 0.5in+`;
});

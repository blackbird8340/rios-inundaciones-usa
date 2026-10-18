// Cada 15 min: alertas de crecida activas de api.weather.gov por estado.
// Uso: npm run ingest:alerts
import { db, withDeadlockRetry } from '../../src/lib/db.ts';
import { fetchJson } from '../../src/lib/http.ts';
import { NWS_API_BASE } from '../../src/lib/config.ts';
import { runJob, selectedStates } from '../lib/run.ts';

const FLOOD_EVENT = /flood|hydrologic/i;

type Geometry = { type: string; coordinates: any } | null;
type Alert = {
  geometry: Geometry;
  properties: {
    affectedZones?: string[];
    id: string; event: string; severity: string; headline: string | null; description: string | null;
    instruction: string | null; areaDesc: string; senderName: string; sent: string; onset: string | null;
    expires: string | null; ends: string | null; geocode: { SAME?: string[] };
  };
};

// Redondea a 2 decimales (~1 km, alcanza para el mapa) y saca puntos repetidos para achicar el GeoJSON.
const r2 = (n: number) => Math.round(n * 100) / 100;
const ring = (pts: number[][]) => {
  const out: number[][] = [];
  for (const p of pts) { const q = [r2(p[0]), r2(p[1])]; const l = out[out.length - 1]; if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q); }
  return out.length >= 4 ? out : null;
};
const round = (c: any): any => (typeof c[0][0] === 'number' ? ring(c) : c.map(round).filter((x: any) => x && x.length));
const polys = (g: Geometry): any[] => (!g ? [] : g.type === 'Polygon' ? [round(g.coordinates)] : g.type === 'MultiPolygon' ? round(g.coordinates) : []);

async function zoneGeometry(url: string): Promise<Geometry> {
  const [[row]] = await db().execute<any[]>('SELECT geojson FROM nws_zones WHERE zone_url = ? AND fetched_at > NOW() - INTERVAL 30 DAY', [url]);
  if (row) return row.geojson ? JSON.parse(row.geojson) : null;
  let geom: Geometry = null;
  try {
    geom = (await fetchJson<{ geometry: Geometry }>(url, { headers: { Accept: 'application/geo+json' }, retries: 1 })).geometry;
  } catch (err) {
    console.error(`zone ${url} failed`, String(err));
    return null; // sin cachear el error: se reintenta en la próxima corrida
  }
  const slim = geom ? { type: 'MultiPolygon', coordinates: polys(geom) } : null;
  await db().execute('REPLACE INTO nws_zones (zone_url, geojson, fetched_at) VALUES (?, ?, NOW())', [url, slim ? JSON.stringify(slim) : null]);
  return slim;
}

async function alertShape(f: Alert): Promise<string | null> {
  let parts = polys(f.geometry);
  if (!parts.length) {
    for (const z of (f.properties.affectedZones ?? []).slice(0, 60)) {
      if (!z.startsWith(NWS_API_BASE + '/zones/')) continue;
      parts = parts.concat(polys(await zoneGeometry(z)));
    }
  }
  return parts.length ? JSON.stringify({ type: 'MultiPolygon', coordinates: parts }) : null;
}

runJob('alerts', async () => {
  const seen = new Set<string>();
  let allOk = true;
  const now = new Date();

  for (const state of selectedStates()) {
    let features: Alert[];
    try {
      const res = await fetchJson<{ features: Alert[] }>(`${NWS_API_BASE}/alerts/active?area=${state.code}`, {
        headers: { Accept: 'application/geo+json' },
      });
      features = res.features;
    } catch (err) {
      console.error(`alerts failed for ${state.code}`, err);
      allOk = false;
      continue;
    }
    for (const feature of features) {
      const a = feature.properties;
      if (!FLOOD_EVENT.test(a.event)) continue;
      seen.add(a.id);
      const d = (s: string | null) => (s ? new Date(s) : null);
      await withDeadlockRetry(() => db().execute(
        `INSERT INTO alerts (id, event, severity, headline, description, instruction, area_desc, sender_name, sent_at, onset_at, expires_at, ends_at, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE headline = VALUES(headline), description = VALUES(description), instruction = VALUES(instruction),
           expires_at = VALUES(expires_at), ends_at = VALUES(ends_at), fetched_at = VALUES(fetched_at)`,
        [a.id, a.event, a.severity, a.headline, a.description, a.instruction, a.areaDesc, a.senderName, d(a.sent), d(a.onset), d(a.expires), d(a.ends), now],
      ));
      // SAME = "0" + FIPS de estado (2) + condado (3)
      const fips = (a.geocode?.SAME ?? []).map((s) => s.slice(-5));
      if (fips.length) await withDeadlockRetry(() => db().query('INSERT IGNORE INTO alert_counties (alert_id, county_fips) VALUES ?', [fips.map((f) => [a.id, f])]));
      try {
        const shape = await alertShape(feature);
        if (shape) await withDeadlockRetry(() => db().execute('REPLACE INTO alert_shapes (alert_id, geojson) VALUES (?, ?)', [a.id, shape]));
      } catch (err) {
        console.error(`shape failed for ${a.id}`, String(err)); // la forma es opcional: no tumba la ingesta
      }
    }
  }

  // Solo borramos las que ya no están activas si pudimos leer todos los estados.
  if (allOk) {
    const [old] = await db().query<any[]>('SELECT id FROM alerts');
    const gone = old.map((r) => r.id).filter((id) => !seen.has(id));
    if (gone.length) await withDeadlockRetry(() => db().query('DELETE FROM alerts WHERE id IN (?)', [gone]));
  } else {
    throw new Error('some states failed; kept previous alerts');
  }
  return `${seen.size} active flood alerts`;
});

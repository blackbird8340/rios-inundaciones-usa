// Diario: metadatos de medidores NWPS (categorías, impactos, crestas), condado (FIPS)
// y backfill de 30 días de observado + pronóstico.
// Uso: npm run ingest:meta [-- --state PA] [-- --lid PTTP1]
import { db, withDeadlockRetry } from '../../src/lib/db.ts';
import { fetchJson, usgsHeaders } from '../../src/lib/http.ts';
import { STATES, USGS_OGC_BASE, type StateConfig } from '../../src/lib/config.ts';
import { gaugeSlug, slugify, splitGaugeName } from '../../src/lib/slug.ts';
import { arg, pool, runJob, selectedStates } from '../lib/run.ts';
import { getGauge, getStageflow, listGauges, val, type NwpsGauge } from '../lib/nwps.ts';
import { recomputeDerived, saveStageflow } from '../lib/store.ts';

runJob('metadata', async () => {
  for (const s of STATES) {
    await db().execute('INSERT INTO states (code, name, slug) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), slug = VALUES(slug)', [s.code, s.name, s.slug]);
  }

  const onlyLid = arg('lid')?.toUpperCase();
  let plan: { state: StateConfig; lids?: string[] }[] = selectedStates().map((state) => ({ state }));
  if (onlyLid) {
    const code = (await getGauge(onlyLid)).state.abbreviation;
    const state = STATES.find((s) => s.code === code);
    if (!state) throw new Error(`${onlyLid} is in ${code}, not an MVP state`);
    plan = [{ state, lids: [onlyLid] }];
  }

  let total = 0;
  const failures: string[] = [];

  for (const { state, lids: given } of plan) {
    const lids = given ?? (await listGauges(state)).map((g) => g.lid);
    const countyByUsgs = await usgsCountyMap(state);
    const ids: number[] = [];

    const errors = await pool(lids, 4, async (lid) => {
      const g = await getGauge(lid);
      const id = await upsertGauge(g, state, countyByUsgs);
      const hasForecast = await saveStageflow(id, await getStageflow(lid));
      await db().execute('UPDATE gauges SET has_forecast = ? WHERE id = ?', [hasForecast, id]);
      ids.push(id);
    });
    await fillMissingCountyFips(state);
    await withDeadlockRetry(() => recomputeDerived(ids));
    total += ids.length;
    failures.push(...errors.map((e) => `${e.item}: ${e.err instanceof Error ? e.err.message : e.err}`));
  }

  if (failures.length) console.warn(`${failures.length} gauges failed:\n${failures.slice(0, 20).join('\n')}`);
  // Si falla más del 10 %, que el job quede como fallido.
  if (failures.length > Math.max(5, total * 0.1)) throw new Error(`${failures.length} failures, ${total} ok`);
  return `${total} gauges, ${failures.length} failed`;
});

async function upsertGauge(g: NwpsGauge, state: StateConfig, countyByUsgs: Map<string, string>): Promise<number> {
  const { river, place } = splitGaugeName(g.name);
  await db().execute('INSERT INTO rivers (name, slug) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)', [river, slugify(river)]);
  const [[r]] = await db().execute<any[]>('SELECT id FROM rivers WHERE slug = ?', [slugify(river)]);

  const cat = g.flood?.categories;
  const stage = (k: 'action' | 'minor' | 'moderate' | 'major') => val(cat?.[k]?.stage);
  const usgsId = g.usgsId || null;

  await db().execute(
    `INSERT INTO gauges (slug, lid, usgs_id, reach_id, name, river_id, place_name, state_code, county_name, county_fips,
       lat, lon, time_zone, wfo, rfc, upstream_lid, downstream_lid, in_service,
       action_ft, minor_ft, moderate_ft, major_ft, metadata_updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE slug = VALUES(slug), usgs_id = VALUES(usgs_id), reach_id = VALUES(reach_id), name = VALUES(name),
       river_id = VALUES(river_id), place_name = VALUES(place_name), state_code = VALUES(state_code),
       county_name = VALUES(county_name), county_fips = COALESCE(VALUES(county_fips), county_fips),
       lat = VALUES(lat), lon = VALUES(lon), time_zone = VALUES(time_zone), wfo = VALUES(wfo), rfc = VALUES(rfc),
       upstream_lid = VALUES(upstream_lid), downstream_lid = VALUES(downstream_lid), in_service = VALUES(in_service),
       action_ft = VALUES(action_ft), minor_ft = VALUES(minor_ft), moderate_ft = VALUES(moderate_ft), major_ft = VALUES(major_ft),
       metadata_updated_at = VALUES(metadata_updated_at)`,
    [
      gaugeSlug(g.name, g.lid), g.lid, usgsId, g.reachId || null, g.name, r.id, place, state.code, g.county || null,
      usgsId ? (countyByUsgs.get(usgsId) ?? null) : null,
      g.latitude, g.longitude, g.timeZone || null, g.wfo?.abbreviation ?? null, g.rfc?.abbreviation ?? null,
      g.upstreamLid || null, g.downstreamLid || null, g.inService?.enabled ?? true,
      stage('action'), stage('minor'), stage('moderate'), stage('major'), new Date(),
    ],
  );
  const [[row]] = await db().execute<any[]>('SELECT id FROM gauges WHERE lid = ?', [g.lid]);
  const id: number = row.id;

  const impacts = (g.flood?.impacts ?? []).filter((i) => val(i.stage) != null && i.statement?.trim());
  const crests = (['historic', 'recent'] as const).flatMap((kind) =>
    (g.flood?.crests?.[kind] ?? [])
      .filter((c) => val(c.stage) != null && c.occurredTime)
      .map((c) => [id, kind, c.occurredTime.slice(0, 10), c.stage, c.preliminary === 'P']),
  );
  const conn = await db().getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM gauge_impacts WHERE gauge_id = ?', [id]);
    await conn.execute('DELETE FROM gauge_crests WHERE gauge_id = ?', [id]);
    if (impacts.length) await conn.query('INSERT INTO gauge_impacts (gauge_id, stage_ft, statement) VALUES ?', [impacts.map((i) => [id, i.stage, i.statement.trim()])]);
    if (crests.length) await conn.query('INSERT IGNORE INTO gauge_crests (gauge_id, kind, occurred_at, stage_ft, preliminary) VALUES ?', [crests]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return id;
}

// usgs site number → FIPS de condado (5 dígitos), una sola llamada por estado.
async function usgsCountyMap(state: StateConfig): Promise<Map<string, string>> {
  const url = `${USGS_OGC_BASE}/collections/monitoring-locations/items?state_code=${state.fips}&site_type_code=ST&properties=county_code&skipGeometry=true&limit=10000&f=json`;
  const res = await fetchJson<{ features: { id: string; properties: { county_code: string | null } }[] }>(url, { headers: usgsHeaders(), timeoutMs: 60_000 });
  const map = new Map<string, string>();
  for (const f of res.features) {
    if (f.properties.county_code) map.set(f.id.replace(/^USGS-/, ''), state.fips + f.properties.county_code);
  }
  return map;
}

// Medidores sin USGS (o fuera del listado): FIPS por coordenadas con el Census Geocoder.
async function fillMissingCountyFips(state: StateConfig) {
  const [rows] = await db().execute<any[]>('SELECT id, lat, lon FROM gauges WHERE state_code = ? AND county_fips IS NULL', [state.code]);
  await pool(rows, 2, async (g) => {
    const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${g.lon}&y=${g.lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties&format=json`;
    const res = await fetchJson<any>(url, { timeoutMs: 30_000 });
    const county = res?.result?.geographies?.Counties?.[0];
    if (county?.GEOID) await db().execute('UPDATE gauges SET county_fips = ? WHERE id = ?', [county.GEOID, g.id]);
  });
}

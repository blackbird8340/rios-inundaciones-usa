// Cada 15 min: nivel actual de todos los medidores (1 llamada NWPS por estado).
// Si NWPS falla para un estado, usa USGS latest-continuous para los medidores con usgs_id.
// Uso: npm run ingest:levels [-- --state PA]
import { db } from '../../src/lib/db.ts';
import { fetchJson, usgsHeaders } from '../../src/lib/http.ts';
import { USGS_OGC_BASE, type StateConfig } from '../../src/lib/config.ts';
import { runJob, selectedStates } from '../lib/run.ts';
import { listGauges, toCfs, val } from '../lib/nwps.ts';
import { insertObservations, pruneObservations, recomputeDerived } from '../lib/store.ts';

runJob('levels', async () => {
  const notes: string[] = [];
  let failedStates = 0;
  for (const state of selectedStates()) {
    const [gauges] = await db().execute<any[]>('SELECT id, lid, usgs_id FROM gauges WHERE state_code = ?', [state.code]);
    if (!gauges.length) continue;
    try {
      const n = await fromNwps(state, gauges);
      notes.push(`${state.code}: ${n} nwps`);
    } catch (err) {
      console.warn(`NWPS failed for ${state.code}, falling back to USGS`, err);
      try {
        const n = await fromUsgs(state, gauges);
        notes.push(`${state.code}: ${n} usgs (fallback)`);
      } catch (err2) {
        console.error(`USGS fallback failed for ${state.code}`, err2);
        failedStates++;
      }
    }
    await recomputeDerived(gauges.map((g) => g.id));
  }
  await pruneObservations();
  if (failedStates) throw new Error(`${failedStates} states without data. ${notes.join(', ')}`);
  return notes.join(', ');
});

async function fromNwps(state: StateConfig, gauges: any[]): Promise<number> {
  const idByLid = new Map(gauges.map((g) => [g.lid, g.id]));
  const rows: unknown[][] = [];
  for (const g of await listGauges(state)) {
    const id = idByLid.get(g.lid);
    const o = g.status?.observed;
    const stage = val(o?.primary);
    if (!id || stage == null || !o.validTime || o.validTime.startsWith('0001')) continue;
    rows.push([id, new Date(o.validTime), stage, toCfs(o.secondary, o.secondaryUnit), 'nwps']);
  }
  await insertObservations(rows);
  return rows.length;
}

// Ojo: el nivel de USGS coincide con el de NWS en la gran mayoría de medidores con usgs_id,
// pero no está garantizado; por eso solo se usa como respaldo.
async function fromUsgs(state: StateConfig, gauges: any[]): Promise<number> {
  const idByUsgs = new Map(gauges.filter((g) => g.usgs_id).map((g) => [g.usgs_id, g.id]));
  const fetchParam = async (code: string) => {
    const url = `${USGS_OGC_BASE}/collections/latest-continuous/items?state_code=${state.fips}&parameter_code=${code}&properties=monitoring_location_id,time,value&skipGeometry=true&limit=10000&f=json`;
    const res = await fetchJson<{ features: { properties: { monitoring_location_id: string; time: string; value: string } }[] }>(url, { headers: usgsHeaders(), timeoutMs: 60_000 });
    return new Map(res.features.map((f) => [f.properties.monitoring_location_id.replace(/^USGS-/, ''), f.properties]));
  };
  const [stages, flows] = await Promise.all([fetchParam('00065'), fetchParam('00060').catch(() => new Map())]);
  const rows: unknown[][] = [];
  for (const [usgsId, p] of stages) {
    const id = idByUsgs.get(usgsId);
    const stage = Number(p.value);
    if (!id || !Number.isFinite(stage)) continue;
    const flow = Number(flows.get(usgsId)?.value);
    rows.push([id, new Date(p.time), stage, Number.isFinite(flow) ? flow : null, 'usgs']);
  }
  await insertObservations(rows);
  return rows.length;
}

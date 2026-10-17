// Cada hora: pronóstico NWPS (stageflow) de los medidores con pronóstico.
// Uso: npm run ingest:forecasts [-- --state PA]
import { db } from '../../src/lib/db.ts';
import { pool, runJob, selectedStates } from '../lib/run.ts';
import { getStageflow } from '../lib/nwps.ts';
import { recomputeDerived, saveStageflow } from '../lib/store.ts';

runJob('forecasts', async () => {
  const codes = selectedStates().map((s) => s.code);
  const [gauges] = await db().query<any[]>('SELECT id, lid FROM gauges WHERE has_forecast AND in_service AND state_code IN (?)', [codes]);
  const errors = await pool(gauges, 4, async (g) => {
    await saveStageflow(g.id, await getStageflow(g.lid));
  });
  await recomputeDerived(gauges.map((g) => g.id));
  if (errors.length > Math.max(5, gauges.length * 0.1)) throw new Error(`${errors.length}/${gauges.length} failed`);
  return `${gauges.length - errors.length}/${gauges.length} forecasts`;
});

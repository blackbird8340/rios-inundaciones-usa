// Diario: webcams USGS HIVIS (api.waterdata.usgs.gov/nims) de los estados del sitio, ligadas por nwisId.
// Uso: npm run ingest:cameras
import { db } from '../../src/lib/db.ts';
import { fetchJson, usgsHeaders } from '../../src/lib/http.ts';
import { NIMS_BASE, STATES } from '../../src/lib/config.ts';
import { runJob } from '../lib/run.ts';

type Cam = { camId: string; nwisId?: string; camName: string; stateAbrv?: string; smallDir?: string; newestImageDT?: string; hideCam?: boolean };

runJob('cameras', async () => {
  const codes = new Set<string>(STATES.map((s) => s.code));
  const cams = (await fetchJson<Cam[]>(`${NIMS_BASE}/cameras?enabled=true`, { headers: usgsHeaders(), timeoutMs: 60_000 }))
    .filter((c) => c.nwisId && c.smallDir?.startsWith('https://') && !c.hideCam && codes.has(c.stateAbrv ?? ''));
  if (!cams.length) throw new Error('no cameras returned; kept previous');
  const now = new Date(Math.floor(Date.now() / 1000) * 1000); // DATETIME guarda segundos
  await db().query(
    `INSERT INTO cameras (cam_id, usgs_id, name, state_code, small_dir, newest_at, fetched_at) VALUES ?
     ON DUPLICATE KEY UPDATE usgs_id = VALUES(usgs_id), name = VALUES(name), small_dir = VALUES(small_dir),
       newest_at = VALUES(newest_at), fetched_at = VALUES(fetched_at)`,
    [cams.map((c) => [c.camId, c.nwisId, c.camName.slice(0, 200), c.stateAbrv, c.smallDir, c.newestImageDT ? new Date(c.newestImageDT) : null, now])],
  );
  await db().execute('DELETE FROM cameras WHERE fetched_at < ?', [now]);
  return `${cams.length} cameras`;
});

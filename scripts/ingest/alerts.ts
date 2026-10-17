// Cada 15 min: alertas de crecida activas de api.weather.gov por estado.
// Uso: npm run ingest:alerts
import { db, withDeadlockRetry } from '../../src/lib/db.ts';
import { fetchJson } from '../../src/lib/http.ts';
import { NWS_API_BASE } from '../../src/lib/config.ts';
import { runJob, selectedStates } from '../lib/run.ts';

const FLOOD_EVENT = /flood|hydrologic/i;

type Alert = {
  properties: {
    id: string; event: string; severity: string; headline: string | null; description: string | null;
    instruction: string | null; areaDesc: string; senderName: string; sent: string; onset: string | null;
    expires: string | null; ends: string | null; geocode: { SAME?: string[] };
  };
};

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
    for (const { properties: a } of features) {
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

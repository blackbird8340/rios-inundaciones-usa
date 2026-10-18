import { db } from './db.ts';
import { STATUS_META, statusFor, type Categories, type FloodStatus } from './flood.ts';
import { fmtTime } from './format.ts';

export type RisingRow = {
  slug: string; name: string; state_code: string; status: FloodStatus; stage_ft: number;
  observed_at: Date; ref_ft: number; ref_at: Date; rise_ft: number;
};

// Mayor subida en 24 h: último dato (de las últimas 3 h) contra la lectura más cercana a 24 h antes,
// tomada entre 22 y 26 h antes (si no hay lectura en esa ventana, el medidor queda afuera).
// Se excluyen los medidores de marea (nombre con "MLLW"), donde la subida diaria es la marea.
export async function getRisingFastest(limit = 10): Promise<RisingRow[]> {
  const since = new Date(Date.now() - 3 * 3600_000);
  const [rows] = await db().execute<any[]>(
    `SELECT g.slug, g.name, g.state_code, g.status, g.stage_ft, g.observed_at, o.stage_ft ref_ft, o.observed_at ref_at,
            g.stage_ft - o.stage_ft rise_ft
     FROM gauges g
     JOIN observations o ON o.gauge_id = g.id AND o.observed_at = (
       SELECT o2.observed_at FROM observations o2
       WHERE o2.gauge_id = g.id
         AND o2.observed_at BETWEEN g.observed_at - INTERVAL 26 HOUR AND g.observed_at - INTERVAL 22 HOUR
       ORDER BY ABS(TIMESTAMPDIFF(SECOND, o2.observed_at, g.observed_at - INTERVAL 24 HOUR)) LIMIT 1)
     WHERE g.stage_ft IS NOT NULL AND g.observed_at >= ? AND g.name NOT LIKE '%MLLW%'
       AND g.stage_ft - o.stage_ft > 0.05
     ORDER BY rise_ft DESC LIMIT ${Math.max(1, Math.min(100, Math.floor(limit)))}`,
    [since],
  );
  return rows as RisingRow[];
}

// Datos mínimos para el deslizador de impactos (home destacada).
export async function getImpactSliderData(slug: string) {
  const [[g]] = await db().execute<any[]>(
    'SELECT id, slug, name, state_code, stage_ft, action_ft, minor_ft, moderate_ft, major_ft FROM gauges WHERE slug = ?',
    [slug],
  );
  if (!g) return null;
  const [[impacts], [crests]] = await Promise.all([
    db().execute<any[]>('SELECT stage_ft, statement FROM gauge_impacts WHERE gauge_id = ? ORDER BY stage_ft DESC', [g.id]),
    db().execute<any[]>(
      "SELECT occurred_at, stage_ft FROM gauge_crests WHERE gauge_id = ? AND kind = 'historic' ORDER BY stage_ft DESC LIMIT 1",
      [g.id],
    ),
  ]);
  return {
    gauge: g as { slug: string; name: string; state_code: string; stage_ft: number | null } & Categories,
    impacts: impacts as { stage_ft: number; statement: string }[],
    record: (crests as { occurred_at: Date; stage_ft: number }[])[0] ?? null,
  };
}

const RANK: Record<FloodStatus, number> = { no_data: -1, normal: 0, action: 1, minor: 2, moderate: 3, major: 4 };
const NEXT: [keyof Categories, string][] = [
  ['action_ft', 'action stage'], ['minor_ft', 'flood stage'], ['moderate_ft', 'moderate flood stage'], ['major_ft', 'major flood stage'],
];

// Frase en lenguaje simple a partir del pronóstico NWS. Devuelve null si no hay pronóstico futuro.
export function forecastSentence(
  stage: number | null, observedAt: Date | null, forecast: { t: Date; v: number }[], cats: Categories, tz: string,
): string | null {
  const now = Math.max(Date.now(), observedAt?.getTime() ?? 0);
  const future = forecast.filter((p) => p.t.getTime() > now);
  if (!future.length || stage == null) return null;
  const peak = future.reduce((a, b) => (b.v > a.v ? b : a));
  const low = future.reduce((a, b) => (b.v < a.v ? b : a));
  const end = future[future.length - 1];
  const f = (n: number) => `${n.toFixed(1)} ft`;
  const when = (d: Date) => fmtTime(d, tz, true);
  const nowStatus = statusFor(stage, cats);

  const clause = (level: number) => {
    const st = statusFor(level, cats);
    if (RANK[st] > RANK[nowStatus]) return `, reaching ${STATUS_META[st].label.toLowerCase()}`;
    const next = NEXT.find(([k]) => cats[k] != null && level < cats[k]!);
    if (next && RANK[st] <= 0) return `, staying below ${next[1]} (${f(cats[next[0]]!)})`;
    return '';
  };

  if (peak.v - stage >= 0.1) {
    return `Expected to rise ${f(peak.v - stage)} to ${f(peak.v)} by ${when(peak.t)}${clause(peak.v)}.`;
  }
  if (stage - low.v >= 0.1) {
    const st = statusFor(low.v, cats);
    const tail = RANK[st] < RANK[nowStatus] && RANK[nowStatus] > 0 ? `, dropping to ${STATUS_META[st].label.toLowerCase()}` : clause(low.v);
    return `Expected to fall ${f(stage - low.v)} to ${f(low.v)} by ${when(low.t)}${tail}.`;
  }
  return `Expected to hold near ${f(stage)} through ${when(end.t)}${clause(peak.v)}.`;
}

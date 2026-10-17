import { fetchJson } from '../../src/lib/http.ts';
import { NWPS_BASE, type StateConfig } from '../../src/lib/config.ts';

type Reading = { primary: number; secondary: number; secondaryUnit: string; floodCategory: string; validTime: string };

export type NwpsListGauge = {
  lid: string;
  name: string;
  state: { abbreviation: string };
  latitude: number;
  longitude: number;
  status: { observed: Reading; forecast: Reading };
};

export type NwpsGauge = NwpsListGauge & {
  usgsId: string;
  reachId: string;
  county: string;
  timeZone: string;
  rfc: { abbreviation: string };
  wfo: { abbreviation: string };
  upstreamLid: string;
  downstreamLid: string;
  inService: { enabled: boolean };
  flood: {
    stageUnits: string;
    categories: Record<'action' | 'minor' | 'moderate' | 'major', { stage: number; flow: number }>;
    impacts: { stage: number; statement: string }[];
    crests: Record<'historic' | 'recent', { occurredTime: string; stage: number; preliminary: string }[]>;
  };
};

type Series = { issuedTime: string; secondaryUnits: string; data: { validTime: string; primary: number; secondary: number }[] };
export type NwpsStageflow = { observed?: Series; forecast?: Series };

export async function listGauges(state: StateConfig): Promise<NwpsListGauge[]> {
  const [xmin, ymin, xmax, ymax] = state.bbox;
  const url = `${NWPS_BASE}/gauges?bbox.xmin=${xmin}&bbox.ymin=${ymin}&bbox.xmax=${xmax}&bbox.ymax=${ymax}&srid=EPSG_4326`;
  const res = await fetchJson<{ gauges: NwpsListGauge[] }>(url, { timeoutMs: 60_000 });
  // El bbox toma medidores de estados vecinos.
  return res.gauges.filter((g) => g.state?.abbreviation === state.code);
}

export const getGauge = (lid: string) => fetchJson<NwpsGauge>(`${NWPS_BASE}/gauges/${lid}`);
export const getStageflow = (lid: string) => fetchJson<NwpsStageflow>(`${NWPS_BASE}/gauges/${lid}/stageflow`);

// NWPS usa -999 / -9999 como "sin dato".
export const val = (n: number | null | undefined) => (n == null || n <= -999 ? null : n);

export function toCfs(v: number | null | undefined, unit: string | undefined): number | null {
  const n = val(v);
  if (n == null) return null;
  return unit?.toLowerCase() === 'kcfs' ? Math.round(n * 1000) : n;
}

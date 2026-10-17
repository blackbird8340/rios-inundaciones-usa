export type FloodStatus = 'normal' | 'action' | 'minor' | 'moderate' | 'major' | 'no_data';

export type Categories = {
  action_ft: number | null;
  minor_ft: number | null;
  moderate_ft: number | null;
  major_ft: number | null;
};

export function statusFor(stage: number | null | undefined, c: Categories): FloodStatus {
  if (stage == null) return 'no_data';
  if (c.major_ft != null && stage >= c.major_ft) return 'major';
  if (c.moderate_ft != null && stage >= c.moderate_ft) return 'moderate';
  if (c.minor_ft != null && stage >= c.minor_ft) return 'minor';
  if (c.action_ft != null && stage >= c.action_ft) return 'action';
  return 'normal';
}

// Tendencia comparando con el valor de ~3 h antes. Umbral 0.1 ft para no marcar ruido.
export function trendFor(points: { t: Date; v: number }[]): 'rising' | 'falling' | 'steady' | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const target = last.t.getTime() - 3 * 3600_000;
  let ref = points[0];
  for (const p of points) {
    if (p.t.getTime() <= target) ref = p;
    else break;
  }
  if (ref === last) return null;
  const delta = last.v - ref.v;
  if (delta > 0.1) return 'rising';
  if (delta < -0.1) return 'falling';
  return 'steady';
}

// Colores de categorías de crecida de NWS (water.noaa.gov).
export const STATUS_META: Record<FloodStatus, { label: string; color: string }> = {
  normal: { label: 'Normal', color: '#00c853' },
  action: { label: 'Action stage', color: '#ffff00' },
  minor: { label: 'Minor flooding', color: '#ff9900' },
  moderate: { label: 'Moderate flooding', color: '#ff0000' },
  major: { label: 'Major flooding', color: '#cc33ff' },
  no_data: { label: 'No recent data', color: '#9e9e9e' },
};

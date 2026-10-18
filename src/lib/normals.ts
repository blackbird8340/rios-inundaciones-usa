import type { FlowNormals } from './queries.ts';

// Clases de USGS WaterWatch: percentil del caudal de hoy contra el mismo día de todos los años.
export type FlowClass = 'much_below' | 'below' | 'normal' | 'above' | 'much_above' | 'high';
export const FLOW_CLASS: Record<FlowClass, { label: string; color: string; plain: string }> = {
  much_below: { label: 'Much below normal', color: '#b2182b', plain: 'lower than 9 out of 10 years on this date' },
  below: { label: 'Below normal', color: '#f4a582', plain: 'lower than most years on this date' },
  normal: { label: 'Normal', color: '#4dac26', plain: 'in the typical range for this date' },
  above: { label: 'Above normal', color: '#67a9cf', plain: 'higher than most years on this date' },
  much_above: { label: 'Much above normal', color: '#2166ac', plain: 'higher than 9 out of 10 years on this date' },
  high: { label: 'Very high for the date', color: '#053061', plain: 'higher than 19 out of 20 years on this date' },
};

// Percentil aproximado interpolando entre los percentiles publicados.
export function flowPercentile(flow: number, n: FlowNormals): number | null {
  const pts = ([[5, n.p05], [10, n.p10], [25, n.p25], [50, n.p50], [75, n.p75], [90, n.p90], [95, n.p95]] as [number, number | null][])
    .filter((p): p is [number, number] => p[1] != null);
  if (pts.length < 3) return null;
  if (flow <= pts[0][1]) return pts[0][0] === 5 ? 3 : pts[0][0];
  if (flow >= pts[pts.length - 1][1]) return pts[pts.length - 1][0] === 95 ? 97 : pts[pts.length - 1][0];
  for (let i = 1; i < pts.length; i++) {
    const [pa, va] = pts[i - 1], [pb, vb] = pts[i];
    if (flow <= vb) return vb === va ? pb : pa + ((flow - va) / (vb - va)) * (pb - pa);
  }
  return null;
}

export function flowClass(p: number): FlowClass {
  if (p < 10) return 'much_below';
  if (p < 25) return 'below';
  if (p <= 75) return 'normal';
  if (p <= 90) return 'above';
  if (p <= 95) return 'much_above';
  return 'high';
}

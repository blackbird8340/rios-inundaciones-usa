// Pueblos (Census Gazetteer 2024, dominio público) con medidores cerca: páginas /<estado>/town/<pueblo>/.
import places from '../../public/search/places.json';
import { slugify } from './slug.ts';

export type Town = { name: string; state: string; lat: number; lon: number; slug: string };
export const TOWN_RADIUS_MI = 6;

const all: Town[] = (() => {
  const seen = new Map<string, number>();
  return (places as [string, string, number, number][]).map(([name, state, lat, lon]) => {
    const base = slugify(name);
    const k = `${state}/${base}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return { name, state, lat, lon, slug: n > 1 ? `${base}-${n}` : base };
  });
})();

export const townsIn = (state: string) => all.filter((t) => t.state === state);
export const findTown = (state: string, slug: string) => all.find((t) => t.state === state && t.slug === slug) ?? null;

export function miles(aLat: number, aLon: number, bLat: number, bLon: number) {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

// Pueblos que tienen al menos un medidor a menos de TOWN_RADIUS_MI (los demás serían páginas vacías).
export function townsWithGauges(state: string, gauges: { lat: number; lon: number }[]) {
  return townsIn(state).filter((t) => gauges.some((g) => miles(t.lat, t.lon, g.lat, g.lon) <= TOWN_RADIUS_MI));
}

import type { APIRoute } from 'astro';
import { getHomeData } from '../lib/queries.ts';

// Índice compacto para el buscador, "usar mi ubicación" y el mapa de la home.
// [slug, nombre, lugar, estado, río, condado, lat, lon, status, stage_ft]
export const GET: APIRoute = async () => {
  const { gauges } = await getHomeData();
  const rows = gauges.map((g) => [g.slug, g.name, g.place_name, g.state_code, g.river_name, g.county_name, g.lat, g.lon, g.status, g.stage_ft]);
  return new Response(JSON.stringify(rows), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
  });
};

import type { APIRoute } from 'astro';
import { listActiveAlerts } from '../lib/queries.ts';

// Alertas de crecida activas como GeoJSON (polígono o unión de zonas NWS). Lo usa el mapa de la home.
export const GET: APIRoute = async () => {
  let features: any[] = [];
  try {
    features = (await listActiveAlerts(true))
      .filter((a) => a.geojson)
      .map((a) => ({ type: 'Feature', geometry: JSON.parse(a.geojson), properties: { event: a.event, headline: a.headline ?? '' } }));
  } catch (err) {
    console.error('alerts.geojson', err);
    return new Response('{"type":"FeatureCollection","features":[]}', { status: 503, headers: { 'Content-Type': 'application/geo+json' } });
  }
  return new Response(JSON.stringify({ type: 'FeatureCollection', features }), {
    headers: { 'Content-Type': 'application/geo+json', 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
  });
};

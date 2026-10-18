import type { APIRoute } from 'astro';
import { db } from '../lib/db.ts';
import { siteOrigin } from '../lib/site.ts';
import { listCounties } from '../lib/queries.ts';

// Sitemap único (≈1.500 URLs, muy por debajo del límite de 50.000).
export const GET: APIRoute = async ({ url }) => {
  const o = siteOrigin(url.origin);
  const [[gauges], [states], [rivers], counties] = await Promise.all([
    db().execute<any[]>('SELECT slug, levels_updated_at FROM gauges ORDER BY slug'),
    db().execute<any[]>('SELECT slug FROM states'),
    db().execute<any[]>('SELECT DISTINCT r.slug FROM rivers r JOIN gauges g ON g.river_id = r.id ORDER BY r.slug'),
    listCounties(),
  ]);
  const u = (path: string, lastmod?: Date | null) =>
    `<url><loc>${o}${path}</loc>${lastmod ? `<lastmod>${lastmod.toISOString()}</lastmod>` : ''}</url>`;
  const body = [
    u('/'), u('/rising/'), u('/webcams/'), u('/alerts/'), u('/about/'), u('/methodology/'), u('/sources/'),
    ...states.map((s) => u(`/${s.slug}/`)),
    ...counties.map((c) => u(`/${c.state_slug}/${c.slug}/`)),
    ...rivers.map((r) => u(`/river/${r.slug}/`)),
    ...gauges.map((g) => u(`/gauge/${g.slug}/`, g.levels_updated_at)),
  ].join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};

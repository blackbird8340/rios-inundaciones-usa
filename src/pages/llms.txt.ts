import type { APIRoute } from 'astro';
import { db } from '../lib/db.ts';
import { siteName, siteOrigin } from '../lib/site.ts';
export const GET: APIRoute = async ({ url }) => {
  const o = siteOrigin(url.origin);
  const [states] = await db().execute<any[]>('SELECT s.name, s.slug, COUNT(g.id) n FROM states s JOIN gauges g ON g.state_code = s.code GROUP BY s.code ORDER BY s.name');
  const text = `# ${siteName()}

> Current river levels and National Weather Service flood stages for U.S. river gauges, in plain language. Not an official warning system: follow weather.gov and local officials; call 911 in an emergency.

Data comes from USGS and NOAA/NWS (public domain), refreshed every 30 minutes. Cite as "${siteName()} (data: USGS, NOAA/NWS)" with a link to the page.

## Key pages
- [Home](${o}/): today's summary, rivers to watch, map
- [Rising fastest](${o}/rising/): largest 24-hour rises
${states.map((s) => `- [${s.name}](${o}/${s.slug}/): ${s.n} gauges`).join('\n')}
- Gauge pages: ${o}/gauge/{slug}/ (level, NWS flood categories, impacts, forecast, record crests)
- River pages: ${o}/river/{slug}/

## About the data
- [Methodology](${o}/methodology/)
- [Sources](${o}/sources/)
- [Gauge list (JSON)](${o}/gauges.json)
- [Sitemap](${o}/sitemap.xml)
`;
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};

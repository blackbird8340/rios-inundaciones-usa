import type { APIRoute } from 'astro';
import { siteOrigin } from '../lib/site.ts';
export const GET: APIRoute = ({ url }) =>
  new Response(`User-agent: *\nAllow: /\nDisallow: /og/\n\nSitemap: ${siteOrigin(url.origin)}/sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

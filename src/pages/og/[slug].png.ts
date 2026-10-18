import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { db } from '../../lib/db.ts';
import { STATUS_META, type FloodStatus } from '../../lib/flood.ts';
import { fmtTime, ianaZone } from '../../lib/format.ts';
import { cleanName } from '../../lib/slug.ts';

// Tarjeta OG 1200x630 por medidor. Cache en memoria por (slug, hora de lectura).
const require = createRequire(import.meta.url);
let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 700 | 800; style: 'normal' }[]> | null = null;
const loadFonts = () =>
  (fonts ??= Promise.all([
    readFile(require.resolve('@fontsource/big-shoulders-display/files/big-shoulders-display-latin-800-normal.woff')).then((data) => ({ name: 'BSD', data, weight: 800 as const, style: 'normal' as const })),
    readFile(require.resolve('@fontsource/public-sans/files/public-sans-latin-400-normal.woff')).then((data) => ({ name: 'PS', data, weight: 400 as const, style: 'normal' as const })),
    readFile(require.resolve('@fontsource/public-sans/files/public-sans-latin-700-normal.woff')).then((data) => ({ name: 'PS', data, weight: 700 as const, style: 'normal' as const })),
  ]));
const cache = new Map<string, Buffer>();

const h = (type: string, style: Record<string, unknown>, children?: unknown) => ({ type, props: { style, children } });

export const GET: APIRoute = async ({ params }) => {
  const [[g]] = await db().execute<any[]>(
    'SELECT slug, name, state_code, stage_ft, status, observed_at, time_zone, minor_ft FROM gauges WHERE slug = ?',
    [params.slug ?? ""],
  );
  if (!g) return new Response('Not found', { status: 404 });
  g.name = cleanName(g.name);
  const key = `${g.slug}|${g.observed_at?.getTime() ?? 0}`;
  let png = cache.get(key);
  if (!png) {
    const status = (g.stage_ft != null ? g.status : 'no_data') as FloodStatus;
    const meta = STATUS_META[status];
    const tz = ianaZone(g.time_zone, g.state_code);
    const level = g.stage_ft != null ? `${Number(g.stage_ft).toFixed(1)} ft` : 'No recent data';
    const when = g.observed_at ? `Reading at ${fmtTime(g.observed_at, tz, true)}` : '';
    const wave = `data:image/svg+xml;utf8,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='170' viewBox='0 0 1200 170'><path d='M0 30 Q150 0 300 30 T600 30 T900 30 T1200 30 V170 H0Z' fill='#78b3cf' fill-opacity='.6'/><path d='M0 50 Q100 25 200 50 T400 50 T600 50 T800 50 T1000 50 T1200 50 V170 H0Z' fill='#2f6f8f'/></svg>")}`;
    const mark = `data:image/svg+xml;utf8,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='64' height='64'><rect width='32' height='32' rx='7' fill='#10243a'/><path d='M0 18 Q4 14.5 8 18 T16 18 T24 18 T32 18 V25 Q32 32 25 32 H7 Q0 32 0 25Z' fill='#2f6f8f'/><path d='M0 22 Q4 19 8 22 T16 22 T24 22 T32 22 V25 Q32 32 25 32 H7 Q0 32 0 25Z' fill='#4a92b3'/><g stroke='#eef2f3' stroke-linecap='round' stroke-width='1.6'><path d='M8 6v20'/><path d='M8 7h5M8 12h3.5M8 17h5M8 22h3.5'/></g><circle cx='23' cy='10' r='2.6' fill='#ff9900'/></svg>")}`;
    const tree = h('div', { width: 1200, height: 630, display: 'flex', flexDirection: 'column', background: '#eef2f3', fontFamily: 'PS', color: '#10243a', position: 'relative' }, [
      h('div', { display: 'flex', alignItems: 'center', gap: 18, padding: '48px 64px 0' }, [
        { type: 'img', props: { src: mark, width: 64, height: 64 } },
        h('div', { fontFamily: 'BSD', fontSize: 40, letterSpacing: 2 }, (process.env.SITE_NAME || 'River Levels').toUpperCase()),
      ]),
      h('div', { display: 'flex', flexDirection: 'column', padding: '28px 64px 0' }, [
        h('div', { fontFamily: 'BSD', fontSize: g.name.length > 40 ? 64 : 78, lineHeight: 1, textTransform: 'uppercase' }, `${g.name}, ${g.state_code}`),
        h('div', { display: 'flex', alignItems: 'center', gap: 24, marginTop: 26 }, [
          h('div', { fontFamily: 'BSD', fontSize: 110, lineHeight: 1 }, level),
          h('div', { display: 'flex', background: meta.color, borderRadius: 999, padding: '10px 26px', fontSize: 30, fontWeight: 700, textTransform: 'uppercase' }, meta.label),
        ]),
      ]),
      h('div', { position: 'absolute', left: 0, bottom: 0, width: 1200, height: 170, display: 'flex' }, [{ type: 'img', props: { src: wave, width: 1200, height: 170 } }]),
      h('div', { position: 'absolute', left: 64, bottom: 34, display: 'flex', gap: 24, color: '#fff', fontSize: 26 }, [
        h('div', {}, when),
        h('div', { opacity: 0.8 }, 'Data: USGS, NOAA/NWS'),
      ]),
    ]);
    const svg = await satori(tree as any, { width: 1200, height: 630, fonts: await loadFonts() });
    png = new Resvg(svg).render().asPng();
    if (cache.size > 500) cache.clear();
    cache.set(key, png);
  }
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600' },
  });
};

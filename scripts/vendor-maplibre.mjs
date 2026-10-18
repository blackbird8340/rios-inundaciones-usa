// MapLibre 6 busca su worker como archivo hermano de maplibre-gl.mjs (import.meta.url),
// cosa que el bundler rompe. Copiamos los archivos tal cual a public/ y los importamos en runtime.
import { cpSync, mkdirSync } from 'node:fs';
const src = new URL('../node_modules/maplibre-gl/dist/', import.meta.url);
const dst = new URL('../public/vendor/maplibre/', import.meta.url);
mkdirSync(dst, { recursive: true });
for (const f of ['maplibre-gl.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) cpSync(new URL(f, src), new URL(f, dst));

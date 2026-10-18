import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';

// En Vercel (VERCEL=1 durante el build) usamos su adapter; local/VPS sigue con Node standalone.
const onVercel = !!process.env.VERCEL;

export default defineConfig({
  output: 'server',
  adapter: onVercel
    ? vercel({
        // Fuentes que lee la ruta /og/*.png en runtime.
        includeFiles: [
          './node_modules/@fontsource/big-shoulders-display/files/big-shoulders-display-latin-800-normal.woff',
          './node_modules/@fontsource/public-sans/files/public-sans-latin-400-normal.woff',
          './node_modules/@fontsource/public-sans/files/public-sans-latin-700-normal.woff',
        ],
      })
    : node({ mode: 'standalone' }),
  trailingSlash: 'always',
});

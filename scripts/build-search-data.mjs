// Genera public/search/{zips,places}.json desde el Census Gazetteer 2024 (dominio público).
// Uso: node scripts/build-search-data.mjs <dir con 2024_Gaz_zcta_national.txt y 2024_Gaz_place_national.txt>
// ZIPs: prefijos USPS de PA (150–196) y NC (270–289). Lugares: USPS = PA o NC, sin el sufijo LSAD.
import { readFileSync, writeFileSync } from 'node:fs';
const dir = process.argv[2] ?? '/tmp/gaz';
const rows = (f) => readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t').map((s) => s.trim()));
const r4 = (n) => Math.round(Number(n) * 1e4) / 1e4;
const zips = rows('2024_Gaz_zcta_national.txt')
  .filter(([z]) => { const p = Number(z.slice(0, 3)); return (p >= 150 && p <= 196) || (p >= 270 && p <= 289); })
  .map(([z, , , , , lat, lon]) => [z, r4(lat), r4(lon)]);
const places = rows('2024_Gaz_place_national.txt')
  .filter(([st]) => st === 'PA' || st === 'NC')
  .map(([st, , , name, , , , , , , lat, lon]) => [name.replace(/\s+(city|borough|town|township|village|CDP|municipality)$/i, ''), st, r4(lat), r4(lon)]);
writeFileSync('public/search/zips.json', JSON.stringify(zips));
writeFileSync('public/search/places.json', JSON.stringify(places));
console.log(`zips ${zips.length}, places ${places.length}`);

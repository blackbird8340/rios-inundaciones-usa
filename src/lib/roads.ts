// "¿Está cortada mi ruta?": rutas y calles nombradas en los impactos NWS de un medidor.
// Solo extrae nombres del texto oficial; el estado real de la ruta se confirma en DriveNC / 511PA (solo link).
const RX = new RegExp(
  [
    String.raw`\b(?:I|Interstate)[- ]\d{1,3}\b`,
    String.raw`\bU\.?S\.?(?: Route| Highway| Hwy)?[- ]\d{1,3}[A-Z]?\b`,
    String.raw`\b(?:NC|PA|SR|State Route|State Road|Route|Rte\.?|Rt\.?|Highway|Hwy\.?)[- ]\d{1,4}[A-Z]?\b`,
    String.raw`\b(?:[A-Z][a-z]+|[A-Z]\.?)(?: (?:[A-Z][a-z]+|[A-Z]\.?)){0,3} (?:Road|Rd\.?|Street|St\.?|Avenue|Ave\.?|Drive|Dr\.?|Lane|Ln\.?|Pike|Boulevard|Blvd\.?|Parkway|Pkwy\.?|Highway|Turnpike|Bridge)\b`,
  ].join('|'),
  'g',
);
const STOP = /^(?:The|A|An|At|In|On|Of|Near|Along|Parts|Portions|Some|Many|Most|Low|Lower|Upper|North|South|East|West|Water|Flooding|Minor|Moderate|Major)\s/;

const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/\.$/, '').replace(/^(?:Rte?\.?|Rt\.?)[- ]/i, 'Route ').replace(/^Hwy\.?[- ]/i, 'Highway ').trim();

export type RoadHit = { road: string; stage_ft: number };
export function roadsFromImpacts(impacts: { stage_ft: number; statement: string }[]): RoadHit[] {
  const best = new Map<string, RoadHit>(); // clave en minúsculas → nombre y nivel más bajo en que aparece
  for (const i of impacts) {
    for (const m of i.statement.matchAll(RX)) {
      let r = norm(m[0]);
      while (STOP.test(r)) r = r.replace(STOP, '');
      if (r.length < 4 || !/\d|\s/.test(r)) continue;
      const k = r.toLowerCase(), v = Number(i.stage_ft);
      const prev = best.get(k);
      if (!prev || v < prev.stage_ft) best.set(k, { road: r, stage_ft: v });
    }
  }
  return [...best.values()].sort((a, b) => a.stage_ft - b.stage_ft);
}

export const ROAD_LINKS: Record<string, { name: string; url: string }> = {
  NC: { name: 'DriveNC', url: 'https://drivenc.gov/' },
  PA: { name: '511PA', url: 'https://www.511pa.com/' },
};

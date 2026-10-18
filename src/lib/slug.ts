export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// "Ohio River at Pittsburgh" → { river: "Ohio River", place: "Pittsburgh" }.
// NWPS usa casi siempre "<río> at|near|below|above <lugar>".
export function splitGaugeName(name: string): { river: string; place: string | null } {
  const m = name.match(/^(.*?)\s+(?:at|near|nr|below|blw|above|abv)\s+(.+)$/i);
  if (!m) return { river: name.trim(), place: null };
  return { river: m[1].trim(), place: m[2].trim() };
}

export function gaugeSlug(name: string, id: string): string {
  const { river, place } = splitGaugeName(cleanName(name));
  const base = place ? `${slugify(river)}-at-${slugify(place)}` : slugify(river);
  return `${base}-${id.toLowerCase()}`;
}

// Quita la referencia de datum que NWPS mete en algunos nombres: "Delaware River at X (IN MLLW)" → "...at X".
export function cleanName<T extends string | null | undefined>(s: T): T {
  return (s == null ? s : s.replace(/\s*\((?:in\s+)?(?:MLLW|MHHW|NAVD\s*88|NGVD\s*29)\)\s*/gi, ' ').replace(/\s{2,}/g, ' ').trim()) as T;
}

// Slug viejo con el datum ("...-in-mllw-bdsp1") → slug limpio, para redirigir con 301.
export function legacySlugTarget(slug: string): string | null {
  const clean = slug.replace(/-in-(?:mllw|mhhw|navd-?88|ngvd-?29)(?=-)/g, '');
  return clean !== slug ? clean : null;
}

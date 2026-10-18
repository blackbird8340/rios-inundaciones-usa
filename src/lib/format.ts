import { STATES } from './config.ts';

// NWPS da zonas POSIX viejas; Intl prefiere las IANA.
const TZ_ALIASES: Record<string, string> = {
  EST5EDT: 'America/New_York',
  CST6CDT: 'America/Chicago',
  MST7MDT: 'America/Denver',
  MST7: 'America/Phoenix',
  PST8PDT: 'America/Los_Angeles',
  AKST9AKDT: 'America/Anchorage',
  HST10: 'Pacific/Honolulu',
};

// Zonas que NWPS manda pero no son confiables: GMT0GMT y EST5CDT aparecen en medidores
// del este (PA, NC), y algunos traen basura como "1234". Para esas usamos la zona del estado.
const UNRELIABLE = new Set(['GMT0GMT', 'EST5CDT']);

const validZones = new Map<string, boolean>();
function isValidZone(tz: string): boolean {
  let ok = validZones.get(tz);
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      ok = true;
    } catch {
      ok = false;
    }
    validZones.set(tz, ok);
  }
  return ok;
}

// Devuelve siempre una zona IANA válida para Intl: alias conocido → zona IANA del dato →
// zona del estado → UTC. Así ninguna página se cae por una zona rara.
export function ianaZone(tz: string | null | undefined, stateCode?: string | null): string {
  const raw = tz?.trim();
  if (raw && TZ_ALIASES[raw]) return TZ_ALIASES[raw];
  if (raw && !UNRELIABLE.has(raw) && raw.includes('/') && isValidZone(raw)) return raw;
  const fallback = STATES.find((s) => s.code === stateCode?.toUpperCase())?.timeZone;
  return fallback ?? 'UTC';
}

export function fmtTime(d: Date | null | undefined, tz: string, withDay = false): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    ...(withDay ? { weekday: 'short', month: 'short', day: 'numeric' } : {}),
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(d);
}

export function fmtDate(d: Date | string, tz = 'UTC'): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(d));
}

export const ft = (n: number | null | undefined, digits = 1) => (n == null ? '—' : `${n.toFixed(digits)} ft`);
export const cfs = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n).toLocaleString('en-US')} cfs`);

export function ago(d: Date, now = new Date()): string {
  const min = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return `${Math.round(h / 24)} days ago`;
}

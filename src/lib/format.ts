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

export const ianaZone = (tz: string | null | undefined) => (tz && TZ_ALIASES[tz]) || tz || 'America/New_York';

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

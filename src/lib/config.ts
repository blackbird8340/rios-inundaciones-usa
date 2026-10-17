// Estados del MVP. Para escalar, agregar entradas acá (bbox en EPSG:4326).
// timeZone: zona IANA de respaldo cuando NWPS manda una zona inválida para un medidor.
export const STATES = [
  { code: 'PA', name: 'Pennsylvania', slug: 'pennsylvania', fips: '42', bbox: [-80.52, 39.72, -74.69, 42.27], timeZone: 'America/New_York' },
  { code: 'NC', name: 'North Carolina', slug: 'north-carolina', fips: '37', bbox: [-84.33, 33.84, -75.46, 36.59], timeZone: 'America/New_York' },
] as const;

export type StateConfig = (typeof STATES)[number];

export const STALE_AFTER_MIN = 120;

export const NWPS_BASE = 'https://api.water.noaa.gov/nwps/v1';
export const USGS_OGC_BASE = 'https://api.waterdata.usgs.gov/ogcapi/v1';
export const NWS_API_BASE = 'https://api.weather.gov';
export const RTFI_BASE = 'https://api.waterdata.usgs.gov/rtfi-api';

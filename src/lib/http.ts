// Todas las llamadas a APIs externas pasan por acá: User-Agent con contacto,
// timeout, reintentos con backoff exponencial y respeto de 429/Retry-After.

const DOMAIN = process.env.SITE_DOMAIN || 'rios-inundaciones-usa.local';
const CONTACT = process.env.CONTACT_EMAIL || 'contact-pending';
export const USER_AGENT = `(${DOMAIN}, ${CONTACT})`;

type FetchOpts = { headers?: Record<string, string>; timeoutMs?: number; retries?: number };

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const { headers = {}, timeoutMs = 30_000, retries = 3 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 404) throw new HttpError(url, 404, false);
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable) throw new HttpError(url, res.status, false);
      const retryAfter = Number(res.headers.get('retry-after'));
      lastErr = new HttpError(url, res.status, true);
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
    } catch (err) {
      if (err instanceof HttpError && !err.retryable) throw err;
      lastErr = err;
      if (attempt < retries) await sleep(backoff(attempt));
    }
  }
  throw lastErr;
}

export class HttpError extends Error {
  constructor(public url: string, public status: number, public retryable: boolean) {
    super(`HTTP ${status} ${url}`);
  }
}

const backoff = (attempt: number) => 1000 * 2 ** attempt + Math.random() * 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function usgsHeaders(): Record<string, string> {
  return process.env.USGS_API_KEY ? { 'X-Api-Key': process.env.USGS_API_KEY } : {};
}

import mysql from 'mysql2/promise';

let pool: mysql.Pool | undefined;

export function db(): mysql.Pool {
  pool ??= mysql.createPool({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? '',
    connectionLimit: 5,
    timezone: 'Z',
    dateStrings: false,
    decimalNumbers: true,
    multipleStatements: false,
    // Bases gestionadas (TiDB Cloud, etc.) exigen TLS: DB_SSL=true.
    ...(process.env.DB_SSL === 'true' ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } } : {}),
  });
  return pool;
}

export async function closeDb() {
  await pool?.end();
  pool = undefined;
}

// Errores que se resuelven reintentando: deadlock (1213) y espera de lock (1205) de MySQL/MariaDB, y los
// transitorios de TiDB que llegan sin `code`, solo con errno: 9004 resolve lock timeout, 8022 / 8028
// conflicto o cambio de esquema en el commit, 9007 write conflict.
const RETRYABLE_DB_ERRORS = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);
const RETRYABLE_ERRNOS = new Set([1205, 1213, 8022, 8028, 9004, 9007]);

export function isRetryableDbError(err: unknown): boolean {
  const e = err as { code?: unknown; errno?: unknown; sqlMessage?: unknown } | null;
  if (typeof e?.code === 'string' && RETRYABLE_DB_ERRORS.has(e.code)) return true;
  if (typeof e?.errno === 'number' && RETRYABLE_ERRNOS.has(e.errno)) return true;
  return typeof e?.sqlMessage === 'string' && /resolve lock timeout|write conflict/i.test(e.sqlMessage);
}

// Reintenta fn ante deadlock con backoff exponencial y jitter (máx. `retries` reintentos).
// fn tiene que ser idempotente: todas las escrituras de la ingesta lo son (upserts y delete+insert en transacción).
export async function withDeadlockRetry<T>(fn: () => Promise<T>, retries = 6): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isRetryableDbError(err)) throw err;
      const wait = Math.min(15_000, 250 * 2 ** attempt) + Math.random() * 250;
      console.warn(`db lock error (${(err as any)?.errno ?? (err as any)?.code}), retrying in ${Math.round(wait)} ms (attempt ${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

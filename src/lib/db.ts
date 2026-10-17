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
  });
  return pool;
}

export async function closeDb() {
  await pool?.end();
  pool = undefined;
}

// Errores de MySQL/MariaDB que se resuelven reintentando: deadlock (1213) y espera de lock (1205).
const RETRYABLE_DB_ERRORS = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);

export function isRetryableDbError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && RETRYABLE_DB_ERRORS.has(code);
}

// Reintenta fn ante deadlock con backoff exponencial y jitter (máx. `retries` reintentos).
// fn tiene que ser idempotente: todas las escrituras de la ingesta lo son (upserts y delete+insert en transacción).
export async function withDeadlockRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isRetryableDbError(err)) throw err;
      const wait = 100 * 2 ** attempt + Math.random() * 100;
      console.warn(`db deadlock, retrying in ${Math.round(wait)} ms (attempt ${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

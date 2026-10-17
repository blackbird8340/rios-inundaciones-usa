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

import { closeDb, db, withDeadlockRetry } from '../../src/lib/db.ts';
import { STATES, type StateConfig } from '../../src/lib/config.ts';

// Envuelve un job: registra la corrida en ingest_runs y sale con código 1 si falla.
export async function runJob(job: string, fn: () => Promise<string | void>) {
  const started = new Date();
  const [res] = await db().execute<any>('INSERT INTO ingest_runs (job, started_at) VALUES (?, ?)', [job, started]);
  const runId = res.insertId;
  try {
    const msg = (await fn()) ?? '';
    await db().execute('UPDATE ingest_runs SET finished_at = ?, ok = TRUE, message = ? WHERE id = ?', [new Date(), msg, runId]);
    console.log(`[${job}] ok in ${((Date.now() - started.getTime()) / 1000).toFixed(1)}s ${msg}`);
  } catch (err) {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    await db().execute('UPDATE ingest_runs SET finished_at = ?, ok = FALSE, message = ? WHERE id = ?', [new Date(), msg.slice(0, 5000), runId]);
    console.error(`[${job}] FAILED`, err);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function selectedStates(): StateConfig[] {
  const s = arg('state')?.toUpperCase();
  return s ? STATES.filter((x) => x.code === s) : [...STATES];
}

// Ejecuta fn sobre items con concurrencia limitada; los errores por item se juntan sin cortar el resto.
// Un deadlock de la base se reintenta (fn tiene que ser idempotente).
export async function pool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  const errors: { item: T; err: unknown }[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++];
        try {
          await withDeadlockRetry(() => fn(item));
        } catch (err) {
          errors.push({ item, err });
        }
      }
    }),
  );
  return errors;
}

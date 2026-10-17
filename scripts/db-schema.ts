// Aplica db/schema.sql (idempotente).
import { readFile } from 'node:fs/promises';
import { closeDb, db } from '../src/lib/db.ts';

const sql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
const statements = sql
  .split(/;\s*$/m)
  .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
  .filter(Boolean);
for (const s of statements) await db().query(s);
console.log(`schema applied (${statements.length} statements)`);
await closeDb();

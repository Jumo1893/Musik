import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from './db.ts';

/** Liegt neben src/ bzw. dist/, deshalb funktioniert der Pfad in Entwicklung und im Container. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

// Beliebige, aber feste Zahl: verhindert, dass zwei gleichzeitig startende Instanzen parallel migrieren.
const MIGRATION_LOCK_ID = 487_215_093;

/**
 * Führt alle noch nicht eingespielten .sql-Dateien aus dem Migrationsordner in
 * Namensreihenfolge aus, jede in einer eigenen Transaktion. Gibt die Namen der neu
 * eingespielten Dateien zurück.
 */
export async function migrate(pool: Pool, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort();
  const client = await pool.connect();
  const appliedNow: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const alreadyApplied = new Set(rows.map((row) => row.name));

    for (const file of files) {
      if (alreadyApplied.has(file)) continue;
      const sql = await readFile(join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(`Migration ${file} ist fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`, {
          cause: err,
        });
      }
      appliedNow.push(file);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }
  return appliedNow;
}

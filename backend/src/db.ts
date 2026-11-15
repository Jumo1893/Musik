import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;
/** Alles, womit sich eine Abfrage ausführen lässt: der Pool oder eine Verbindung in einer Transaktion. */
export type Queryable = Pick<pg.Pool, 'query'>;

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function createPool(dbConfig: DbConfig): Pool {
  const pool = new pg.Pool({ ...dbConfig, max: 10 });
  // Ohne diesen Handler würde ein Verbindungsabbruch einer inaktiven Verbindung den Prozess beenden.
  pool.on('error', (err) => {
    console.error('Datenbankverbindung im Leerlauf verloren:', err.message);
  });
  return pool;
}

/** Wartet beim Start, bis die Datenbank Verbindungen annimmt. */
export async function waitForDatabase(pool: Pool, attempts = 30, delayMs = 1000): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (attempt >= attempts) throw err;
      const reason = err instanceof Error ? err.message : String(err);
      console.log(`Datenbank noch nicht erreichbar (Versuch ${attempt}/${attempts}): ${reason}`);
      await sleep(delayMs);
    }
  }
}

export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

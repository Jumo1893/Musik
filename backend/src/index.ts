import { createApp } from './app.ts';
import { config } from './config.ts';
import { createPool, waitForDatabase } from './db.ts';
import { migrate } from './migrate.ts';

const pool = createPool(config.db);

await waitForDatabase(pool);
const applied = await migrate(pool);
if (applied.length > 0) console.log(`Datenbank-Migrationen eingespielt: ${applied.join(', ')}`);

const app = createApp(pool, { itunesCountry: config.itunesCountry });
const server = app.listen(config.port, () => {
  console.log(`Musik-API läuft auf Port ${config.port}`);
});

// Sauber beenden, wenn der Container gestoppt wird: offene Anfragen abschließen,
// dann die Datenbankverbindungen schließen.
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} empfangen, fahre herunter …`);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  server.closeIdleConnections();
  // Falls eine Verbindung hängt, nach kurzer Zeit trotzdem beenden.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

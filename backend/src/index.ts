import { createApp } from './app.ts';
import { config } from './config.ts';
import { createPool, waitForDatabase } from './db.ts';
import { migrate } from './migrate.ts';
import { GenreLookupService } from './services/genreLookup.ts';
import { LibraryJobs } from './services/libraryJobs.ts';
import { LinkLookupService } from './services/linkLookup.ts';
import { SongBpmService } from './services/songBpm.ts';
import { YoutubeService } from './services/youtube.ts';
import { YoutubeLinkService } from './services/youtubeLinks.ts';

const pool = createPool(config.db);

await waitForDatabase(pool);
const applied = await migrate(pool);
if (applied.length > 0) console.log(`Datenbank-Migrationen eingespielt: ${applied.join(', ')}`);

const youtube = new YoutubeService({
  pool,
  clientId: config.youtube.clientId,
  clientSecret: config.youtube.clientSecret,
  redirectUri: `${config.appUrl}/api/youtube/callback`,
  endpoints: config.googleEndpoints,
  regionCode: config.itunesCountry.toUpperCase(),
});
console.log(
  youtube.configured
    ? `YouTube-Anbindung eingerichtet, Rücksprungadresse: ${youtube.redirectUri}`
    : 'YouTube-Anbindung nicht eingerichtet (YOUTUBE_CLIENT_ID und YOUTUBE_CLIENT_SECRET fehlen).',
);

const genreLookup = new GenreLookupService();
const app = createApp(pool, {
  itunesCountry: config.itunesCountry,
  youtube,
  songBpm: new SongBpmService(),
  genreLookup,
  linkLookup: new LinkLookupService({ itunesCountry: config.itunesCountry }),
  youtubeLinks: new YoutubeLinkService({ genreLookup }),
  jobs: new LibraryJobs(),
  allowedHosts: config.allowedHosts,
});
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

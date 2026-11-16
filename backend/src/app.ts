import express, { type Express } from 'express';
import type { Pool } from './db.ts';
import { errorHandler } from './errors.ts';
import { categoriesRouter } from './routes/categories.ts';
import { lookupRouter } from './routes/lookup.ts';
import { playlistsRouter } from './routes/playlists.ts';
import { songsRouter } from './routes/songs.ts';
import { statsRouter } from './routes/stats.ts';
import { youtubeRouter } from './routes/youtube.ts';
import type { SongBpmService } from './services/songBpm.ts';
import type { YoutubeService } from './services/youtube.ts';

export interface AppOptions {
  itunesCountry: string;
  youtube: YoutubeService;
  /** Tempo-Suche auf songbpm.com */
  songBpm: SongBpmService;
  /** Erlaubte Host-Namen; null: keine Prüfung */
  allowedHosts: readonly string[] | null;
}

export function createApp(pool: Pool, options: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');

  // Die App kommt ohne Anmeldung aus. Damit fremde Webseiten im selben Browser nichts auslösen
  // können – etwa Playlists im verbundenen YouTube-Konto ändern –, gilt für die API:
  // 1. Nur bekannte Host-Namen (wehrt DNS-Rebinding ab, solange die App nur lokal läuft).
  // 2. POST nur mit JSON: Formulare fremder Seiten können diesen Typ nicht senden,
  //    und für JSON verlangt der Browser vorher eine Erlaubnis, die die API nie erteilt.
  app.use('/api', (req, res, next) => {
    if (options.allowedHosts && !options.allowedHosts.includes(req.hostname)) {
      res.status(403).json({ error: 'Unter dieser Adresse ist die App nicht freigegeben.' });
      return;
    }
    if (req.method === 'POST' && !req.is('application/json')) {
      res.status(415).json({ error: 'Anfragen an die API müssen JSON senden.' });
      return;
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  });

  // Einstellungen, die auch die Weboberfläche braucht.
  app.get('/api/config', (_req, res) => {
    res.json({ appleMusicStorefront: options.itunesCountry });
  });

  app.use('/api/songs', songsRouter(pool));
  app.use('/api/categories', categoriesRouter(pool));
  app.use('/api/playlists', playlistsRouter(pool, options.youtube));
  app.use('/api/stats', statsRouter(pool));
  app.use('/api/lookup', lookupRouter(options.itunesCountry, options.songBpm));
  app.use('/api/youtube', youtubeRouter(pool, options.youtube, options.songBpm));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Diesen API-Endpunkt gibt es nicht.' });
  });
  app.use(errorHandler);

  return app;
}

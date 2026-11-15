import express, { type Express } from 'express';
import type { Pool } from './db.ts';
import { errorHandler } from './errors.ts';
import { categoriesRouter } from './routes/categories.ts';
import { lookupRouter } from './routes/lookup.ts';
import { playlistsRouter } from './routes/playlists.ts';
import { songsRouter } from './routes/songs.ts';
import { statsRouter } from './routes/stats.ts';

export interface AppOptions {
  itunesCountry: string;
}

export function createApp(pool: Pool, options: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));

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
  app.use('/api/playlists', playlistsRouter(pool));
  app.use('/api/stats', statsRouter(pool));
  app.use('/api/lookup', lookupRouter(options.itunesCountry));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Diesen API-Endpunkt gibt es nicht.' });
  });
  app.use(errorHandler);

  return app;
}

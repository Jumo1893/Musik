import { Router } from 'express';
import { withTransaction, type Pool } from '../db.ts';
import { notFound } from '../errors.ts';
import { youtubeImportSchema, youtubeLinksSchema, youtubeSearchQuerySchema } from '../schemas.ts';
import type { SongBpmService } from '../services/songBpm.ts';
import { LIKED_VIDEOS, OAuthFlowError, type YoutubeService } from '../services/youtube.ts';
import { PLAYLIST_ID_PATTERN } from '../services/youtubeIds.ts';
import { importFromYoutube, setYoutubeLinks } from '../services/youtubeImport.ts';

/** Ziel nach der Anmeldung bei Google: die YouTube-Seite der App mit Ergebnis in der Adresse. */
const RESULT_PAGE = '/youtube';

export function youtubeRouter(pool: Pool, youtube: YoutubeService, songBpm: SongBpmService): Router {
  const router = Router();

  router.get('/status', async (_req, res) => {
    res.json(await youtube.status());
  });

  // Startet die Anmeldung bei Google (wird als normaler Link im Browser geöffnet).
  router.get('/connect', (_req, res) => {
    if (!youtube.configured) {
      res.redirect(`${RESULT_PAGE}?fehler=nicht-eingerichtet`);
      return;
    }
    res.redirect(youtube.createAuthorizationUrl());
  });

  // Rücksprung von Google. Erst den state prüfen, dann das Ergebnis auswerten.
  router.get('/callback', async (req, res) => {
    const param = (name: string) => (typeof req.query[name] === 'string' ? (req.query[name] as string) : null);
    const back = (query: string) => res.redirect(`${RESULT_PAGE}?${query}`);
    const state = param('state');
    const error = param('error');
    const code = param('code');

    if (!state || !youtube.consumeState(state)) return back('fehler=sitzung');
    if (error) return back(`fehler=${error === 'access_denied' ? 'abgebrochen' : 'google'}`);
    if (!code) return back('fehler=google');
    try {
      await youtube.completeAuthorization(code);
      back('verbunden=1');
    } catch (err) {
      console.warn('Anmeldung bei YouTube fehlgeschlagen:', err instanceof Error ? err.message : err);
      back(`fehler=${err instanceof OAuthFlowError ? err.code : 'anmeldung'}`);
    }
  });

  router.post('/disconnect', async (_req, res) => {
    await youtube.disconnect();
    res.status(204).end();
  });

  router.get('/search', async (req, res) => {
    const query = youtubeSearchQuerySchema.parse(req.query);
    res.json(
      await youtube.search(query.q, {
        title: query.title,
        artist: query.artist,
        durationSeconds: query.duration,
      }),
    );
  });

  router.get('/playlists', async (_req, res) => {
    res.json(await youtube.listPlaylists());
  });

  router.get('/playlists/:id', async (req, res) => {
    const id = req.params.id;
    if (id !== LIKED_VIDEOS && !PLAYLIST_ID_PATTERN.test(id)) throw notFound('Die YouTube-Playlist');
    res.json(await youtube.previewImport(id));
  });

  router.post('/import', async (req, res) => {
    const input = youtubeImportSchema.parse(req.body);
    const { createdSongIds, ...result } = await withTransaction(pool, (client) => importFromYoutube(client, input));
    // Das Tempo der neuen Songs wird erst nach dem Speichern nachgeschlagen, damit der Import nicht wartet.
    songBpm.fillMissing(pool, createdSongIds);
    res.status(201).json(result);
  });

  router.post('/links', async (req, res) => {
    const { links } = youtubeLinksSchema.parse(req.body);
    res.json({ updated: await withTransaction(pool, (client) => setYoutubeLinks(client, links)) });
  });

  router.get('/jobs/:id', (req, res) => {
    const job = youtube.getJob(req.params.id);
    if (!job) throw notFound('Die Übertragung');
    res.json(job);
  });

  return router;
}

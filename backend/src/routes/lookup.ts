import { Router } from 'express';
import type { Pool } from '../db.ts';
import { linkQuerySchema, lookupQuerySchema, songLookupQuerySchema } from '../schemas.ts';
import type { GenreLookupService } from '../services/genreLookup.ts';
import { searchItunes } from '../services/itunes.ts';
import type { LinkLookupService } from '../services/linkLookup.ts';
import type { SongBpmService } from '../services/songBpm.ts';
import type { YoutubeLinkService } from '../services/youtubeLinks.ts';

export interface LookupServices {
  itunesCountry: string;
  songBpm: SongBpmService;
  genreLookup: GenreLookupService;
  linkLookup: LinkLookupService;
  youtubeLinks: YoutubeLinkService;
}

export function lookupRouter(pool: Pool, services: LookupServices): Router {
  const router = Router();

  // GET /api/lookup/itunes?term=… – sucht Songs im iTunes-Katalog, um das Formular vorzubelegen.
  router.get('/itunes', async (req, res) => {
    const { term } = lookupQuerySchema.parse(req.query);
    res.json(await searchItunes(term, services.itunesCountry));
  });

  // GET /api/lookup/link?url=… – erkennt einen Song an seinem Link (Apple Music, YouTube, YouTube Music).
  router.get('/link', async (req, res) => {
    const { url } = linkQuerySchema.parse(req.query);
    res.json(await services.linkLookup.lookup(url));
  });

  // GET /api/lookup/bpm?title=…&artist=…&duration=… – sucht das Tempo auf songbpm.com.
  // { match: null } heißt: Den Song kennt songbpm.com nicht.
  router.get('/bpm', async (req, res) => {
    const { title, artist, duration } = songLookupQuerySchema.parse(req.query);
    res.json({ match: await services.songBpm.lookup({ title, artist, durationSeconds: duration ?? null }) });
  });

  // GET /api/lookup/youtube?title=…&artist=…&duration=… – sucht einen YouTube-Link bei Wikidata und
  // MusicBrainz, ohne YouTube-Konto. { match: null } heißt: Keine Quelle kennt ein passendes Video.
  router.get('/youtube', async (req, res) => {
    const { title, artist, duration } = songLookupQuerySchema.parse(req.query);
    res.json({ match: await services.youtubeLinks.lookup(pool, { title, artist, durationSeconds: duration ?? null }) });
  });

  // GET /api/lookup/genres?title=…&artist=…&duration=… – sucht die Genres auf MusicBrainz.
  // { match: null } heißt: MusicBrainz kennt den Song nicht oder nennt keine bekannten Genres.
  router.get('/genres', async (req, res) => {
    const { title, artist, duration } = songLookupQuerySchema.parse(req.query);
    res.json({ match: await services.genreLookup.lookup(pool, { title, artist, durationSeconds: duration ?? null }) });
  });

  return router;
}

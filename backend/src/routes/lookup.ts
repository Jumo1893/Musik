import { Router } from 'express';
import { bpmLookupQuerySchema, lookupQuerySchema } from '../schemas.ts';
import { searchItunes } from '../services/itunes.ts';
import type { SongBpmService } from '../services/songBpm.ts';

export function lookupRouter(itunesCountry: string, songBpm: SongBpmService): Router {
  const router = Router();

  // GET /api/lookup/itunes?term=… – sucht Songs im iTunes-Katalog, um das Formular vorzubelegen.
  router.get('/itunes', async (req, res) => {
    const { term } = lookupQuerySchema.parse(req.query);
    res.json(await searchItunes(term, itunesCountry));
  });

  // GET /api/lookup/bpm?title=…&artist=…&duration=… – sucht das Tempo auf songbpm.com.
  // { match: null } heißt: Den Song kennt songbpm.com nicht.
  router.get('/bpm', async (req, res) => {
    const { title, artist, duration } = bpmLookupQuerySchema.parse(req.query);
    res.json({ match: await songBpm.lookup({ title, artist, durationSeconds: duration ?? null }) });
  });

  return router;
}

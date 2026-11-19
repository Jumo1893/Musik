import { Router } from 'express';
import type { Pool } from '../db.ts';
import { listGenres } from '../services/genreCatalog.ts';

export function genresRouter(pool: Pool): Router {
  const router = Router();

  // GET /api/genres – Haupt- und Untergenres für Auswahllisten, samt eigenen Genres der Bibliothek.
  router.get('/', async (_req, res) => {
    res.json(await listGenres(pool));
  });

  return router;
}

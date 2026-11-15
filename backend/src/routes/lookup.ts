import { Router } from 'express';
import { lookupQuerySchema } from '../schemas.ts';
import { searchItunes } from '../services/itunes.ts';

export function lookupRouter(itunesCountry: string): Router {
  const router = Router();

  // GET /api/lookup/itunes?term=… – sucht Songs im iTunes-Katalog, um das Formular vorzubelegen.
  router.get('/itunes', async (req, res) => {
    const { term } = lookupQuerySchema.parse(req.query);
    res.json(await searchItunes(term, itunesCountry));
  });

  return router;
}

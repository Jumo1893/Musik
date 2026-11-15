import { Router } from 'express';
import { withTransaction, type Pool } from '../db.ts';
import { notFound, parseId } from '../errors.ts';
import { songInputSchema } from '../schemas.ts';
import { createSong, deleteSong, getSong, listSongs, updateSong } from '../services/songStore.ts';

const SONG = 'Der Song';

export function songsRouter(pool: Pool): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await listSongs(pool));
  });

  router.get('/:id', async (req, res) => {
    const song = await getSong(pool, parseId(req.params.id, SONG));
    if (!song) throw notFound(SONG);
    res.json(song);
  });

  router.post('/', async (req, res) => {
    const input = songInputSchema.parse(req.body);
    const song = await withTransaction(pool, (client) => createSong(client, input));
    res.status(201).json(song);
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id, SONG);
    const input = songInputSchema.parse(req.body);
    const song = await withTransaction(pool, (client) => updateSong(client, id, input));
    if (!song) throw notFound(SONG);
    res.json(song);
  });

  router.delete('/:id', async (req, res) => {
    const deleted = await deleteSong(pool, parseId(req.params.id, SONG));
    if (!deleted) throw notFound(SONG);
    res.status(204).end();
  });

  return router;
}

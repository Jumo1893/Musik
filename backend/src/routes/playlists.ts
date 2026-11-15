import { Router } from 'express';
import { withTransaction, type Pool } from '../db.ts';
import { notFound, parseId } from '../errors.ts';
import { generatorCriteriaSchema, playlistInputSchema } from '../schemas.ts';
import { generatePlaylist } from '../services/generator.ts';
import {
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  updatePlaylist,
} from '../services/playlistStore.ts';
import { listSongs } from '../services/songStore.ts';

const PLAYLIST = 'Die Playlist';

export function playlistsRouter(pool: Pool): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await listPlaylists(pool));
  });

  // Liefert nur einen Vorschlag; gespeichert wird erst über POST /api/playlists.
  router.post('/generate', async (req, res) => {
    const criteria = generatorCriteriaSchema.parse(req.body);
    res.json(generatePlaylist(await listSongs(pool), criteria));
  });

  router.get('/:id', async (req, res) => {
    const playlist = await getPlaylist(pool, parseId(req.params.id, PLAYLIST));
    if (!playlist) throw notFound(PLAYLIST);
    res.json(playlist);
  });

  router.post('/', async (req, res) => {
    const input = playlistInputSchema.parse(req.body);
    const playlist = await withTransaction(pool, (client) => createPlaylist(client, input));
    res.status(201).json(playlist);
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id, PLAYLIST);
    const input = playlistInputSchema.parse(req.body);
    const playlist = await withTransaction(pool, (client) => updatePlaylist(client, id, input));
    if (!playlist) throw notFound(PLAYLIST);
    res.json(playlist);
  });

  router.delete('/:id', async (req, res) => {
    const deleted = await deletePlaylist(pool, parseId(req.params.id, PLAYLIST));
    if (!deleted) throw notFound(PLAYLIST);
    res.status(204).end();
  });

  return router;
}

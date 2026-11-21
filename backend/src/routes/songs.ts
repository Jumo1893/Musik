import { Router } from 'express';
import pg from 'pg';
import { withTransaction, type Pool } from '../db.ts';
import { HttpError, notFound, parseId } from '../errors.ts';
import { songInputSchema, type SongInput } from '../schemas.ts';
import { createSong, deleteSong, findSameTrack, getSong, listSongs, updateSong } from '../services/songStore.ts';

const SONG = 'Der Song';

/**
 * Speichert und nennt bei einem genau gleichen Song (Titel, Interpret, Album) den vorhandenen
 * samt ID, damit die Oberfläche ihn öffnen kann.
 */
async function saveUnlessDuplicate<T>(pool: Pool, input: SongInput, excludeId: number | null, save: () => Promise<T>): Promise<T> {
  try {
    return await save();
  } catch (err) {
    if (err instanceof pg.DatabaseError && err.code === '23505' && err.constraint === 'songs_unique_track') {
      const existing = await findSameTrack(pool, input, excludeId);
      if (existing) {
        const album = existing.album ? ` vom Album „${existing.album}“` : '';
        throw new HttpError(
          409,
          `„${existing.title}“ von ${existing.artist}${album} gibt es schon in deiner Bibliothek.`,
          'song_exists',
          { existingSongId: existing.id },
        );
      }
    }
    throw err;
  }
}

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
    const song = await saveUnlessDuplicate(pool, input, null, () => withTransaction(pool, (client) => createSong(client, input)));
    res.status(201).json(song);
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id, SONG);
    const input = songInputSchema.parse(req.body);
    const song = await saveUnlessDuplicate(pool, input, id, () => withTransaction(pool, (client) => updateSong(client, id, input)));
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

import { Router } from 'express';
import type { Pool } from '../db.ts';
import { notFound, parseId } from '../errors.ts';
import { notedSongInputSchema } from '../schemas.ts';
import type { NotedSong } from '../types.ts';

const ENTRY = 'Der Eintrag';

interface NotedSongRow {
  id: number;
  text: string;
  created_at: Date;
}

function toNotedSong(row: NotedSongRow): NotedSong {
  return { id: row.id, text: row.text, createdAt: row.created_at };
}

/** Merkliste: unterwegs vorgemerkte Songs, die später erfasst werden. */
export function merklisteRouter(pool: Pool): Router {
  const router = Router();

  // Neueste zuerst: Was man gerade vorgemerkt hat, steht oben.
  router.get('/', async (_req, res) => {
    const { rows } = await pool.query<NotedSongRow>('SELECT id, text, created_at FROM merkliste ORDER BY created_at DESC, id DESC');
    res.json(rows.map(toNotedSong));
  });

  router.post('/', async (req, res) => {
    const { text } = notedSongInputSchema.parse(req.body);
    const { rows } = await pool.query<NotedSongRow>('INSERT INTO merkliste (text) VALUES ($1) RETURNING id, text, created_at', [text]);
    res.status(201).json(toNotedSong(rows[0]!));
  });

  router.delete('/:id', async (req, res) => {
    const result = await pool.query('DELETE FROM merkliste WHERE id = $1', [parseId(req.params.id, ENTRY)]);
    if ((result.rowCount ?? 0) === 0) throw notFound(ENTRY);
    res.status(204).end();
  });

  return router;
}

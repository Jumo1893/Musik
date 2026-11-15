import { Router } from 'express';
import type { Pool, Queryable } from '../db.ts';
import { notFound, parseId } from '../errors.ts';
import { categoryInputSchema } from '../schemas.ts';
import type { Category } from '../types.ts';

const CATEGORY = 'Die Kategorie';

interface CategoryRow {
  id: number;
  name: string;
  color: string;
  description: string | null;
  song_count: number;
}

const SELECT_CATEGORIES = `
  SELECT c.id, c.name, c.color, c.description,
         (SELECT count(*) FROM song_categories sc WHERE sc.category_id = c.id)::integer AS song_count
    FROM categories c`;

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    description: row.description,
    songCount: row.song_count,
  };
}

async function getCategory(db: Queryable, id: number): Promise<Category | null> {
  const { rows } = await db.query<CategoryRow>(`${SELECT_CATEGORIES} WHERE c.id = $1`, [id]);
  const row = rows[0];
  return row ? toCategory(row) : null;
}

export function categoriesRouter(pool: Pool): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const { rows } = await pool.query<CategoryRow>(`${SELECT_CATEGORIES} ORDER BY lower(c.name), c.id`);
    res.json(rows.map(toCategory));
  });

  router.post('/', async (req, res) => {
    const input = categoryInputSchema.parse(req.body);
    const { rows } = await pool.query<{ id: number }>(
      'INSERT INTO categories (name, color, description) VALUES ($1, $2, $3) RETURNING id',
      [input.name, input.color, input.description],
    );
    res.status(201).json(await getCategory(pool, rows[0]!.id));
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id, CATEGORY);
    const input = categoryInputSchema.parse(req.body);
    const result = await pool.query('UPDATE categories SET name = $1, color = $2, description = $3 WHERE id = $4', [
      input.name,
      input.color,
      input.description,
      id,
    ]);
    if (result.rowCount === 0) throw notFound(CATEGORY);
    res.json(await getCategory(pool, id));
  });

  // Löscht nur die Kategorie und ihre Zuordnungen; die Songs selbst bleiben erhalten.
  router.delete('/:id', async (req, res) => {
    const result = await pool.query('DELETE FROM categories WHERE id = $1', [parseId(req.params.id, CATEGORY)]);
    if (result.rowCount === 0) throw notFound(CATEGORY);
    res.status(204).end();
  });

  return router;
}

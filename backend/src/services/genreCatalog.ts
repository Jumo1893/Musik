// Genre-Liste mit Haupt- und Untergenres (Tabellen genres, genre_parents und genre_aliases
// aus Migration 006). Songs speichern Genres als Namen; der Katalog ordnet Namen und andere
// Schreibweisen („hip hop“, „Hip-Hop/Rap“) den Genres der Liste zu.

import type { Queryable } from '../db.ts';
import type { GenreInfo } from '../types.ts';

/**
 * Vergleichsschlüssel eines Genres: klein, ohne Akzente, „&“ als „and“, nur Buchstaben und
 * Ziffern. „Hip-Hop“, „hip hop“ und „HipHop“ sind damit dasselbe Genre.
 */
export function genreKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Wörter eines Namens, von Leerzeichen eingerahmt: „New wave pop“ → „ new wave pop “ */
function words(name: string): string {
  const inner = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return inner === '' ? '' : ` ${inner} `;
}

export interface CatalogGenre {
  id: number;
  name: string;
  isMain: boolean;
  /** Stammt aus der Genre-Liste; false: selbst eingetragen */
  fromList: boolean;
  /** Reihenfolge der Hauptgenres */
  position: number | null;
  /** Namen der Hauptgenres eines Untergenres (bei Hauptgenres leer) */
  mainGenres: string[];
  aliases: string[];
}

export class GenreCatalog {
  readonly genres: readonly CatalogGenre[];
  readonly #byKey = new Map<string, CatalogGenre>();

  constructor(genres: readonly CatalogGenre[]) {
    this.genres = genres;
    // Namen gehen anderen Schreibweisen vor.
    for (const genre of genres) this.#byKey.set(genreKey(genre.name), genre);
    for (const genre of genres) {
      for (const alias of genre.aliases) {
        const key = genreKey(alias);
        if (key !== '' && !this.#byKey.has(key)) this.#byKey.set(key, genre);
      }
    }
  }

  /** Das Genre zu einem Namen oder einer anderen Schreibweise. */
  find(name: string): CatalogGenre | undefined {
    const key = genreKey(name);
    return key === '' ? undefined : this.#byKey.get(key);
  }

  mainGenres(): CatalogGenre[] {
    return this.genres.filter((genre) => genre.isMain).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }

  /** Hauptgenres zu einem Genre: das Genre selbst, wenn es eins ist, sonst seine Hauptgenres. */
  mainGenresOf(name: string): string[] {
    const genre = this.find(name);
    if (!genre) return [];
    return genre.isMain ? [genre.name] : genre.mainGenres;
  }

  /**
   * Bringt Genres auf die Schreibweise des Katalogs („hip hop“ → „Hip-Hop“). Unbekannte bleiben,
   * wie sie sind; leere und doppelte fallen weg, die Reihenfolge bleibt.
   */
  canonicalize(names: readonly string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of names) {
      const trimmed = raw.trim();
      if (trimmed === '') continue;
      const name = this.find(trimmed)?.name ?? trimmed;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(name);
    }
    return result;
  }

  /**
   * Hauptgenres für ein neues, eigenes Genre: die, deren Name oder Schreibweise darin als Wort
   * vorkommt („New wave pop“ → Pop, „Deutscher Rock“ → Rock). Dieselbe Regel nutzt Migration 006.
   */
  guessMainGenres(name: string): string[] {
    const nameWords = words(name);
    return this.mainGenres()
      .filter((main) =>
        [main.name, ...main.aliases].some((variant) => {
          const variantWords = words(variant);
          return variantWords !== '' && nameWords.includes(variantWords);
        }),
      )
      .map((main) => main.name);
  }
}

interface GenreRow {
  id: number;
  name: string;
  is_main: boolean;
  from_list: boolean;
  position: number | null;
  main_genres: string[];
  aliases: string[];
}

const SELECT_GENRES = `
  SELECT g.id, g.name, g.is_main, g.from_list, g.position,
         coalesce((SELECT array_agg(m.name ORDER BY m.position)
                     FROM genre_parents p
                     JOIN genres m ON m.id = p.main_genre_id
                    WHERE p.genre_id = g.id), '{}') AS main_genres,
         coalesce((SELECT array_agg(a.alias ORDER BY a.alias)
                     FROM genre_aliases a
                    WHERE a.genre_id = g.id), '{}') AS aliases
    FROM genres g`;

function toCatalogGenre(row: GenreRow): CatalogGenre {
  return {
    id: row.id,
    name: row.name,
    isMain: row.is_main,
    fromList: row.from_list,
    position: row.position,
    mainGenres: row.main_genres,
    aliases: row.aliases,
  };
}

export async function loadGenreCatalog(db: Queryable): Promise<GenreCatalog> {
  const { rows } = await db.query<GenreRow>(SELECT_GENRES);
  return new GenreCatalog(rows.map(toCatalogGenre));
}

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/**
 * Alle Genres für die Auswahllisten: Hauptgenres in ihrer Reihenfolge, dann die Untergenres
 * alphabetisch. Eigene Genres erscheinen nur, solange ein Song sie nutzt.
 */
export async function listGenres(db: Queryable): Promise<GenreInfo[]> {
  const { rows } = await db.query<GenreRow>(SELECT_GENRES);
  const used = await db.query<{ name: string }>('SELECT DISTINCT lower(t.name) AS name FROM songs, unnest(songs.genres) AS t(name)');
  const inUse = new Set(used.rows.map((row) => row.name));
  return rows
    .filter((row) => row.from_list || row.is_main || inUse.has(row.name.toLowerCase()))
    .sort((a, b) => {
      if (a.is_main !== b.is_main) return a.is_main ? -1 : 1;
      if (a.is_main) return (a.position ?? 0) - (b.position ?? 0);
      return collator.compare(a.name, b.name);
    })
    .map((row) => ({
      name: row.name,
      isMain: row.is_main,
      mainGenres: row.main_genres,
      custom: !row.from_list,
      aliases: row.aliases,
    }));
}

/**
 * Bereitet die Genres eines Songs zum Speichern vor: Schreibweise des Katalogs, und was der
 * Katalog nicht kennt, wird als eigenes Genre angelegt (mit geratenen Hauptgenres).
 */
export async function prepareSongGenres(db: Queryable, names: readonly string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const catalog = await loadGenreCatalog(db);
  const genres = catalog.canonicalize(names);
  for (const name of genres) {
    if (catalog.find(name)) continue;
    // Legt ein anderer Aufruf dasselbe Genre gerade an, gilt dessen Eintrag.
    const { rows } = await db.query<{ id: number }>(
      'INSERT INTO genres (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id',
      [name],
    );
    const id = rows[0]?.id;
    const mainGenres = catalog.guessMainGenres(name);
    if (id === undefined || mainGenres.length === 0) continue;
    await db.query(
      `INSERT INTO genre_parents (genre_id, main_genre_id)
       SELECT $1, id FROM genres WHERE is_main AND name = ANY ($2::text[])`,
      [id, mainGenres],
    );
  }
  return genres;
}

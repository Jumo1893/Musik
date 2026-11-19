// Genre-Liste mit Haupt- und Untergenres im Browser: Schreibweisen zuordnen, suchen und
// die Genres der Bibliothek nach Hauptgenre ordnen. Gegenstück zu backend/src/services/genreCatalog.ts.

import type { GenreInfo, Song } from '../types.ts';
import { genreKey, normalizeText } from './songs.ts';

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/** Gleiche Genres, egal in welcher Reihenfolge und Schreibweise. */
export function sameGenres(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const keys = new Set(a.map(genreKey));
  return b.every((genre) => keys.has(genreKey(genre)));
}

export class GenreIndex {
  readonly genres: readonly GenreInfo[];
  readonly mainGenres: readonly GenreInfo[];
  readonly #byKey = new Map<string, GenreInfo>();
  readonly #mainOrder = new Map<string, number>();

  constructor(genres: readonly GenreInfo[]) {
    this.genres = genres;
    this.mainGenres = genres.filter((genre) => genre.isMain);
    this.mainGenres.forEach((main, index) => this.#mainOrder.set(main.name, index));
    // Namen gehen anderen Schreibweisen vor.
    for (const genre of genres) this.#byKey.set(genreKey(genre.name), genre);
    for (const genre of genres) {
      for (const alias of genre.aliases) {
        const key = genreKey(alias);
        if (key !== '' && !this.#byKey.has(key)) this.#byKey.set(key, genre);
      }
    }
  }

  find(name: string): GenreInfo | undefined {
    const key = genreKey(name);
    return key === '' ? undefined : this.#byKey.get(key);
  }

  /** Schreibweise der Genre-Liste („hip hop“ → „Hip-Hop“); unbekannte Genres bleiben, wie sie sind. */
  canonical(name: string): string {
    return this.find(name)?.name ?? name.trim();
  }

  /** Hauptgenres eines Genres: das Genre selbst, wenn es eins ist, sonst seine Hauptgenres. */
  mainGenresOf(name: string): string[] {
    const genre = this.find(name);
    if (!genre) return [];
    return genre.isMain ? [genre.name] : genre.mainGenres;
  }

  /** Hauptgenres mehrerer Genres, jedes einmal, in der Reihenfolge der Liste. */
  mainGenresOfAll(names: readonly string[]): string[] {
    const mains = new Set(names.flatMap((name) => this.mainGenresOf(name)));
    return [...mains].sort((a, b) => (this.#mainOrder.get(a) ?? 99) - (this.#mainOrder.get(b) ?? 99));
  }

  /**
   * Genres, die zur Eingabe passen – im Namen oder in einer anderen Schreibweise. Ein genau
   * passender Name oder eine genau passende Schreibweise zuerst („punk“ → Punk Rock), dann
   * Treffer am Anfang des Namens, am Anfang eines Worts („rock“ → Alternative Rock), in
   * anderen Schreibweisen und irgendwo im Namen; Hauptgenres und kurze Namen jeweils vorn.
   */
  search(query: string, limit = 60): GenreInfo[] {
    const needle = normalizeText(query.trim());
    if (needle === '') return [];
    const exact = this.find(query);
    const ranked: Array<{ genre: GenreInfo; rank: number }> = [];
    for (const genre of this.genres) {
      const name = normalizeText(genre.name);
      let rank: number;
      if (genre === exact) rank = -1;
      else if (name.startsWith(needle)) rank = 0;
      else if (name.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(needle))) rank = 1;
      else if (genre.aliases.some((alias) => normalizeText(alias).startsWith(needle))) rank = 2;
      else if (name.includes(needle)) rank = 3;
      else continue;
      ranked.push({ genre, rank });
    }
    return ranked
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          Number(b.genre.isMain) - Number(a.genre.isMain) ||
          a.genre.name.length - b.genre.name.length ||
          collator.compare(a.genre.name, b.genre.name),
      )
      .slice(0, limit)
      .map((item) => item.genre);
  }
}

export interface LibraryGenreGroup {
  /** Hauptgenre; null für eigene Genres ohne Hauptgenre */
  main: string | null;
  /** Untergenres der Bibliothek in diesem Hauptgenre, alphabetisch */
  subgenres: string[];
}

/**
 * Die Genres der Bibliothek, nach Hauptgenre geordnet (in der Reihenfolge der Liste). Ein
 * Untergenre mit zwei Hauptgenres (Pop Rock) steht bei beiden.
 */
export function libraryGenreGroups(songs: readonly Song[], index: GenreIndex): LibraryGenreGroup[] {
  const groups = new Map<string | null, Set<string>>();
  const group = (main: string | null) => {
    let subgenres = groups.get(main);
    if (!subgenres) {
      subgenres = new Set();
      groups.set(main, subgenres);
    }
    return subgenres;
  };
  for (const song of songs) {
    for (const main of song.mainGenres) group(main);
    for (const name of song.genres) {
      const genre = index.find(name);
      if (genre?.isMain) continue;
      const mains = genre ? genre.mainGenres : [];
      const label = genre?.name ?? name;
      if (mains.length === 0) group(null).add(label);
      for (const main of mains) group(main).add(label);
    }
  }
  const order = new Map(index.mainGenres.map((main, position) => [main.name, position]));
  return [...groups]
    .map(([main, subgenres]) => ({ main, subgenres: [...subgenres].sort(collator.compare) }))
    .sort((a, b) => {
      if (a.main === null || b.main === null) return a.main === null ? 1 : -1;
      return (order.get(a.main) ?? 99) - (order.get(b.main) ?? 99) || collator.compare(a.main, b.main);
    });
}

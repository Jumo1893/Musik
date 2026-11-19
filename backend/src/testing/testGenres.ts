// Kleiner Ausschnitt der Genre-Liste aus Migration 006 für Tests ohne Datenbank.

import type { Queryable } from '../db.ts';
import { GenreCatalog, type CatalogGenre } from '../services/genreCatalog.ts';

let nextId = 1;
function genre(name: string, overrides: Partial<CatalogGenre> = {}): CatalogGenre {
  return { id: nextId++, name, isMain: false, fromList: true, position: null, mainGenres: [], aliases: [], ...overrides };
}

export function testGenres(): CatalogGenre[] {
  return [
    genre('Pop', { isMain: true, position: 1, aliases: ['pop music'] }),
    genre('Rock', { isMain: true, position: 2, aliases: ['rock music'] }),
    genre('Hip-Hop', { isMain: true, position: 3, aliases: ['hip hop', 'rap', 'hip-hop/rap'] }),
    genre('Electronic', { isMain: true, position: 4, aliases: ['electronic music'] }),
    genre('R&B & Soul', { isMain: true, position: 5, aliases: ['r&b', 'rnb'] }),
    genre('Alternative Rock', { mainGenres: ['Rock'], aliases: ['alternative'] }),
    genre('Indie Rock', { mainGenres: ['Rock'] }),
    genre('Pop Rock', { mainGenres: ['Pop', 'Rock'] }),
    genre('Dance-Pop', { mainGenres: ['Electronic', 'Pop'] }),
    genre('EDM', { mainGenres: ['Electronic'], aliases: ['electronic dance music', 'dance'] }),
    genre('Electro House', { mainGenres: ['Electronic'] }),
    genre('House', { mainGenres: ['Electronic'], aliases: ['house music'] }),
    genre('Synth-Pop', { mainGenres: ['Electronic', 'Pop'] }),
    genre('Contemporary R&B', { mainGenres: ['R&B & Soul'] }),
    genre('Disco', { mainGenres: ['Pop', 'R&B & Soul'] }),
    genre('New wave pop', { fromList: false, mainGenres: ['Pop'] }),
  ];
}

export function testCatalog(): GenreCatalog {
  return new GenreCatalog(testGenres());
}

/** Datenbank-Ersatz, der auf die Katalog-Abfrage die Test-Genres liefert. */
export function catalogDb(): Queryable {
  const rows = testGenres().map((item) => ({
    id: item.id,
    name: item.name,
    is_main: item.isMain,
    from_list: item.fromList,
    position: item.position,
    main_genres: item.mainGenres,
    featured_in: [],
    aliases: item.aliases,
  }));
  return { query: (async () => ({ rows })) as unknown as Queryable['query'] };
}

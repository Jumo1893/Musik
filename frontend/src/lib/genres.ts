// Genre-Liste mit Haupt- und Untergenres im Browser: Schreibweisen zuordnen, suchen und
// die Genres der Bibliothek nach Hauptgenre ordnen. Gegenstück zu backend/src/services/genreCatalog.ts.

import type { GenreInfo, Song } from '../types.ts';
import { genreKey, mergeGenres, normalizeText } from './songs.ts';

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/** Wörter eines Namens, von Leerzeichen eingerahmt: „New wave pop“ → „ new wave pop “ (wie im Backend) */
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
  readonly #subgenres = new Map<string, GenreInfo[]>();

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
    for (const genre of genres) {
      if (genre.isMain) continue;
      for (const main of genre.mainGenres) {
        const subgenres = this.#subgenres.get(main);
        if (subgenres) subgenres.push(genre);
        else this.#subgenres.set(main, [genre]);
      }
    }
  }

  /** Untergenres eines Hauptgenres (aus der Liste und eigene) in der Reihenfolge der Liste. */
  subgenresOf(main: string): readonly GenreInfo[] {
    return this.#subgenres.get(main) ?? [];
  }

  /**
   * Hauptgenres für ein Genre, das die Liste nicht kennt: die, deren Name oder Schreibweise darin
   * als Wort vorkommt („New wave pop“ → Pop). Dieselbe Regel wendet das Backend beim Speichern an.
   */
  guessMainGenres(name: string): string[] {
    const nameWords = words(name);
    if (nameWords === '') return [];
    return this.mainGenres
      .filter((main) =>
        [main.name, ...main.aliases].some((variant) => {
          const variantWords = words(variant);
          return variantWords !== '' && nameWords.includes(variantWords);
        }),
      )
      .map((main) => main.name);
  }

  find(name: string): GenreInfo | undefined {
    const key = genreKey(name);
    return key === '' ? undefined : this.#byKey.get(key);
  }

  /** Schreibweise der Genre-Liste („hip hop“ → „Hip-Hop“); unbekannte Genres bleiben, wie sie sind. */
  canonical(name: string): string {
    return this.find(name)?.name ?? name.trim();
  }

  /**
   * Hauptgenres eines Genres: das Genre selbst, wenn es eins ist, sonst seine Hauptgenres. Für
   * ein Genre, das die Liste noch nicht kennt, die, die es beim Speichern bekommen wird.
   */
  mainGenresOf(name: string): string[] {
    const genre = this.find(name);
    if (!genre) return this.guessMainGenres(name);
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

/** Hauptgenre in der Baumliste der Genre-Auswahl; aufgeklappt folgen seine Untergenres. */
export interface GenreTreeMainRow {
  kind: 'main';
  /** Hauptgenre; null steht für die Gruppe der eigenen Genres ohne Hauptgenre */
  main: string | null;
  expanded: boolean;
  /** Das Hauptgenre selbst ist gewählt (nicht nur Untergenres davon) */
  selected: boolean;
  /** Wie viele seiner Untergenres gewählt sind */
  selectedCount: number;
}

export interface GenreTreeSubRow {
  kind: 'sub';
  genre: string;
  /** Hauptgenre, unter dem die Zeile steht; null: ohne Hauptgenre */
  main: string | null;
  selected: boolean;
}

/** „Mehr anzeigen“ unter der kurzen Liste eines Hauptgenres */
export interface GenreTreeMoreRow {
  kind: 'more';
  main: string;
  /** Untergenres, die erst „Mehr anzeigen“ zeigt */
  hidden: number;
}

export type GenreTreeRow = GenreTreeMainRow | GenreTreeSubRow | GenreTreeMoreRow;

export interface GenreTreeOptions {
  /** Gewählte Genres */
  value: readonly string[];
  /** Genres der Bibliothek; sie stehen wie die gewählten immer in der kurzen Liste. */
  libraryGenres: readonly string[];
  /** Weitere Genres, die sichtbar bleiben – etwa gerade abgewählte, damit die Zeile nicht verschwindet */
  keepVisible?: readonly string[];
  /** Aufgeklappte Hauptgenres; null steht für die Gruppe ohne Hauptgenre */
  expanded: ReadonlySet<string | null>;
  /** Hauptgenres, unter denen alle Untergenres stehen, nicht nur die kurze Liste */
  showAll: ReadonlySet<string>;
}

/** Würde „Mehr anzeigen“ weniger Untergenres verstecken, stehen gleich alle da. */
const MIN_HIDDEN = 4;

/**
 * Zeilen der Genre-Auswahl als Baum: jedes Hauptgenre, aufgeklappt darunter seine Untergenres.
 * Zuerst steht nur die kurze Liste – bekannte Untergenres (featuredIn) sowie die gewählten und
 * die der Bibliothek –, der Rest folgt nach „Mehr anzeigen“. Ein Untergenre mit zwei
 * Hauptgenres (Pop Rock) steht bei beiden. Eingetippte Genres, die die Liste nicht kennt, stehen
 * bei den Hauptgenres, die sie beim Speichern bekommen; eigene Genres ohne Hauptgenre bilden am
 * Ende eine eigene Gruppe.
 */
export function genreTree(index: GenreIndex, options: GenreTreeOptions): GenreTreeRow[] {
  const keyOf = (name: string) => genreKey(index.canonical(name));
  const selected = new Set(options.value.map(keyOf));
  const keepVisible = options.keepVisible ?? [];
  const pinned = new Set([...options.value, ...options.libraryGenres, ...keepVisible].map(keyOf));

  const unknown = new Map<string | null, string[]>();
  for (const name of mergeGenres(options.value, options.libraryGenres, keepVisible)) {
    if (index.find(name)) continue;
    const mains = index.guessMainGenres(name);
    for (const main of mains.length > 0 ? mains : [null]) unknown.set(main, [...(unknown.get(main) ?? []), name]);
  }

  const rows: GenreTreeRow[] = [];
  const addGroup = (main: string | null, subgenres: string[], short: (name: string) => boolean) => {
    const expanded = options.expanded.has(main);
    rows.push({
      kind: 'main',
      main,
      expanded,
      selected: main !== null && selected.has(genreKey(main)),
      selectedCount: subgenres.filter((name) => selected.has(genreKey(name))).length,
    });
    if (!expanded) return;
    const shortList = subgenres.filter((name) => pinned.has(genreKey(name)) || short(name));
    const hidden = subgenres.length - shortList.length;
    const showAll = main === null || options.showAll.has(main) || hidden < MIN_HIDDEN;
    for (const genre of showAll ? subgenres : shortList) {
      rows.push({ kind: 'sub', genre, main, selected: selected.has(genreKey(genre)) });
    }
    if (!showAll) rows.push({ kind: 'more', main, hidden });
  };

  for (const main of index.mainGenres) {
    const subgenres = mergeGenres(
      index.subgenresOf(main.name).map((genre) => genre.name),
      unknown.get(main.name) ?? [],
    );
    addGroup(main.name, subgenres, (name) => index.find(name)?.featuredIn.includes(main.name) ?? false);
  }

  const withoutMain = mergeGenres(
    index.genres.filter((genre) => !genre.isMain && genre.mainGenres.length === 0).map((genre) => genre.name),
    unknown.get(null) ?? [],
  );
  if (withoutMain.length > 0) addGroup(null, withoutMain, () => true);
  return rows;
}

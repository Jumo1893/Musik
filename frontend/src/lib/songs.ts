// Suchen, Filtern, Sortieren und Exportieren der Songliste im Browser.

import type { Category, Song } from '../types.ts';
import type { CsvCell } from './csv.ts';
import { formatDuration } from './format.ts';

/** Kleinschreibung ohne Akzente und Umlautpunkte: „Mädchen“ wird auch mit „madchen“ gefunden. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export interface SongFilter {
  /** Freitext; alle Wörter müssen in Titel, Interpret, Album oder Genre vorkommen. */
  text: string;
  /** Der Song muss jede dieser Kategorien haben. */
  categoryIds: number[];
  /** Nur Songs ohne jede Kategorie. */
  onlyUncategorized: boolean;
}

export function filterSongs(songs: Song[], filter: SongFilter): Song[] {
  const words = normalizeText(filter.text).split(/\s+/).filter(Boolean);
  return songs.filter((song) => {
    if (filter.onlyUncategorized && song.categoryIds.length > 0) return false;
    if (!filter.categoryIds.every((id) => song.categoryIds.includes(id))) return false;
    if (words.length === 0) return true;
    const haystack = normalizeText(`${song.title} ${song.artist} ${song.album ?? ''} ${song.genre ?? ''}`);
    return words.every((word) => haystack.includes(word));
  });
}

export type SortKey = 'artist' | 'title' | 'duration' | 'rating' | 'year' | 'added';

export interface SortState {
  key: SortKey;
  descending: boolean;
}

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/** Songs ohne Angabe stehen immer am Ende, egal in welche Richtung sortiert wird. */
function compareNumbers(a: number | null, b: number | null, direction: number): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return direction * (a - b);
}

export function sortSongs(songs: Song[], sort: SortState): Song[] {
  const direction = sort.descending ? -1 : 1;
  const byArtistThenTitle = (a: Song, b: Song) =>
    collator.compare(a.artist, b.artist) || collator.compare(a.title, b.title) || a.id - b.id;

  const primary = (a: Song, b: Song): number => {
    switch (sort.key) {
      case 'artist':
        return direction * collator.compare(a.artist, b.artist);
      case 'title':
        return direction * collator.compare(a.title, b.title);
      case 'duration':
        return compareNumbers(a.durationSeconds, b.durationSeconds, direction);
      case 'rating':
        return compareNumbers(a.rating, b.rating, direction);
      case 'year':
        return compareNumbers(a.releaseYear, b.releaseYear, direction);
      case 'added':
        return direction * (Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id);
    }
  };
  return [...songs].sort((a, b) => primary(a, b) || byArtistThenTitle(a, b));
}

export function totalDuration(songs: Song[]): number {
  return songs.reduce((total, song) => total + (song.durationSeconds ?? 0), 0);
}

/** Alle Genres der Bibliothek, jede Schreibweise nur einmal, alphabetisch. */
export function distinctGenres(songs: Song[]): string[] {
  const byKey = new Map<string, string>();
  for (const song of songs) {
    const genre = song.genre?.trim();
    if (genre && !byKey.has(genre.toLowerCase())) byKey.set(genre.toLowerCase(), genre);
  }
  return [...byKey.values()].sort(collator.compare);
}

export const SONG_CSV_HEADER = [
  'Titel',
  'Interpret',
  'Album',
  'Dauer',
  'Dauer (Sekunden)',
  'Jahr',
  'Genre',
  'BPM',
  'Energie',
  'Bewertung',
  'Kategorien',
  'Apple Music',
  'YouTube',
  'YouTube Music',
  'Notizen',
];

export function songCsvRow(song: Song, categories: Map<number, Category>): CsvCell[] {
  const categoryNames = song.categoryIds
    .map((id) => categories.get(id)?.name)
    .filter((name) => name !== undefined)
    .sort(collator.compare);
  return [
    song.title,
    song.artist,
    song.album,
    song.durationSeconds === null ? null : formatDuration(song.durationSeconds),
    song.durationSeconds,
    song.releaseYear,
    song.genre,
    song.bpm,
    song.energy,
    song.rating,
    categoryNames.join(', '),
    song.appleMusicUrl,
    song.youtubeUrl,
    song.youtubeMusicUrl,
    song.notes,
  ];
}

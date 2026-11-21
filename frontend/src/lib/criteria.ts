// Kriterien des Playlist-Generators: Standardwerte und Beschreibung in Worten.

import type { Category, GeneratorCriteria, PlaylistOrder } from '../types.ts';

export const ORDER_OPTIONS: Array<{ value: PlaylistOrder; label: string; hint: string }> = [
  { value: 'shuffle', label: 'Gemischt', hint: 'Zufällige Reihenfolge; derselbe Interpret läuft nie zweimal hintereinander.' },
  { value: 'best-first', label: 'Passendste zuerst', hint: 'Die besten Treffer stehen am Anfang.' },
  { value: 'energy-up', label: 'Aufbauend', hint: 'Von ruhig zu energiegeladen.' },
  { value: 'energy-down', label: 'Ausklingend', hint: 'Von energiegeladen zu ruhig.' },
  { value: 'energy-arc', label: 'Bogen', hint: 'Erst aufbauen, dann wieder ausklingen.' },
];

export const EMPTY_CRITERIA: GeneratorCriteria = {
  includeCategoryIds: [],
  matchMode: 'any',
  excludeCategoryIds: [],
  excludeSongIds: [],
  genres: [],
  minRating: null,
  energyMin: null,
  energyMax: null,
  singAlongMin: null,
  singAlongMax: null,
  yearFrom: null,
  yearTo: null,
  excludeExplicit: false,
  languages: [],
  targetMinutes: 60,
  maxSongs: null,
  maxPerArtist: null,
  order: 'shuffle',
  seed: null,
};

export function randomSeed(): number {
  return Math.floor(Math.random() * 4_294_967_296);
}

function names(ids: number[], categories: Map<number, Category>): string[] {
  return ids.map((id) => categories.get(id)?.name).filter((name) => name !== undefined);
}

function range(from: number | null, to: number | null, prefix = ''): string | null {
  if (from !== null && to !== null) return from === to ? `${prefix}${from}` : `${prefix}${from}–${to}`;
  if (from !== null) return `${prefix}ab ${from}`;
  if (to !== null) return `${prefix}bis ${to}`;
  return null;
}

/** Die gesetzten Kriterien als kurze, lesbare Stichpunkte. */
export function describeCriteria(criteria: GeneratorCriteria, categories: Map<number, Category>): string[] {
  const parts: string[] = [];

  const included = names(criteria.includeCategoryIds, categories);
  if (included.length === 1) parts.push(included[0]!);
  else if (included.length > 1) {
    parts.push(`${criteria.matchMode === 'all' ? 'alle von' : 'eine von'}: ${included.join(', ')}`);
  }

  const excluded = names(criteria.excludeCategoryIds, categories);
  if (excluded.length > 0) parts.push(`ohne ${excluded.join(', ')}`);

  if (criteria.genres.length > 0) parts.push(`Genre: ${criteria.genres.join(', ')}`);
  if (criteria.minRating !== null) {
    parts.push(criteria.minRating === 5 ? '5 Sterne' : `mindestens ${criteria.minRating} ${criteria.minRating === 1 ? 'Stern' : 'Sterne'}`);
  }

  const energy = range(criteria.energyMin, criteria.energyMax, 'Energie ');
  if (energy) parts.push(energy);
  // Playlists von vor dem Mitsingen-Filter haben die Angabe gar nicht.
  const singAlong = range(criteria.singAlongMin ?? null, criteria.singAlongMax ?? null, 'Mitsingen ');
  if (singAlong) parts.push(singAlong);
  const years = range(criteria.yearFrom, criteria.yearTo);
  if (years) parts.push(/^\d/.test(years) ? `Jahr ${years}` : years);

  // Playlists von vor diesen Optionen haben die Angaben gar nicht.
  if (criteria.excludeExplicit) parts.push('ohne explizite Texte');
  const languages = criteria.languages ?? [];
  if (languages.length > 0) parts.push(`Sprache: ${languages.join(', ')}`);

  if (criteria.targetMinutes !== null) parts.push(`Ziel ${criteria.targetMinutes} Min.`);
  if (criteria.maxSongs !== null) parts.push(`höchstens ${criteria.maxSongs} ${criteria.maxSongs === 1 ? 'Song' : 'Songs'}`);
  if (criteria.maxPerArtist !== null) parts.push(`höchstens ${criteria.maxPerArtist} pro Interpret`);

  const order = ORDER_OPTIONS.find((option) => option.value === criteria.order);
  if (order && criteria.order !== 'shuffle') parts.push(`Reihenfolge: ${order.label}`);

  return parts;
}

/** Namensvorschlag aus den gewünschten Kategorien, z. B. „melancholisch & nachdenklich“. */
export function suggestPlaylistName(criteria: GeneratorCriteria, categories: Map<number, Category>, today = new Date()): string {
  const included = names(criteria.includeCategoryIds, categories);
  if (included.length > 0 && included.length <= 3) return included.join(' & ');
  const date = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(today);
  return `Playlist vom ${date}`;
}

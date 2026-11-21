// Vorschläge beim Einordnen eines Songs, abgeleitet aus den schon eingeordneten Songs der
// Bibliothek – eine nachvollziehbare Rechnung, keine KI, ohne Internet. Ähnlich sind Songs
// desselben Interpreten (zählt stark), mit gemeinsamem Untergenre (mittel) und mit gleichem
// Hauptgenre bei ähnlichem Tempo (schwach).

import type { Category, Song } from '../types.ts';
import { sameMainArtist } from './songMatching.ts';
import { genreKey } from './songs.ts';

/** Der Song, für den Vorschläge gesucht werden. */
export interface SuggestionTarget {
  /** Beim Bearbeiten der Song selbst; er zählt nicht als ähnlicher Song. */
  id: number | null;
  artist: string;
  genres: readonly string[];
  /** Hauptgenres der Genres */
  mainGenres: readonly string[];
  bpm: number | null;
}

export interface CategorySuggestion {
  categoryId: number;
  /** Grund für den Tooltip, z. B. „4 von 5 Songs von Johnny Cash haben „melancholisch““ */
  reason: string;
  score: number;
}

/** Übliche Stufe ähnlicher Songs auf einer Skala von 1 bis 5. */
export interface ScaleHint {
  /** Häufigste Stufe */
  value: number;
  /** So viele ähnliche Songs haben sie … */
  count: number;
  /** … von so vielen mit Angabe */
  total: number;
  /** Wer verglichen wurde, z. B. „Songs von Johnny Cash“ */
  basis: string;
}

export interface LibrarySuggestions {
  categories: CategorySuggestion[];
  energy: ScaleHint | null;
  singAlong: ScaleHint | null;
}

/** Höchstens so viele Kategorien werden vorgeschlagen. */
export const MAX_CATEGORY_SUGGESTIONS = 5;
/** Erst ab so vielen passenden Songs mit Angabe gibt es Vorschläge. */
const MIN_SONGS = 2;
/** Mindestens dieser Anteil der passenden Songs muss die Kategorie tragen. */
const MIN_SHARE = 0.5;
/** Tempo-Abstand, der noch als „ähnlich“ gilt */
const BPM_TOLERANCE = 10;

interface SimilarGroup {
  songs: Song[];
  weight: number;
  /** z. B. „Songs von Johnny Cash“ */
  basis: string;
  /** Beschreibung, wenn mehrere Gruppen gleichen Gewichts zusammen zählen */
  combinedBasis: string;
  /** Grund für eine Kategorie: count von total Songs haben sie */
  reason: (count: number, total: number, category: string) => string;
}

/** Gruppen ähnlicher Songs, die stärkste zuerst. */
function similarGroups(songs: readonly Song[], target: SuggestionTarget): SimilarGroup[] {
  const others = songs.filter((song) => song.id !== target.id);
  const groups: SimilarGroup[] = [];

  const artist = target.artist.trim();
  if (artist !== '') {
    groups.push({
      songs: others.filter((song) => sameMainArtist(artist, song.artist)),
      weight: 3,
      basis: `Songs von ${artist}`,
      combinedBasis: `Songs von ${artist}`,
      reason: (count, total, category) => `${count} von ${total} Songs von ${artist} haben „${category}“`,
    });
  }

  const mainKeys = new Set(target.mainGenres.map(genreKey));
  for (const genre of target.genres) {
    const key = genreKey(genre);
    if (mainKeys.has(key)) continue;
    groups.push({
      songs: others.filter((song) => song.genres.some((other) => genreKey(other) === key)),
      weight: 2,
      basis: `Songs mit ${genre}`,
      combinedBasis: 'Songs mit gemeinsamem Untergenre',
      reason: (count, total, category) => `häufig bei ${genre}: ${count} von ${total} Songs haben „${category}“`,
    });
  }

  if (target.bpm !== null) {
    const bpm = target.bpm;
    for (const main of target.mainGenres) {
      groups.push({
        songs: others.filter(
          (song) => song.mainGenres.includes(main) && song.bpm !== null && Math.abs(song.bpm - bpm) <= BPM_TOLERANCE,
        ),
        weight: 1,
        basis: `${main}-Songs mit ähnlichem Tempo`,
        combinedBasis: 'Songs im gleichen Hauptgenre mit ähnlichem Tempo',
        reason: (count, total, category) =>
          `häufig bei ${main} mit ähnlichem Tempo (±${BPM_TOLERANCE} BPM): ${count} von ${total} Songs haben „${category}“`,
      });
    }
  }
  return groups;
}

/** Kategorien, die die meisten ähnlichen Songs tragen; schon gewählte fehlen. */
function suggestCategories(
  groups: readonly SimilarGroup[],
  categories: ReadonlyMap<number, Category>,
  selected: readonly number[],
): CategorySuggestion[] {
  const best = new Map<number, CategorySuggestion & { count: number }>();
  for (const group of groups) {
    // Es zählen nur Songs, die überhaupt eine Kategorie haben.
    const members = group.songs.filter((song) => song.categoryIds.length > 0);
    if (members.length < MIN_SONGS) continue;
    const counts = new Map<number, number>();
    for (const song of members) for (const id of song.categoryIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [categoryId, count] of counts) {
      const category = categories.get(categoryId);
      const share = count / members.length;
      if (!category || selected.includes(categoryId) || share < MIN_SHARE) continue;
      const score = group.weight * share;
      const known = best.get(categoryId);
      if (!known || score > known.score || (score === known.score && count > known.count)) {
        best.set(categoryId, { categoryId, score, count, reason: group.reason(count, members.length, category.name) });
      }
    }
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.count - a.count ||
        (categories.get(a.categoryId)?.name ?? '').localeCompare(categories.get(b.categoryId)?.name ?? '', 'de'),
    )
    .slice(0, MAX_CATEGORY_SUGGESTIONS)
    .map(({ categoryId, reason, score }) => ({ categoryId, reason, score }));
}

/** Häufigste Stufe in der stärksten Gruppe, in der genug Songs die Angabe haben. */
function scaleHint(groups: readonly SimilarGroup[], valueOf: (song: Song) => number | null): ScaleHint | null {
  // Untergenres zählen gemeinsam: ein Song mit irgendeinem gemeinsamen Untergenre ist ähnlich.
  const byWeight = new Map<number, { songs: Map<number, Song>; groups: SimilarGroup[] }>();
  for (const group of groups) {
    const entry = byWeight.get(group.weight) ?? { songs: new Map<number, Song>(), groups: [] as SimilarGroup[] };
    for (const song of group.songs) entry.songs.set(song.id, song);
    entry.groups.push(group);
    byWeight.set(group.weight, entry);
  }
  for (const weight of [...byWeight.keys()].sort((a, b) => b - a)) {
    const { songs, groups: sameWeight } = byWeight.get(weight)!;
    const values = [...songs.values()].map(valueOf).filter((value) => value !== null);
    if (values.length < MIN_SONGS) continue;
    const counts = new Map<number, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    // Bei Gleichstand gewinnt die Stufe näher am Durchschnitt, dann die niedrigere.
    const [value, count] = [...counts].sort(
      (a, b) => b[1] - a[1] || Math.abs(a[0] - mean) - Math.abs(b[0] - mean) || a[0] - b[0],
    )[0]!;
    const basis = sameWeight.length === 1 ? sameWeight[0]!.basis : sameWeight[0]!.combinedBasis;
    return { value, count, total: values.length, basis };
  }
  return null;
}

/**
 * Vorschläge für einen Song aus den ähnlichen Songs der Bibliothek. `selected`: schon gewählte
 * Kategorien, die nicht noch einmal vorgeschlagen werden.
 */
export function librarySuggestions(
  songs: readonly Song[],
  target: SuggestionTarget,
  categories: ReadonlyMap<number, Category>,
  selected: readonly number[] = [],
): LibrarySuggestions {
  const groups = similarGroups(songs, target);
  return {
    categories: suggestCategories(groups, categories, selected),
    energy: scaleHint(groups, (song) => song.energy),
    singAlong: scaleHint(groups, (song) => song.singAlong),
  };
}

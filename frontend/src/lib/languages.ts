// Sprache, in der ein Song gesungen wird – oder „Instrumental“ ohne Gesang. Feste Schreibweise
// für die drei häufigen Angaben, andere Sprachen als Freitext.

import type { Song } from '../types.ts';
import { versionMarks } from './songMatching.ts';
import { genreKey } from './songs.ts';

/** Schnellauswahl im Song-Dialog, in dieser Reihenfolge */
export const LANGUAGES = ['Deutsch', 'Englisch', 'Instrumental'] as const;

/** Gleiche Sprache, egal in welcher Groß- und Kleinschreibung. */
export function sameLanguage(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export interface LanguageSuggestion {
  language: string;
  /** Warum, z. B. „wegen Schlager“ */
  reason: string;
}

/** Genres, die deutsche Texte nahelegen: alles mit „deutsch“ im Namen, dazu Schlager und Austropop. */
function suggestsGerman(genre: string): boolean {
  const key = genreKey(genre);
  return key.includes('deutsch') || key === 'schlager' || key === 'austropop';
}

/**
 * Naheliegende Sprache eines Songs, nur als Vorschlag: „(Instrumental)“ im Titel oder ein
 * Instrumental-Genre legen „Instrumental“ nahe, Genres wie Deutschrap, Deutschpop, Schlager oder
 * Neue Deutsche Welle „Deutsch“. Sonst null.
 */
export function suggestLanguage(title: string, genres: readonly string[]): LanguageSuggestion | null {
  if (versionMarks(title).includes('instrumental')) return { language: 'Instrumental', reason: '„Instrumental“ im Titel' };
  const instrumental = genres.find((genre) => genreKey(genre).includes('instrumental'));
  if (instrumental) return { language: 'Instrumental', reason: `wegen ${instrumental}` };
  const german = genres.find(suggestsGerman);
  if (german) return { language: 'Deutsch', reason: `wegen ${german}` };
  return null;
}

/** Sprachen der Bibliothek mit Anzahl Songs: die festen zuerst, dann weitere alphabetisch. */
export function libraryLanguages(songs: readonly Song[]): Array<{ language: string; count: number }> {
  const counts = new Map<string, { language: string; count: number }>();
  for (const song of songs) {
    if (song.language === null) continue;
    const key = song.language.trim().toLowerCase();
    const entry = counts.get(key) ?? { language: song.language.trim(), count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  const rank = (language: string) => {
    const index = LANGUAGES.findIndex((known) => sameLanguage(known, language));
    return index === -1 ? LANGUAGES.length : index;
  };
  return [...counts.values()].sort(
    (a, b) => rank(a.language) - rank(b.language) || a.language.localeCompare(b.language, 'de'),
  );
}

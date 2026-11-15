// Playlist-Generator: wählt aus der Bibliothek die Songs aus, die am besten zu den
// Kriterien passen, und bringt sie in eine sinnvolle Reihenfolge. Reine Funktionen
// ohne Datenbankzugriff, damit sich das Verhalten gut testen lässt.

import type { GeneratorCriteria } from '../schemas.ts';

/** Die Angaben eines Songs, die der Generator braucht. */
export interface GeneratorSong {
  id: number;
  artist: string;
  durationSeconds: number | null;
  releaseYear: number | null;
  genre: string | null;
  energy: number | null;
  rating: number | null;
  categoryIds: number[];
}

export interface GeneratorResult {
  /** Song-IDs in Abspielreihenfolge */
  songIds: number[];
  /** So viele Songs erfüllen alle Filter; aus ihnen wurde ausgewählt. */
  candidateCount: number;
  /** Startwert des Zufallsgenerators, mit dem sich das Ergebnis wiederholen lässt. */
  seed: number;
}

/** Songs ohne Dauer zählen für die Ziel-Dauer mit diesem Wert (3:30). */
export const ASSUMED_DURATION_SECONDS = 210;
/** Um so viel darf die Ziel-Dauer überschritten werden. */
export const DURATION_TOLERANCE_SECONDS = 30;
/** Songs ohne Energie-Angabe werden beim Sortieren in die Mitte eingeordnet. */
const NEUTRAL_ENERGY = 3;

// Gewichte der Bewertung eines Kandidaten. Der Zufallsanteil sorgt für Abwechslung
// zwischen zwei Durchläufen, ist aber kleiner als der Unterschied zwischen
// „passt zu einer“ und „passt zu zwei von zwei“ Kategorien.
const WEIGHT_CATEGORY_FIT = 0.55;
const WEIGHT_RATING = 0.25;
const WEIGHT_RANDOM = 0.2;

/** Kleiner, schneller Zufallsgenerator (mulberry32) mit festem Startwert. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

function artistKey(song: GeneratorSong): string {
  return song.artist.trim().toLowerCase();
}

function energyOf(song: GeneratorSong): number {
  return song.energy ?? NEUTRAL_ENERGY;
}

function orderedRange(min: number | null, max: number | null): [number | null, number | null] {
  return min !== null && max !== null && min > max ? [max, min] : [min, max];
}

/** Ein Song ohne Angabe kann einen gesetzten Bereich nicht erfüllen. */
function withinRange(value: number | null, min: number | null, max: number | null): boolean {
  if (min === null && max === null) return true;
  if (value === null) return false;
  return (min === null || value >= min) && (max === null || value <= max);
}

function countHits(song: GeneratorSong, wanted: ReadonlySet<number>): number {
  let hits = 0;
  for (const id of song.categoryIds) if (wanted.has(id)) hits++;
  return hits;
}

/** Liefert die Prüffunktion für die harten Filter der Kriterien. */
export function buildFilter(criteria: GeneratorCriteria): (song: GeneratorSong) => boolean {
  const wanted = new Set(criteria.includeCategoryIds);
  const excluded = new Set(criteria.excludeCategoryIds);
  const excludedSongs = new Set(criteria.excludeSongIds);
  const genres = new Set(criteria.genres.map((genre) => genre.trim().toLowerCase()));
  const [energyMin, energyMax] = orderedRange(criteria.energyMin, criteria.energyMax);
  const [yearFrom, yearTo] = orderedRange(criteria.yearFrom, criteria.yearTo);

  return (song) => {
    if (excludedSongs.has(song.id)) return false;
    if (song.categoryIds.some((id) => excluded.has(id))) return false;
    if (wanted.size > 0) {
      const hits = countHits(song, wanted);
      if (criteria.matchMode === 'all' ? hits < wanted.size : hits === 0) return false;
    }
    if (genres.size > 0 && (song.genre === null || !genres.has(song.genre.trim().toLowerCase()))) return false;
    if (criteria.minRating !== null && (song.rating === null || song.rating < criteria.minRating)) return false;
    if (!withinRange(song.energy, energyMin, energyMax)) return false;
    if (!withinRange(song.releaseYear, yearFrom, yearTo)) return false;
    return true;
  };
}

/**
 * Stellt Songs so um, dass möglichst nie zwei Songs desselben Interpreten direkt
 * aufeinander folgen. `previousArtist` ist der Interpret unmittelbar vor der Liste.
 */
export function spreadArtists<T>(
  items: readonly T[],
  artistOf: (item: T) => string,
  previousArtist: string | null = null,
): T[] {
  const result = [...items];
  const artistBefore = (index: number) => (index === 0 ? previousArtist : artistOf(result[index - 1]!));

  for (let i = 0; i < result.length; i++) {
    const before = artistBefore(i);
    const artist = artistOf(result[i]!);
    if (before === null || artist !== before) continue;

    // Bevorzugt: mit dem nächsten Song eines anderen Interpreten tauschen.
    const swapIndex = result.findIndex((candidate, j) => j > i && artistOf(candidate) !== before);
    if (swapIndex !== -1) {
      [result[i], result[swapIndex]] = [result[swapIndex]!, result[i]!];
      continue;
    }

    // Sonst weiter vorne eine Lücke zwischen zwei anderen Interpreten suchen.
    for (let k = i - 1; k >= 0; k--) {
      if (artistBefore(k) !== artist && artistOf(result[k]!) !== artist) {
        const [moved] = result.splice(i, 1);
        result.splice(k, 0, moved!);
        break;
      }
    }
  }
  return result;
}

/** Wendet spreadArtists auf jeden Abschnitt gleicher Energie an, ohne die Energie-Reihenfolge zu stören. */
function spreadArtistsWithinEnergyLevels(songs: readonly GeneratorSong[]): GeneratorSong[] {
  const result: GeneratorSong[] = [];
  let start = 0;
  while (start < songs.length) {
    let end = start + 1;
    while (end < songs.length && energyOf(songs[end]!) === energyOf(songs[start]!)) end++;
    const previous = result.length > 0 ? artistKey(result[result.length - 1]!) : null;
    result.push(...spreadArtists(songs.slice(start, end), artistKey, previous));
    start = end;
  }
  return result;
}

function arrange(
  picked: readonly GeneratorSong[],
  order: GeneratorCriteria['order'],
  rng: () => number,
): GeneratorSong[] {
  if (order === 'best-first') return [...picked]; // bereits nach Bewertung sortiert
  const shuffled = shuffle(picked, rng);
  if (order === 'shuffle') return spreadArtists(shuffled, artistKey);

  // Stabil sortieren: innerhalb gleicher Energie bleibt die zufällige Reihenfolge erhalten.
  const rising = [...shuffled].sort((a, b) => energyOf(a) - energyOf(b));
  if (order === 'energy-up') return spreadArtistsWithinEnergyLevels(rising);
  if (order === 'energy-down') return spreadArtistsWithinEnergyLevels(rising.reverse());

  // energy-arc: jeder zweite Song baut auf, die übrigen bauen danach wieder ab.
  const buildUp = rising.filter((_, index) => index % 2 === 0);
  const coolDown = rising.filter((_, index) => index % 2 === 1).reverse();
  return spreadArtistsWithinEnergyLevels([...buildUp, ...coolDown]);
}

export function generatePlaylist(songs: readonly GeneratorSong[], criteria: GeneratorCriteria): GeneratorResult {
  const seed = criteria.seed ?? Math.floor(Math.random() * 4_294_967_296);
  const rng = createRng(seed);

  const candidates = songs.filter(buildFilter(criteria));
  const wanted = new Set(criteria.includeCategoryIds);

  // Jeden Kandidaten bewerten: Wie viele der gewünschten Kategorien trifft er, wie gut
  // ist er bewertet (ohne Bewertung = neutral), plus etwas Zufall für Abwechslung.
  const ranked = [...candidates]
    .sort((a, b) => a.id - b.id) // feste Ausgangsreihenfolge, damit derselbe Seed dasselbe Ergebnis liefert
    .map((song) => {
      const categoryFit = wanted.size === 0 ? 0 : countHits(song, wanted) / wanted.size;
      const ratingFit = song.rating === null ? 0.5 : (song.rating - 1) / 4;
      const score = categoryFit * WEIGHT_CATEGORY_FIT + ratingFit * WEIGHT_RATING + rng() * WEIGHT_RANDOM;
      return { song, score };
    })
    .sort((a, b) => b.score - a.score || a.song.id - b.song.id);

  // Von oben nach unten auffüllen. Songs, die die Ziel-Dauer sprengen würden, werden
  // übersprungen – ein kürzerer Song weiter unten kann die Lücke noch füllen.
  const targetSeconds = criteria.targetMinutes === null ? null : criteria.targetMinutes * 60;
  const songsPerArtist = new Map<string, number>();
  const picked: GeneratorSong[] = [];
  let totalSeconds = 0;

  for (const { song } of ranked) {
    if (criteria.maxSongs !== null && picked.length >= criteria.maxSongs) break;

    const artist = artistKey(song);
    const artistCount = songsPerArtist.get(artist) ?? 0;
    if (criteria.maxPerArtist !== null && artistCount >= criteria.maxPerArtist) continue;

    const duration = song.durationSeconds ?? ASSUMED_DURATION_SECONDS;
    if (targetSeconds !== null && totalSeconds + duration > targetSeconds + DURATION_TOLERANCE_SECONDS) continue;

    picked.push(song);
    totalSeconds += duration;
    songsPerArtist.set(artist, artistCount + 1);
  }

  return {
    songIds: arrange(picked, criteria.order, rng).map((song) => song.id),
    candidateCount: candidates.length,
    seed,
  };
}

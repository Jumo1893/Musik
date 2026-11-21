// Genres eines Songs über MusicBrainz nachschlagen. MusicBrainz sammelt Genre-Angaben seiner
// Nutzer als Tags mit Stimmenzahl – an der Aufnahme selbst, an Single und Album und am
// Interpreten. Ausgewertet wird die genaueste Ebene, die etwas weiß (die Aufnahme vor der
// Single, die Single vor dem Album, das Album vor dem Interpreten); die übrigen geben nur
// bei knappen Ergebnissen den Ausschlag. Es zählen nur Tags, die die Genre-Liste kennt –
// „seen live“ oder „league of legends“ fallen so von selbst heraus.

import type { Queryable } from '../db.ts';
import type { GenreMatch } from '../types.ts';
import { loadGenreCatalog, type CatalogGenre, type GenreCatalog } from './genreCatalog.ts';
import {
  MusicBrainzClient,
  type MbRecording,
  type MbReleaseGroupHit,
  type MbTag,
  type MusicBrainzOptions,
} from './musicBrainz.ts';
import { SongQueue } from './songQueue.ts';
import {
  artistScore,
  coreTitle,
  isOtherVersion,
  plainArtist,
  plainTitle,
  sameVersion,
  simplify,
  titleScore,
  type SongQuery,
} from './songMatching.ts';

/** Ergebnisse werden einen Tag lang gemerkt, damit derselbe Song nicht mehrfach abgefragt wird. */
const CACHE_TTL_MS = 24 * 60 * 60_000;
const CACHE_SIZE = 300;
/** Zusätzliche Pause zwischen zwei Songs beim Nachtragen im Hintergrund */
const BACKGROUND_DELAY_MS = 1000;
const BACKGROUND_MAX_FAILURES = 3;
/** Schwächere Suchtreffer von MusicBrainz bleiben außen vor. */
const MIN_SEARCH_SCORE = 70;
/** Höchstens so viele Genres werden übernommen … */
const MAX_GENRES = 3;
/** … und höchstens so viele weitere vorgeschlagen. */
const MAX_SUGGESTIONS = 6;
/** Übernommen wird, was mindestens 60 % der Punkte des besten Genres hat. */
const PICK_SHARE = 0.6;
/** Vorgeschlagen wird, was wenigstens so viel davon hat. */
const SUGGEST_SHARE = 0.15;
/** Gewicht der weniger genauen Ebenen neben der genauesten */
const SECONDARY_WEIGHT = 0.25;

/** Tags einer Ebene, von genau (Aufnahme) bis allgemein (Interpret). */
export interface TagLevel {
  source: 'recording' | 'single' | 'album' | 'artist';
  tags: MbTag[];
}

export interface GenreEvidence {
  recording: { id: string; title: string; artist: string };
  /** Jahr der frühesten Single, EP oder des frühesten Albums mit dem Song */
  firstReleaseYear: number | null;
  /** Alle passenden Aufnahmen, die beste zuerst (für Links zum Anhören) */
  recordingIds: string[];
  levels: TagLevel[];
}

export interface RankedGenre {
  genre: CatalogGenre;
  score: number;
}

/** Interpret einer Aufnahme so, wie MusicBrainz ihn nennt: „Timbaland feat. OneRepublic“. */
export function creditName(recording: Pick<MbRecording, 'artist-credit'>): string {
  return (recording['artist-credit'] ?? [])
    .map((credit) => credit.name + (credit.joinphrase ?? ''))
    .join('')
    .trim();
}

/**
 * Aufnahmen, die zum gesuchten Song passen (Titel und Interpret), die beste zuerst: genaue
 * Schreibweise vor ungefährer, dann die passendere Dauer, dann die Reihenfolge der Suche.
 * Remixe und andere Bearbeitungen zählen nur, wenn genau so eine gesucht ist.
 */
export function matchingRecordings(recordings: readonly MbRecording[], query: SongQuery): MbRecording[] {
  const wantedMs = query.durationSeconds ? query.durationSeconds * 1000 : null;
  return recordings
    .map((recording, index) => {
      const forArtist = artistScore(query.artist, creditName(recording));
      const forTitle = titleScore(query.title, recording.title);
      const gap = wantedMs !== null && recording.length ? Math.abs(wantedMs - recording.length) : Number.POSITIVE_INFINITY;
      return { recording, index, forArtist, forTitle, gap };
    })
    .filter(
      (item) =>
        (item.recording.score ?? 100) >= MIN_SEARCH_SCORE &&
        item.forArtist > 0 &&
        item.forTitle > 0 &&
        !isOtherVersion(query.title, item.recording.title),
    )
    .sort((a, b) => b.forArtist + b.forTitle - (a.forArtist + a.forTitle) || a.gap - b.gap || a.index - b.index)
    .map((item) => item.recording);
}

/** Stimmen aller passenden Aufnahmen je Tag zusammengezählt (Remaster, Single- und Albumfassung). */
function sumTags(recordings: readonly MbRecording[]): MbTag[] {
  const counts = new Map<string, number>();
  for (const recording of recordings) {
    for (const tag of recording.tags ?? []) {
      if (tag.count > 0) counts.set(tag.name, (counts.get(tag.name) ?? 0) + tag.count);
    }
  }
  return [...counts].map(([name, count]) => ({ name, count }));
}

/** Jahr aus einem Datum von MusicBrainz („2014-09-18“, „2014“); unbekannt ergibt null. */
function yearOf(date: string): number | null {
  const year = Number(date.slice(0, 4));
  return Number.isInteger(year) && year >= 1000 && year <= 2200 ? year : null;
}

/**
 * Die Veröffentlichungen, deren Tags etwas über den Song sagen: die erste Single (oder EP)
 * mit seinem Titel und das erste Album, auf dem er erschien. Sampler, Live-Alben und
 * Remix-Sammlungen bleiben außen vor. Das frühere der beiden ist die Erstveröffentlichung.
 */
export function pickReleaseGroups(
  recordings: readonly MbRecording[],
  query: SongQuery,
): { single: string | null; album: string | null; firstYear: number | null } {
  const groups = new Map<string, { type: string; title: string; date: string }>();
  for (const recording of recordings) {
    for (const release of recording.releases ?? []) {
      const group = release['release-group'];
      const type = group?.['primary-type'];
      if (!group || !type || (group['secondary-types'] ?? []).length > 0) continue;
      const date = release.date || '9999';
      const known = groups.get(group.id);
      if (!known || date < known.date) groups.set(group.id, { type, title: group.title ?? '', date });
    }
  }
  const earliest = (types: string[], fits: (title: string) => boolean = () => true) =>
    [...groups]
      .filter(([, group]) => types.includes(group.type) && fits(group.title))
      .sort((a, b) => a[1].date.localeCompare(b[1].date))[0]?.[0] ?? null;
  const single = earliest(['Single', 'EP'], (title) => coreTitle(title) === coreTitle(query.title));
  const album = earliest(['Album']);
  const years = [single, album]
    .map((id) => (id === null ? null : yearOf(groups.get(id)!.date)))
    .filter((year) => year !== null);
  return { single, album, firstYear: years.length > 0 ? Math.min(...years) : null };
}

/**
 * Jahr der Erstveröffentlichung: das früheste aus den Singles und Alben der passenden Aufnahmen
 * (`picked`, siehe pickReleaseGroups), aus den passenden Aufnahmen selbst (ohne Live-Mitschnitte
 * und andere Fassungen) und aus den Singles und EPs mit dem Titel des Songs („Folsom Prison
 * Blues / So Doggone Lonesome“). Bei bekannten Songs liefert die Suche nach Aufnahmen oft nur
 * Live- und Sampler-Fassungen; die Single findet die Suche nach Veröffentlichungen.
 */
export function earliestReleaseYear(
  picked: number | null,
  recordings: readonly MbRecording[],
  singles: readonly MbReleaseGroupHit[],
  query: SongQuery,
): number | null {
  const years = picked === null ? [] : [picked];
  for (const recording of recordings) {
    if (/\blive\b/i.test(recording.disambiguation ?? '') || !sameVersion(query.title, recording.title)) continue;
    const year = yearOf(recording['first-release-date'] ?? '');
    if (year !== null) years.push(year);
  }
  for (const single of singles) {
    if (!['Single', 'EP'].includes(single['primary-type'] ?? '') || (single['secondary-types'] ?? []).length > 0) continue;
    const sides = (single.title ?? '').split(/\s+\/\s+/);
    if (!sides.some((side) => coreTitle(side) === coreTitle(query.title) && sameVersion(query.title, side))) continue;
    if (artistScore(query.artist, creditName(single)) === 0) continue;
    const year = yearOf(single['first-release-date'] ?? '');
    if (year !== null) years.push(year);
  }
  return years.length > 0 ? Math.min(...years) : null;
}

/** Tags einer Ebene, die der Katalog kennt: je Genre die höchste Stimmenzahl („hip hop“ und „rap“). */
function mappedTags(level: TagLevel, catalog: GenreCatalog): Map<CatalogGenre, number> {
  const mapped = new Map<CatalogGenre, number>();
  for (const tag of level.tags) {
    if (tag.count <= 0) continue;
    const genre = catalog.find(tag.name);
    if (genre) mapped.set(genre, Math.max(mapped.get(genre) ?? 0, tag.count));
  }
  return mapped;
}

/**
 * Punkte je Genre: Auf jeder Ebene zählt der Anteil an den Stimmen des stärksten Tags; die
 * genaueste Ebene mit bekannten Genres voll, die anderen mit einem Viertel.
 */
export function rankGenres(levels: readonly TagLevel[], catalog: GenreCatalog): RankedGenre[] {
  const scores = new Map<CatalogGenre, number>();
  let weight = 1;
  for (const level of levels) {
    const mapped = mappedTags(level, catalog);
    if (mapped.size === 0) continue;
    const strongest = Math.max(...mapped.values());
    for (const [genre, count] of mapped) scores.set(genre, (scores.get(genre) ?? 0) + (weight * count) / strongest);
    weight = SECONDARY_WEIGHT;
  }
  return [...scores]
    .map(([genre, score]) => ({ genre, score }))
    .sort(
      (a, b) =>
        b.score - a.score || Number(a.genre.isMain) - Number(b.genre.isMain) || a.genre.name.localeCompare(b.genre.name),
    );
}

/**
 * Wählt die Genres zum Übernehmen: die starken in der Reihenfolge ihrer Punkte. Ein Hauptgenre
 * entfällt, wenn ein gewähltes Untergenre es mitbringt (Alternative Rock bringt Rock mit).
 * Alles Weitere wird nur vorgeschlagen.
 */
export function chooseGenres(ranked: readonly RankedGenre[]): { genres: string[]; suggestions: string[] } {
  const top = ranked[0]?.score ?? 0;
  if (top <= 0) return { genres: [], suggestions: [] };
  const strong = ranked.filter((item) => item.score >= top * PICK_SHARE);

  const picks: RankedGenre[] = [];
  const covered = new Set<string>();
  for (const item of strong) {
    if (picks.length >= MAX_GENRES) break;
    if (item.genre.isMain && covered.has(item.genre.name)) continue;
    picks.push(item);
    for (const main of item.genre.isMain ? [item.genre.name] : item.genre.mainGenres) covered.add(main);
  }

  // „Pop, Pop Rock“ sagt nicht mehr als „Pop Rock“: Hauptgenres, die ein gewähltes Untergenre mitbringt, entfallen.
  const fromSubgenres = new Set(picks.filter((item) => !item.genre.isMain).flatMap((item) => item.genre.mainGenres));
  const genres = picks.filter((item) => !(item.genre.isMain && fromSubgenres.has(item.genre.name)));

  const picked = new Set(picks);
  const suggestions = ranked
    .filter((item) => !picked.has(item) && item.score >= top * SUGGEST_SHARE && !(item.genre.isMain && covered.has(item.genre.name)))
    .slice(0, MAX_SUGGESTIONS);
  return { genres: genres.map((item) => item.genre.name), suggestions: suggestions.map((item) => item.genre.name) };
}

export interface GenreLookupOptions extends MusicBrainzOptions {
  /** Pause zwischen zwei Songs beim Nachtragen im Hintergrund */
  backgroundDelayMs?: number;
}

interface CacheEntry {
  expires: number;
  evidence: Promise<GenreEvidence | null>;
}

export class GenreLookupService {
  readonly #musicBrainz: MusicBrainzClient;
  readonly #cache = new Map<string, CacheEntry>();
  readonly #background: SongQueue;

  constructor(options: GenreLookupOptions = {}) {
    this.#musicBrainz = new MusicBrainzClient(options);
    this.#background = new SongQueue({
      label: 'Genres',
      delayMs: options.backgroundDelayMs ?? BACKGROUND_DELAY_MS,
      maxFailures: BACKGROUND_MAX_FAILURES,
      work: (db, songId) => this.#fillOne(db, songId),
    });
  }

  /** Sucht die Genres eines Songs. null: MusicBrainz kennt den Song nicht oder nennt keine Genres. */
  async lookup(db: Queryable, query: SongQuery): Promise<GenreMatch | null> {
    const catalog = await loadGenreCatalog(db);
    const evidence = await this.#evidence(query, catalog);
    if (!evidence) return null;
    const { genres, suggestions } = chooseGenres(rankGenres(evidence.levels, catalog));
    if (genres.length === 0 && evidence.firstReleaseYear === null) return null;
    return {
      genres,
      suggestions,
      firstReleaseYear: evidence.firstReleaseYear,
      title: evidence.recording.title,
      artist: evidence.recording.artist,
      url: this.#musicBrainz.recordingUrl(evidence.recording.id),
    };
  }

  #evidence(query: SongQuery, catalog: GenreCatalog): Promise<GenreEvidence | null> {
    const key = `${simplify(plainArtist(query.artist))}|${coreTitle(query.title)}`;
    const now = Date.now();
    const cached = this.#cache.get(key);
    if (cached && cached.expires > now) return cached.evidence;

    const evidence = this.#gather(query, catalog);
    this.#cache.delete(key);
    this.#cache.set(key, { expires: now + CACHE_TTL_MS, evidence });
    // Fehlschläge nicht merken: Beim nächsten Mal wird wieder gefragt.
    evidence.catch(() => {
      if (this.#cache.get(key)?.evidence === evidence) this.#cache.delete(key);
    });
    while (this.#cache.size > CACHE_SIZE) {
      const oldest = this.#cache.keys().next().value;
      if (oldest === undefined) break;
      this.#cache.delete(oldest);
    }
    return evidence;
  }

  async #gather(query: SongQuery, catalog: GenreCatalog): Promise<GenreEvidence | null> {
    const recordings = await this.#musicBrainz.searchRecordings(plainTitle(query.title), plainArtist(query.artist));
    const matching = matchingRecordings(recordings, query);
    const best = matching[0];
    if (!best) return null;

    const levels: TagLevel[] = [{ source: 'recording', tags: sumTags(matching) }];
    const { single, album, firstYear } = pickReleaseGroups(matching, query);
    const groupIds = [single, album].filter((id) => id !== null);
    if (groupIds.length > 0) {
      const groups = await this.#musicBrainz.releaseGroups(groupIds);
      const tagsOf = (id: string) => groups.find((group) => group.id === id)?.tags ?? [];
      if (single) levels.push({ source: 'single', tags: tagsOf(single) });
      if (album) levels.push({ source: 'album', tags: tagsOf(album) });
    }
    // Erst wenn Aufnahme, Single und Album nichts Brauchbares sagen, wird der Interpret gefragt.
    if (levels.every((level) => mappedTags(level, catalog).size === 0)) {
      const artistId = best['artist-credit']?.[0]?.artist.id;
      if (artistId) {
        const [artist] = await this.#musicBrainz.artists([artistId]);
        levels.push({ source: 'artist', tags: artist?.tags ?? [] });
      }
    }
    // Ohne die Singles wäre das Jahr oft zu spät geraten (bekannte Songs haben viele spätere
    // Aufnahmen); dann lieber kein Jahr. Auf die Genres muss man deshalb nicht verzichten.
    const singles = await this.#musicBrainz.searchSingles(plainTitle(query.title), plainArtist(query.artist)).catch((err: unknown) => {
      console.warn('Singles auf MusicBrainz nicht gefunden:', err instanceof Error ? err.message : err);
      return null;
    });
    return {
      recording: { id: best.id, title: best.title, artist: creditName(best) },
      firstReleaseYear: singles === null ? null : earliestReleaseYear(firstYear, matching, singles, query),
      recordingIds: matching.map((recording) => recording.id),
      levels,
    };
  }

  /**
   * Aufnahmen bei MusicBrainz, die zum Song passen, die beste zuerst. Kommt aus dem
   * Zwischenspeicher der Genre-Suche, kostet also meist keine weitere Anfrage.
   */
  async recordingIds(db: Queryable, query: SongQuery): Promise<string[]> {
    const catalog = await loadGenreCatalog(db);
    return (await this.#evidence(query, catalog))?.recordingIds ?? [];
  }

  /** Links zum kostenlosen Anhören, die MusicBrainz an einer Aufnahme führt (etwa YouTube). */
  recordingStreamingUrls(recordingId: string): Promise<string[]> {
    return this.#musicBrainz.recordingStreamingUrls(recordingId);
  }

  /** Seite einer Aufnahme auf musicbrainz.org */
  recordingUrl(recordingId: string): string {
    return this.#musicBrainz.recordingUrl(recordingId);
  }

  /** Jahr der Erstveröffentlichung laut MusicBrainz samt Seite der Aufnahme; null, wenn unbekannt. */
  async firstReleaseYear(db: Queryable, query: SongQuery): Promise<{ year: number; url: string } | null> {
    const catalog = await loadGenreCatalog(db);
    const evidence = await this.#evidence(query, catalog);
    if (!evidence || evidence.firstReleaseYear === null) return null;
    return { year: evidence.firstReleaseYear, url: this.#musicBrainz.recordingUrl(evidence.recording.id) };
  }

  /**
   * Trägt im Hintergrund die Genres und das Erscheinungsjahr der angegebenen Songs nach, soweit
   * sie noch keine haben. Die Songs werden nacheinander abgefragt.
   */
  fillMissing(db: Queryable, songIds: readonly number[]): void {
    this.#background.add(db, songIds);
  }

  /** Wartet, bis das Nachtragen im Hintergrund fertig ist (für Tests). */
  idle(): Promise<void> {
    return this.#background.idle();
  }

  async #fillOne(db: Queryable, songId: number): Promise<boolean> {
    const { rows } = await db.query<{
      title: string;
      artist: string;
      duration_seconds: number | null;
      needs_genres: boolean;
      needs_year: boolean;
    }>(
      `SELECT title, artist, duration_seconds, genres = '{}' AS needs_genres, release_year IS NULL AS needs_year
         FROM songs WHERE id = $1 AND (genres = '{}' OR release_year IS NULL)`,
      [songId],
    );
    const song = rows[0];
    if (!song) return false;
    const match = await this.lookup(db, { title: song.title, artist: song.artist, durationSeconds: song.duration_seconds });
    // Hat inzwischen jemand Genres oder ein Jahr eingetragen, bleiben sie.
    if (match && song.needs_genres && match.genres.length > 0) {
      await db.query(`UPDATE songs SET genres = $1::text[], updated_at = now() WHERE id = $2 AND genres = '{}'`, [
        match.genres,
        songId,
      ]);
    }
    if (match && song.needs_year && match.firstReleaseYear !== null) {
      await db.query('UPDATE songs SET release_year = $1, updated_at = now() WHERE id = $2 AND release_year IS NULL', [
        match.firstReleaseYear,
        songId,
      ]);
    }
    return true;
  }
}

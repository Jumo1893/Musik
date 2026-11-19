// Tempo (BPM) eines Songs über songbpm.com nachschlagen. Die Seite hat keine offizielle
// Schnittstelle: Gesucht wird wie im Browser über ihr Suchformular, danach wird die
// Ergebnisseite ausgewertet. Gesendet werden nur Interpret und Titel.
//
// songbpm.com liefert auf jede Suche Treffer – auch dann, wenn sie den Song gar nicht
// kennt. Übernommen wird deshalb nur ein Treffer, dessen Interpret und Titel passen.

import type { Queryable } from '../db.ts';
import { HttpError } from '../errors.ts';
import type { BpmMatch } from '../types.ts';
import { SongQueue } from './songQueue.ts';
import { artistScore, isOtherVersion, searchText, simplify, titleScore, type SongQuery } from './songMatching.ts';

const BASE_URL = 'https://songbpm.com';
const TIMEOUT_MS = 8000;
/** Suchergebnisse werden einen Tag lang gemerkt, damit derselbe Song nicht mehrfach abgefragt wird. */
const CACHE_TTL_MS = 24 * 60 * 60_000;
const CACHE_SIZE = 300;
/** Pause zwischen zwei Abfragen beim Nachtragen im Hintergrund – die Seite soll nicht überrannt werden. */
const BACKGROUND_DELAY_MS = 1500;
/** Nach so vielen Fehlschlägen in Folge gibt das Nachtragen im Hintergrund auf. */
const BACKGROUND_MAX_FAILURES = 3;
/** Wertebereich der Spalte songs.bpm */
const MIN_BPM = 20;
const MAX_BPM = 400;

/** Ein Eintrag der Ergebnisseite von songbpm.com. */
export interface BpmCandidate {
  artist: string;
  title: string;
  key: string | null;
  durationSeconds: number | null;
  bpm: number;
  /** Pfad der Song-Seite, z. B. /@johnny-cash/hurt */
  path: string;
}

// --- Ergebnisseite auswerten -------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith('#')) {
      const value = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isInteger(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Sichtbarer Text eines HTML-Schnipsels. */
function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** „3:37“ oder „1:02:03“ in Sekunden. */
function parseClock(text: string | undefined): number | null {
  if (!text || !/^\d+(:\d{1,2}){1,2}$/.test(text)) return null;
  const seconds = text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  return seconds > 0 ? seconds : null;
}

// Jeder Treffer ist ein Link auf die Song-Seite („/@interpret/titel“). Darin stehen zwei
// Absätze (Interpret, Titel) und drei beschriftete Werte (Key, Duration, BPM).
const CARD = /<a\b[^>]*\bhref="(\/@[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
const PARAGRAPH = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
const STAT = /<span\b[^>]*>\s*(Key|Duration|BPM)\s*<\/span>\s*<span\b[^>]*>([\s\S]*?)<\/span>/g;

export function parseSearchResults(html: string): BpmCandidate[] {
  const candidates: BpmCandidate[] = [];
  for (const [, path, inner] of html.matchAll(CARD)) {
    if (path === undefined || inner === undefined) continue;
    const [artist, title] = [...inner.matchAll(PARAGRAPH)].map((match) => textOf(match[1] ?? ''));
    const stats = new Map([...inner.matchAll(STAT)].map((match) => [match[1], textOf(match[2] ?? '')]));
    const bpm = Math.round(Number(stats.get('BPM')));
    if (!artist || !title || !Number.isInteger(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) continue;
    candidates.push({
      artist,
      title,
      key: stats.get('Key') || null,
      durationSeconds: parseClock(stats.get('Duration')),
      bpm,
      path: decodeEntities(path),
    });
  }
  return candidates;
}

// --- Passenden Treffer wählen ------------------------------------------------

/**
 * Wählt den Treffer, der zum gesuchten Song passt: Interpret und Titel müssen stimmen.
 * Bei mehreren passenden entscheidet die Genauigkeit, dann die Dauer, dann die Reihenfolge
 * der Seite. Passt keiner, ist das Ergebnis null.
 */
export function pickBestMatch(candidates: readonly BpmCandidate[], query: SongQuery): BpmCandidate | null {
  const wantedDuration = query.durationSeconds ?? null;
  let best: { candidate: BpmCandidate; score: number; durationGap: number } | null = null;

  for (const candidate of candidates) {
    const forArtist = artistScore(query.artist, candidate.artist);
    const forTitle = titleScore(query.title, candidate.title);
    if (forArtist === 0 || forTitle === 0) continue;
    if (isOtherVersion(query.title, candidate.title)) continue;

    const score = forArtist + forTitle;
    const durationGap =
      wantedDuration !== null && candidate.durationSeconds !== null
        ? Math.abs(wantedDuration - candidate.durationSeconds)
        : Number.POSITIVE_INFINITY;
    if (!best || score > best.score || (score === best.score && durationGap < best.durationGap)) {
      best = { candidate, score, durationGap };
    }
  }
  return best?.candidate ?? null;
}

// --- Dienst ------------------------------------------------------------------

export interface SongBpmOptions {
  fetchFn?: typeof fetch;
  baseUrl?: string;
  /** Pause zwischen zwei Songs beim Nachtragen im Hintergrund */
  backgroundDelayMs?: number;
}

interface CacheEntry {
  expires: number;
  results: Promise<BpmCandidate[]>;
}

export class SongBpmService {
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;
  readonly #cache = new Map<string, CacheEntry>();
  readonly #background: SongQueue;

  constructor(options: SongBpmOptions = {}) {
    this.#fetch = options.fetchFn ?? fetch;
    this.#baseUrl = options.baseUrl ?? BASE_URL;
    this.#background = new SongQueue({
      label: 'BPM',
      delayMs: options.backgroundDelayMs ?? BACKGROUND_DELAY_MS,
      maxFailures: BACKGROUND_MAX_FAILURES,
      work: (db, songId) => this.#fillOne(db, songId),
    });
  }

  /** Sucht das Tempo eines Songs. null: songbpm.com kennt den Song nicht. */
  async lookup(query: SongQuery): Promise<BpmMatch | null> {
    const match = pickBestMatch(await this.#search(searchText(query)), query);
    if (!match) return null;
    return {
      bpm: match.bpm,
      key: match.key,
      title: match.title,
      artist: match.artist,
      durationSeconds: match.durationSeconds,
      url: new URL(match.path, this.#baseUrl).toString(),
    };
  }

  #search(text: string): Promise<BpmCandidate[]> {
    const key = simplify(text);
    const now = Date.now();
    const cached = this.#cache.get(key);
    if (cached && cached.expires > now) return cached.results;

    const results = this.#fetchResults(text);
    this.#cache.delete(key);
    this.#cache.set(key, { expires: now + CACHE_TTL_MS, results });
    // Fehlschläge nicht merken: Beim nächsten Mal wird wieder gefragt.
    results.catch(() => {
      if (this.#cache.get(key)?.results === results) this.#cache.delete(key);
    });
    while (this.#cache.size > CACHE_SIZE) {
      const oldest = this.#cache.keys().next().value;
      if (oldest === undefined) break;
      this.#cache.delete(oldest);
    }
    return results;
  }

  async #fetchResults(text: string): Promise<BpmCandidate[]> {
    let html: string;
    try {
      // Das Suchformular leitet auf die Ergebnisseite weiter; fetch folgt dabei mit GET.
      const response = await this.#fetch(new URL('/searches', this.#baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' },
        body: new URLSearchParams({ query: text }).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      html = await response.text();
    } catch (err) {
      console.warn('BPM-Suche auf songbpm.com fehlgeschlagen:', err instanceof Error ? err.message : err);
      throw new HttpError(502, 'songbpm.com ist gerade nicht erreichbar. Das Tempo lässt sich auch von Hand eintragen.');
    }
    return parseSearchResults(html);
  }

  /**
   * Trägt im Hintergrund das Tempo der angegebenen Songs nach, soweit sie noch keins haben.
   * Die Songs werden nacheinander und mit Pausen abgefragt.
   */
  fillMissing(db: Queryable, songIds: readonly number[]): void {
    this.#background.add(db, songIds);
  }

  /** Wartet, bis das Nachtragen im Hintergrund fertig ist (für Tests). */
  idle(): Promise<void> {
    return this.#background.idle();
  }

  async #fillOne(db: Queryable, songId: number): Promise<boolean> {
    const { rows } = await db.query<{ title: string; artist: string; duration_seconds: number | null }>(
      'SELECT title, artist, duration_seconds FROM songs WHERE id = $1 AND bpm IS NULL',
      [songId],
    );
    const song = rows[0];
    if (!song) return false;
    const match = await this.lookup({ title: song.title, artist: song.artist, durationSeconds: song.duration_seconds });
    // Hat inzwischen jemand ein Tempo eingetragen, bleibt es.
    if (match) await db.query('UPDATE songs SET bpm = $1, updated_at = now() WHERE id = $2 AND bpm IS NULL', [match.bpm, songId]);
    return true;
  }
}

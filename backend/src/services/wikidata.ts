// YouTube-Videos zu Songs aus Wikidata (Eigenschaft P1651 „YouTube-Video-ID“). Gefragt wird
// über den öffentlichen SPARQL-Dienst ohne Schlüssel; er verlangt einen aussagekräftigen
// User-Agent. Gesendet werden nur Songtitel. Gefunden werden vor allem bekannte Songs mit
// eigenem Wikidata-Eintrag; die Videos sind meist die offiziellen Musikvideos.

import * as z from 'zod';
import { VIDEO_ID_PATTERN } from './youtubeIds.ts';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'MusikBibliothek/0.1 (selbst gehostete Musik-Bibliothek)';
const TIMEOUT_MS = 10_000;
/** Titel werden in diesen Sprachen gesucht; „mul“ steht für Namen, die in allen Sprachen gleich sind. */
const LANGUAGES = ['en', 'de', 'mul'];

const responseSchema = z.object({
  results: z.object({
    bindings: z.array(
      z.object({
        item: z.object({ value: z.string() }),
        video: z.object({ value: z.string() }),
        performerLabel: z.object({ value: z.string() }).optional(),
      }),
    ),
  }),
});

/** Ein Song-Eintrag bei Wikidata mit seinen Videos und Interpreten. */
export interface WikidataSong {
  /** z. B. „Q18235107“ */
  itemId: string;
  videoIds: string[];
  performers: string[];
}

/** Text als SPARQL-Literal: Backslash und Anführungszeichen maskiert, Zeilenumbrüche entfernt. */
function literal(text: string): string {
  return `"${text.replace(/[\\"]/g, '\\$&').replace(/\s+/g, ' ').trim()}"`;
}

/** Abfrage: Songs mit genau diesem Titel (als Bezeichnung), Interpret und YouTube-Video. */
export function songVideoQuery(titles: readonly string[]): string {
  const values = [...new Set(titles.map((title) => title.trim()).filter(Boolean))]
    .flatMap((title) => LANGUAGES.map((language) => `${literal(title)}@${language}`))
    .join(' ');
  return `SELECT DISTINCT ?item ?video ?performerLabel WHERE {
  VALUES ?title { ${values} }
  ?item rdfs:label ?title ; wdt:P1651 ?video ; wdt:P175 ?performer .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "${LANGUAGES.join(',')}". }
}
LIMIT 200`;
}

/** Fasst die Zeilen der Antwort je Eintrag zusammen. */
export function parseSongVideos(body: unknown): WikidataSong[] {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) throw new Error('unerwartete Antwort von Wikidata');
  const songs = new Map<string, WikidataSong>();
  for (const row of parsed.data.results.bindings) {
    const itemId = row.item.value.split('/').pop() ?? row.item.value;
    const song = songs.get(itemId) ?? { itemId, videoIds: [], performers: [] };
    const videoId = row.video.value.trim();
    if (VIDEO_ID_PATTERN.test(videoId) && !song.videoIds.includes(videoId)) song.videoIds.push(videoId);
    const performer = row.performerLabel?.value.trim();
    if (performer && !song.performers.includes(performer)) song.performers.push(performer);
    songs.set(itemId, song);
  }
  return [...songs.values()].filter((song) => song.videoIds.length > 0);
}

export interface WikidataOptions {
  fetchFn?: typeof fetch;
  endpoint?: string;
}

/** Songs bei Wikidata mit einem dieser Titel, die ein YouTube-Video nennen. Wirft bei Ausfällen. */
export async function findSongVideos(titles: readonly string[], options: WikidataOptions = {}): Promise<WikidataSong[]> {
  if (titles.every((title) => title.trim() === '')) return [];
  const url = new URL(options.endpoint ?? ENDPOINT);
  url.searchParams.set('query', songVideoQuery(titles));
  const response = await (options.fetchFn ?? fetch)(url, {
    headers: { accept: 'application/sparql-results+json', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Wikidata antwortet mit HTTP ${response.status}`);
  return parseSongVideos(await response.json());
}

/** Seite eines Eintrags auf wikidata.org */
export function wikidataItemUrl(itemId: string): string {
  return `https://www.wikidata.org/wiki/${encodeURIComponent(itemId)}`;
}

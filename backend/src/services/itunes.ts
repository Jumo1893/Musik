// Online-Suche über die öffentliche iTunes Search API von Apple. Sie braucht keinen
// Account und keinen Schlüssel und liefert Metadaten samt Apple-Music-Link –
// damit lässt sich das Song-Formular vorbelegen.

import * as z from 'zod';
import { HttpError } from '../errors.ts';
import type { LookupResult } from '../types.ts';

const SEARCH_URL = 'https://itunes.apple.com/search';
const TIMEOUT_MS = 8000;
const MAX_RESULTS = 12;

const trackSchema = z.object({
  trackName: z.string().min(1),
  artistName: z.string().min(1),
  collectionName: z.string().nullish(),
  trackTimeMillis: z.number().nullish(),
  releaseDate: z.string().nullish(),
  primaryGenreName: z.string().nullish(),
  trackViewUrl: z.string().nullish(),
  artworkUrl100: z.string().nullish(),
});

const responseSchema = z.object({ results: z.array(z.unknown()) });

function httpsUrlOrNull(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** Wandelt einen Treffer der iTunes-API um; unbrauchbare Einträge ergeben null. */
export function mapItunesTrack(raw: unknown): LookupResult | null {
  const parsed = trackSchema.safeParse(raw);
  if (!parsed.success) return null;
  const track = parsed.data;

  const durationSeconds = track.trackTimeMillis ? Math.round(track.trackTimeMillis / 1000) : null;
  const year = track.releaseDate ? Number(track.releaseDate.slice(0, 4)) : NaN;

  // „uo“ ist nur ein Herkunftsmerker von Apple und gehört nicht in den gespeicherten Link.
  const trackUrl = httpsUrlOrNull(track.trackViewUrl);
  trackUrl?.searchParams.delete('uo');

  // Die API liefert ein 100-Pixel-Cover; dieselbe Adresse gibt es auch in größer.
  const artworkUrl = httpsUrlOrNull(track.artworkUrl100)?.toString().replace('100x100bb', '300x300bb') ?? null;

  return {
    title: track.trackName,
    artist: track.artistName,
    album: track.collectionName || null,
    durationSeconds: durationSeconds !== null && durationSeconds > 0 ? durationSeconds : null,
    releaseYear: Number.isInteger(year) && year >= 1000 && year <= 2200 ? year : null,
    genre: track.primaryGenreName || null,
    appleMusicUrl: trackUrl?.toString() ?? null,
    artworkUrl,
  };
}

export async function searchItunes(
  term: string,
  country: string,
  fetchFn: typeof fetch = fetch,
): Promise<LookupResult[]> {
  const url = new URL(SEARCH_URL);
  url.searchParams.set('term', term);
  url.searchParams.set('media', 'music');
  url.searchParams.set('entity', 'song');
  url.searchParams.set('country', country);
  url.searchParams.set('limit', String(MAX_RESULTS));

  let body: unknown;
  try {
    const response = await fetchFn(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    body = await response.json();
  } catch (err) {
    console.warn('iTunes-Suche fehlgeschlagen:', err instanceof Error ? err.message : err);
    throw new HttpError(502, 'Die Online-Suche ist gerade nicht erreichbar. Du kannst den Song trotzdem von Hand anlegen.');
  }

  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(502, 'Die Online-Suche hat eine unerwartete Antwort geliefert.');
  }
  return parsed.data.results.map(mapItunesTrack).filter((result) => result !== null);
}

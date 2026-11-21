// Titel und Kanal eines YouTube-Videos über oEmbed – ohne Konto, ohne Schlüssel und ohne
// Tageskontingent. Gesendet wird nur der Link zum Video. Für gelöschte Videos antwortet
// YouTube mit 404, für private (oder nicht einbettbare) mit 401 oder 403.

import * as z from 'zod';
import { videoUrl } from './youtubeIds.ts';

const BASE_URL = 'https://www.youtube.com';
const TIMEOUT_MS = 8000;

const oembedSchema = z.object({
  title: z.string().min(1),
  author_name: z.string().nullish(),
  thumbnail_url: z.string().nullish(),
});

export interface VideoInfo {
  title: string;
  /** Name des Kanals, z. B. „Johnny Cash - Topic“ */
  channel: string | null;
  thumbnailUrl: string | null;
}

export interface OembedOptions {
  fetchFn?: typeof fetch;
  baseUrl?: string;
}

/** Nicht erreichbar oder unerwartete Antwort; anders als „Video gibt es nicht“. */
export class OembedUnavailableError extends Error {}

/**
 * Titel, Kanal und Vorschaubild eines Videos. null: Das Video ist gelöscht, privat oder nicht
 * abrufbar. Ist YouTube gar nicht erreichbar, wird OembedUnavailableError geworfen.
 */
export async function fetchVideoInfo(videoId: string, options: OembedOptions = {}): Promise<VideoInfo | null> {
  const url = new URL('/oembed', options.baseUrl ?? BASE_URL);
  url.searchParams.set('url', videoUrl(videoId));
  url.searchParams.set('format', 'json');

  let response: Response;
  try {
    response = await (options.fetchFn ?? fetch)(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new OembedUnavailableError(err instanceof Error ? err.message : String(err));
  }
  if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw new OembedUnavailableError(`HTTP ${response.status}`);
  const parsed = oembedSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new OembedUnavailableError('unerwartete Antwort');
  const thumbnail = parsed.data.thumbnail_url ?? null;
  return {
    title: parsed.data.title,
    channel: parsed.data.author_name || null,
    thumbnailUrl: thumbnail && thumbnail.startsWith('https://') ? thumbnail : null,
  };
}

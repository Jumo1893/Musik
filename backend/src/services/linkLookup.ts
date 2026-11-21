// Einen Song über seinen Link erkennen, so wie man Songs über „Teilen → Link kopieren“
// weitergibt: Apple-Music-Links über die Track-ID im iTunes-Katalog, YouTube- und
// YouTube-Music-Links über Titel und Kanal des Videos (oEmbed) und eine Suche im Katalog.

import { HttpError } from '../errors.ts';
import type { LinkLookupResult, LookupResult } from '../types.ts';
import { lookupItunes, searchItunes } from './itunes.ts';
import { artistScore, sameVersion, searchText, titleScore } from './songMatching.ts';
import { extractYoutubeId, PLAYLIST_ID_PATTERN, videoUrl } from './youtubeIds.ts';
import { fetchVideoInfo, OembedUnavailableError } from './youtubeOembed.ts';
import { parseVideoTitle } from './youtubeText.ts';

export type MusicLink =
  | { kind: 'appleTrack'; trackId: string }
  | { kind: 'appleAlbum' }
  | { kind: 'applePlaylist' }
  | { kind: 'appleArtist' }
  | { kind: 'youtubeVideo'; videoId: string }
  | { kind: 'youtubePlaylist' }
  | { kind: 'unknown' };

const APPLE_HOSTS = new Set(['music.apple.com', 'geo.music.apple.com', 'itunes.apple.com']);
const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'www.youtube.com', 'music.youtube.com', 'youtu.be']);

function parseUrl(text: string): URL | null {
  const trimmed = text.trim();
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

/** Was für ein Link ist das? Erkannt werden Songs, Alben und Playlists von Apple Music und YouTube. */
export function parseMusicLink(text: string): MusicLink {
  const url = parseUrl(text);
  if (!url) return { kind: 'unknown' };
  const host = url.hostname.toLowerCase();

  if (APPLE_HOSTS.has(host)) {
    const track = url.searchParams.get('i');
    if (track && /^\d{1,15}$/.test(track)) return { kind: 'appleTrack', trackId: track };
    const song = /\/song\/(?:[^/]+\/)?(\d{1,15})\/?$/.exec(url.pathname);
    if (song) return { kind: 'appleTrack', trackId: song[1]! };
    if (/\/album\//.test(url.pathname)) return { kind: 'appleAlbum' };
    if (/\/playlist\//.test(url.pathname)) return { kind: 'applePlaylist' };
    if (/\/artist\//.test(url.pathname)) return { kind: 'appleArtist' };
    return { kind: 'unknown' };
  }

  if (YOUTUBE_HOSTS.has(host)) {
    const videoId = extractYoutubeId(url.toString());
    if (videoId) return { kind: 'youtubeVideo', videoId };
    const list = url.searchParams.get('list');
    if (list && PLAYLIST_ID_PATTERN.test(list)) return { kind: 'youtubePlaylist' };
  }
  return { kind: 'unknown' };
}

/**
 * Der Katalog-Treffer, der zum Video passt: Interpret und Titel müssen stimmen, und es muss
 * dieselbe Fassung sein (ein Live-Video ist nicht die Studioaufnahme). Genaue Schreibweise vor
 * ungefährer, sonst gilt die Reihenfolge der Suche.
 */
export function bestCatalogMatch(results: readonly LookupResult[], wanted: { title: string; artist: string }): LookupResult | null {
  let best: { result: LookupResult; score: number } | null = null;
  for (const result of results) {
    const forArtist = artistScore(wanted.artist, result.artist);
    const forTitle = titleScore(wanted.title, result.title);
    if (forArtist === 0 || forTitle === 0 || !sameVersion(wanted.title, result.title)) continue;
    const score = forArtist + forTitle;
    if (!best || score > best.score) best = { result, score };
  }
  return best?.result ?? null;
}

const UNKNOWN_LINK = 'Diesen Link kenne ich nicht. Es funktionieren Links von Apple Music, YouTube und YouTube Music.';

export interface LinkLookupOptions {
  itunesCountry: string;
  fetchFn?: typeof fetch;
  /** Adresse für oEmbed; nur für Tests ändern */
  youtubeBaseUrl?: string;
}

export class LinkLookupService {
  readonly #options: LinkLookupOptions;

  constructor(options: LinkLookupOptions) {
    this.#options = options;
  }

  async lookup(text: string): Promise<LinkLookupResult> {
    const link = parseMusicLink(text);
    switch (link.kind) {
      case 'appleTrack':
        return this.#appleTrack(link.trackId);
      case 'youtubeVideo':
        return this.#youtubeVideo(link.videoId);
      case 'appleAlbum':
        throw new HttpError(
          400,
          'Das ist der Link zu einem ganzen Album. Bitte den Link zu einem einzelnen Song einfügen: in Apple Music beim Song „Teilen → Link kopieren“.',
          'link_album',
        );
      case 'applePlaylist':
        throw new HttpError(
          400,
          'Das ist der Link zu einer Playlist. Ganze Playlists lassen sich hier noch nicht übernehmen – bitte den Link zu einem einzelnen Song einfügen.',
          'link_playlist',
        );
      case 'youtubePlaylist':
        throw new HttpError(
          400,
          'Das ist der Link zu einer YouTube-Playlist. Bitte den Link zu einem einzelnen Video einfügen. Eigene YouTube-Playlists lassen sich mit verbundenem Konto auf der Seite „YouTube“ übernehmen.',
          'link_playlist',
        );
      case 'appleArtist':
        throw new HttpError(400, 'Das ist der Link zu einem Interpreten. Bitte den Link zu einem einzelnen Song einfügen.', 'link_artist');
      case 'unknown':
        throw new HttpError(400, UNKNOWN_LINK, 'link_unknown');
    }
  }

  async #appleTrack(trackId: string): Promise<LinkLookupResult> {
    const [result] = await lookupItunes([trackId], this.#options.itunesCountry, this.#options.fetchFn);
    if (!result) throw new HttpError(404, 'Diesen Song kennt der iTunes-Katalog nicht (mehr). Du kannst ihn trotzdem von Hand anlegen.');
    return { kind: 'apple', result };
  }

  /**
   * Titel und Kanal des Videos lesen, daraus Interpret und Titel gewinnen und im Katalog suchen.
   * Der Link zum Video kommt in jedem Fall zurück, auch wenn YouTube oder der Katalog nichts sagt.
   */
  async #youtubeVideo(videoId: string): Promise<LinkLookupResult> {
    const base = { kind: 'youtube' as const, videoId, youtubeUrl: videoUrl(videoId) };
    let video = null;
    try {
      video = await fetchVideoInfo(videoId, {
        ...(this.#options.fetchFn ? { fetchFn: this.#options.fetchFn } : {}),
        ...(this.#options.youtubeBaseUrl ? { baseUrl: this.#options.youtubeBaseUrl } : {}),
      });
    } catch (err) {
      if (!(err instanceof OembedUnavailableError)) throw err;
      console.warn('oEmbed von YouTube nicht erreichbar:', err.message);
    }
    if (!video) return { ...base, video: null, parsed: null, best: null, results: [] };

    const parsed = parseVideoTitle(video.title, video.channel);
    let results: LookupResult[] = [];
    try {
      results = await searchItunes(searchText(parsed), this.#options.itunesCountry, this.#options.fetchFn);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
    }
    const best = bestCatalogMatch(results, parsed);
    return { ...base, video, parsed, best, results: results.filter((result) => result !== best) };
  }
}

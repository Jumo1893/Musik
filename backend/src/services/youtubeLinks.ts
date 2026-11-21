// YouTube-Links zu Songs finden, ohne YouTube-Konto und ohne Tageskontingent. Gefragt werden
// nacheinander Wikidata und MusicBrainz; die erste Quelle mit einem passenden, gültigen Video
// gewinnt. Jedes Video wird vorher über oEmbed geprüft, gelöschte und private fallen heraus.
// Fällt eine Quelle aus, geht es mit der nächsten weiter.

import type { Queryable } from '../db.ts';
import type { YoutubeLinkMatch } from '../types.ts';
import type { GenreLookupService } from './genreLookup.ts';
import { artistScore, coreTitle, plainArtist, plainTitle, simplify, versionMarks, type SongQuery } from './songMatching.ts';
import { findSongVideos, wikidataItemUrl, type WikidataOptions, type WikidataSong } from './wikidata.ts';
import { extractYoutubeId, videoUrl } from './youtubeIds.ts';
import { fetchVideoInfo, OembedUnavailableError, type OembedOptions } from './youtubeOembed.ts';

/** Ergebnisse werden einen Tag lang gemerkt, damit derselbe Song nicht mehrfach abgefragt wird. */
const CACHE_TTL_MS = 24 * 60 * 60_000;
const CACHE_SIZE = 300;
/** So viele passende Aufnahmen werden bei MusicBrainz nach Links gefragt (je eine Anfrage). */
const MAX_RECORDINGS = 3;

/** Einträge bei Wikidata, deren Interpret zum gesuchten passt; Videos in der Reihenfolge der Antwort. */
export function matchingWikidataVideos(songs: readonly WikidataSong[], query: SongQuery): Array<{ itemId: string; videoId: string }> {
  return songs
    .filter((song) => song.performers.some((performer) => artistScore(query.artist, performer) > 0))
    .flatMap((song) => song.videoIds.map((videoId) => ({ itemId: song.itemId, videoId })));
}

export interface YoutubeLinkOptions {
  /** Liefert die passenden Aufnahmen bei MusicBrainz und ihre Links. */
  genreLookup: Pick<GenreLookupService, 'recordingIds' | 'recordingStreamingUrls' | 'recordingUrl'>;
  fetchFn?: typeof fetch;
  wikidataEndpoint?: string;
  youtubeBaseUrl?: string;
}

interface CacheEntry {
  expires: number;
  match: Promise<YoutubeLinkMatch | null>;
}

export class YoutubeLinkService {
  readonly #options: YoutubeLinkOptions;
  readonly #cache = new Map<string, CacheEntry>();

  constructor(options: YoutubeLinkOptions) {
    this.#options = options;
  }

  /** Sucht ein YouTube-Video zum Song. null: Keine Quelle kennt ein passendes, gültiges Video. */
  lookup(db: Queryable, query: SongQuery): Promise<YoutubeLinkMatch | null> {
    const key = `${simplify(plainArtist(query.artist))}|${coreTitle(query.title)}`;
    const now = Date.now();
    const cached = this.#cache.get(key);
    if (cached && cached.expires > now) return cached.match;

    const match = this.#find(db, query);
    this.#cache.delete(key);
    this.#cache.set(key, { expires: now + CACHE_TTL_MS, match });
    match.catch(() => {
      if (this.#cache.get(key)?.match === match) this.#cache.delete(key);
    });
    while (this.#cache.size > CACHE_SIZE) {
      const oldest = this.#cache.keys().next().value;
      if (oldest === undefined) break;
      this.#cache.delete(oldest);
    }
    return match;
  }

  async #find(db: Queryable, query: SongQuery): Promise<YoutubeLinkMatch | null> {
    return (await this.#fromWikidata(query)) ?? (await this.#fromMusicBrainz(db, query));
  }

  async #fromWikidata(query: SongQuery): Promise<YoutubeLinkMatch | null> {
    let songs: WikidataSong[];
    try {
      const options: WikidataOptions = {
        ...(this.#options.fetchFn ? { fetchFn: this.#options.fetchFn } : {}),
        ...(this.#options.wikidataEndpoint ? { endpoint: this.#options.wikidataEndpoint } : {}),
      };
      // „Hurt (Remastered)“ heißt bei Wikidata „Hurt“; eine Live-Fassung oder ein Remix aber nicht.
      const titles = versionMarks(query.title).length > 0 ? [query.title] : [query.title, plainTitle(query.title)];
      songs = await findSongVideos(titles, options);
    } catch (err) {
      console.warn('YouTube-Link über Wikidata nicht gefunden:', err instanceof Error ? err.message : err);
      return null;
    }
    for (const { itemId, videoId } of matchingWikidataVideos(songs, query)) {
      const match = await this.#verified(videoId, 'wikidata', wikidataItemUrl(itemId));
      if (match) return match;
    }
    return null;
  }

  async #fromMusicBrainz(db: Queryable, query: SongQuery): Promise<YoutubeLinkMatch | null> {
    const { genreLookup } = this.#options;
    try {
      const recordingIds = (await genreLookup.recordingIds(db, query)).slice(0, MAX_RECORDINGS);
      for (const recordingId of recordingIds) {
        const videoIds = (await genreLookup.recordingStreamingUrls(recordingId))
          .map((url) => extractYoutubeId(url))
          .filter((videoId) => videoId !== null);
        for (const videoId of new Set(videoIds)) {
          const match = await this.#verified(videoId, 'musicbrainz', genreLookup.recordingUrl(recordingId));
          if (match) return match;
        }
      }
    } catch (err) {
      console.warn('YouTube-Link über MusicBrainz nicht gefunden:', err instanceof Error ? err.message : err);
    }
    return null;
  }

  /** Prüft das Video über oEmbed; gelöschte, private und nicht abrufbare Videos ergeben null. */
  async #verified(videoId: string, source: YoutubeLinkMatch['source'], sourceUrl: string): Promise<YoutubeLinkMatch | null> {
    const options: OembedOptions = {
      ...(this.#options.fetchFn ? { fetchFn: this.#options.fetchFn } : {}),
      ...(this.#options.youtubeBaseUrl ? { baseUrl: this.#options.youtubeBaseUrl } : {}),
    };
    try {
      const info = await fetchVideoInfo(videoId, options);
      if (!info) return null;
      return {
        videoId,
        url: videoUrl(videoId),
        source,
        sourceUrl,
        videoTitle: info.title,
        channel: info.channel,
        thumbnailUrl: info.thumbnailUrl,
      };
    } catch (err) {
      // Ohne Prüfung kein Link: Lieber nichts eintragen als ein totes Video.
      if (err instanceof OembedUnavailableError) return null;
      throw err;
    }
  }
}

// Links zu den Streaming-Plattformen. Ist für einen Song ein direkter Link gespeichert,
// wird er verwendet; sonst führt der Link zur Suche der Plattform nach „Interpret Titel“.

import type { Song } from '../types.ts';

export type Platform = 'appleMusic' | 'youtube' | 'youtubeMusic';

export const PLATFORMS: Record<Platform, { name: string; shortName: string }> = {
  appleMusic: { name: 'Apple Music', shortName: 'Apple' },
  youtube: { name: 'YouTube', shortName: 'YouTube' },
  youtubeMusic: { name: 'YouTube Music', shortName: 'YT Music' },
};

export interface StreamingLink {
  platform: Platform;
  name: string;
  shortName: string;
  url: string;
  /** true: führt direkt zum Song, false: führt zur Suche */
  direct: boolean;
}

type SongLinks = Pick<Song, 'title' | 'artist' | 'appleMusicUrl' | 'youtubeUrl' | 'youtubeMusicUrl'>;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'music.youtube.com', 'youtube-nocookie.com']);

/** Liest die Video-ID aus einem YouTube- oder YouTube-Music-Link. */
export function extractYoutubeId(link: string | null | undefined): string | null {
  if (!link) return null;
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');

  let candidate: string | null = null;
  if (host === 'youtu.be') {
    candidate = url.pathname.split('/')[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    candidate =
      url.pathname === '/watch'
        ? url.searchParams.get('v')
        : (/^\/(?:embed|shorts|live|v)\/([^/]+)/.exec(url.pathname)?.[1] ?? null);
  }
  return candidate !== null && YOUTUBE_ID.test(candidate) ? candidate : null;
}

/** Video-ID eines Songs, egal in welchem der beiden YouTube-Felder der Link steht. */
export function youtubeIdOf(song: Pick<Song, 'youtubeUrl' | 'youtubeMusicUrl'>): string | null {
  return extractYoutubeId(song.youtubeUrl) ?? extractYoutubeId(song.youtubeMusicUrl);
}

/**
 * Adresse der Suche auf einer Plattform. `storefront` ist der Ländercode des
 * Apple-Music-Katalogs („de“); ohne ihn landet die Suche im US-Katalog.
 */
export function searchUrl(platform: Platform, query: string, storefront?: string): string {
  const term = encodeURIComponent(query.trim());
  switch (platform) {
    case 'appleMusic': {
      const country = storefront && /^[a-z]{2}$/.test(storefront) ? `${storefront}/` : '';
      return `https://music.apple.com/${country}search?term=${term}`;
    }
    case 'youtube':
      return `https://www.youtube.com/results?search_query=${term}`;
    case 'youtubeMusic':
      return `https://music.youtube.com/search?q=${term}`;
  }
}

export function streamingLinks(song: SongLinks, storefront?: string): StreamingLink[] {
  const query = `${song.artist} ${song.title}`;
  // Ein YouTube-Video lässt sich auch in YouTube Music öffnen und umgekehrt –
  // ein gespeicherter Link genügt also für beide Plattformen.
  const youtubeId = youtubeIdOf(song);
  const direct: Record<Platform, string | null> = {
    appleMusic: song.appleMusicUrl,
    youtube: song.youtubeUrl ?? (youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : null),
    youtubeMusic: song.youtubeMusicUrl ?? (youtubeId ? `https://music.youtube.com/watch?v=${youtubeId}` : null),
  };

  return (Object.keys(PLATFORMS) as Platform[]).map((platform) => ({
    platform,
    ...PLATFORMS[platform],
    url: direct[platform] ?? searchUrl(platform, query, storefront),
    direct: direct[platform] !== null,
  }));
}

export function youtubeVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** So viele Videos nimmt YouTube in einer spontanen Wiedergabeliste höchstens an. */
export const YOUTUBE_QUEUE_LIMIT = 50;

/**
 * Link, der die Videos als spontane (unbenannte) Wiedergabeliste bei YouTube öffnet.
 * Dort lässt sie sich mit einem Klick als eigene Playlist speichern – ganz ohne
 * API-Zugang. Gibt null zurück, wenn kein Song eine Video-ID hat.
 */
export function youtubeQueueUrl(videoIds: string[]): string | null {
  const unique = [...new Set(videoIds)].slice(0, YOUTUBE_QUEUE_LIMIT);
  if (unique.length === 0) return null;
  return `https://www.youtube.com/watch_videos?video_ids=${unique.join(',')}`;
}

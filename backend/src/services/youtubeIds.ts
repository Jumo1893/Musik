// IDs von YouTube-Videos und -Playlists und die Links dazu.

export const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
export const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{2,64}$/;

const YOUTUBE_HOSTS = new Set(['youtube.com', 'music.youtube.com', 'youtube-nocookie.com']);

/**
 * Liest die Video-ID aus einem YouTube- oder YouTube-Music-Link.
 * Gegenstück zu extractYoutubeId in frontend/src/lib/links.ts.
 */
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
  return candidate !== null && VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
}

/** Video-ID eines Songs, egal in welchem der beiden YouTube-Felder der Link steht. */
export function songVideoId(song: { youtubeUrl: string | null; youtubeMusicUrl: string | null }): string | null {
  return extractYoutubeId(song.youtubeUrl) ?? extractYoutubeId(song.youtubeMusicUrl);
}

export function videoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function playlistLinks(playlistId: string): { url: string; musicUrl: string } {
  return {
    url: `https://www.youtube.com/playlist?list=${playlistId}`,
    musicUrl: `https://music.youtube.com/playlist?list=${playlistId}`,
  };
}

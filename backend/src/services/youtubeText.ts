// Texte von YouTube auswerten: Videotitel in Interpret und Titel zerlegen, Dauern lesen,
// Videos mit Songs der Bibliothek abgleichen und Suchtreffer bewerten. Reine Funktionen.

import { songVideoId } from './youtubeIds.ts';

/** ISO-8601-Dauer wie „PT4M55S“ in Sekunden; null, wenn unbekannt, 0 oder länger als ein Tag. */
export function parseIsoDuration(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value.trim());
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  const total =
    Number(days ?? 0) * 86_400 + Number(hours ?? 0) * 3_600 + Number(minutes ?? 0) * 60 + Math.round(Number(seconds ?? 0));
  return total >= 1 && total <= 86_399 ? total : null;
}

/** Zusätze, die nur das Video beschreiben, nicht den Song. */
const NOISE_PATTERNS = [
  /\bofficial\b/i,
  /\boffiziell/i,
  /\bvideo\s*oficial\b/i,
  /\bclip\s*officiel\b/i,
  /\bremaster(ed)?\b/i,
  /^(music\s*)?video(\s*clip)?$/i,
  /^(lyric|lyrics)(\s*video)?$/i,
  /^with\s*lyrics$/i,
  /^audio(\s*only)?$/i,
  /^visuali[sz]er$/i,
  /^(hd|hq|4k|uhd|full\s*hd|\d{3,4}p)$/i,
  /^m\s*\/?\s*v$/i,
  /^(musikvideo|songtext)$/i,
];

const TRAILING_NOISE =
  /\s+(?:official\s+(?:music\s+|lyric\s+)?(?:video|audio)|lyric\s+video|lyrics?|m\s*\/\s*v|mv|hd|hq|4k)$/i;

const BRACKETED = /\s*[([【「]([^()[\]【】「」]*)[)\]】」]/g;
const QUOTES = `"'“”„«»‘’‚`;

function isNoise(text: string): boolean {
  const trimmed = text.trim();
  return trimmed !== '' && NOISE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** Entfernt Zusätze wie „(Official Music Video)“, „[HD]“ oder „| Lyrics“. */
export function stripVideoNoise(title: string): string {
  let result = title.replace(BRACKETED, (whole, inner: string) => (isNoise(inner) ? '' : whole));
  const parts = result.split(/\s+(?:\||‖|\/\/)\s+/);
  if (parts.length > 1 && parts.slice(1).every(isNoise)) result = parts[0]!;
  let previous: string;
  do {
    previous = result;
    result = result.replace(TRAILING_NOISE, '');
  } while (result !== previous);
  return result.replace(/\s+/g, ' ').trim();
}

function unquote(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length >= 2 && QUOTES.includes(trimmed[0]!) && QUOTES.includes(trimmed[trimmed.length - 1]!)) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/** Kanalname ohne Zusätze wie „ - Topic“, „VEVO“ oder „Official“. */
export function cleanChannelName(name: string | null | undefined): string {
  return (name ?? '')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/, '')
    .replace(/\s+(official|offiziell)$/i, '')
    .trim();
}

/** Vergleichsschlüssel: ohne Akzente, Klammerzusätze, Gastinterpreten und Satzzeichen. */
export function matchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[([][^)\]]*[)\]]/g, ' ')
    .replace(/\s(?:feat\.?|ft\.?|featuring)\s.*$/, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Wie matchKey, aber Klammerzusätze bleiben erhalten (z. B. für „(Cover)“). */
function plainKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const ARTIST_STOP_WORDS = new Set(['the', 'and', 'der', 'die', 'das', 'und', 'les', 'los', 'feat']);

function artistTokens(key: string): string[] {
  return key.split(' ').filter((token) => token.length >= 3 && !ARTIST_STOP_WORDS.has(token));
}

/** Gleicher Interpret? Großzügig: „Axwell Λ Ingrosso“ passt zu „Axwell /\ Ingrosso“. */
export function artistsMatch(first: string, second: string): boolean {
  const a = matchKey(first);
  const b = matchKey(second);
  if (a === '' || b === '') return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const tokens = new Set(artistTokens(a));
  return artistTokens(b).some((token) => tokens.has(token));
}

export interface ParsedVideoTitle {
  title: string;
  artist: string;
}

const SEPARATOR = /\s+[-–—‒~]\s+/;

function splitArtistTitle(text: string): [string, string] | null {
  const match = SEPARATOR.exec(text);
  if (!match || match.index === 0) return null;
  const artist = text.slice(0, match.index).trim();
  const title = text.slice(match.index + match[0].length).trim();
  return artist && title ? [artist, title] : null;
}

function sameName(first: string, second: string): boolean {
  const a = matchKey(first);
  return a !== '' && a === matchKey(second);
}

function limited(parsed: ParsedVideoTitle): ParsedVideoTitle {
  return { title: parsed.title.slice(0, 300), artist: parsed.artist.slice(0, 300) };
}

/**
 * Zerlegt einen Videotitel in Interpret und Titel. Typische Formen:
 * „Interpret - Titel (Official Video)“, „Titel“ vom Kanal „Interpret - Topic“
 * (automatisch erzeugte Musik-Uploads) oder ein Titel ohne Interpret.
 */
export function parseVideoTitle(videoTitle: string, ownerChannel: string | null | undefined): ParsedVideoTitle {
  const raw = videoTitle.replace(/\s+/g, ' ').trim();
  const owner = (ownerChannel ?? '').trim();
  const channelArtist = cleanChannelName(owner);
  const cleaned = stripVideoNoise(raw);

  if (/\s-\s*Topic$/i.test(owner) && channelArtist !== '') {
    return limited({ artist: channelArtist, title: unquote(cleaned) || raw });
  }

  const parts = splitArtistTitle(cleaned);
  if (parts) {
    let [artist, title] = parts;
    // Manche Kanäle schreiben „Titel - Interpret“: steht rechts der Kanalname, wird getauscht.
    if (channelArtist && sameName(title, channelArtist) && !sameName(artist, channelArtist)) {
      [artist, title] = [title, artist];
    }
    return limited({ artist: unquote(artist), title: unquote(stripVideoNoise(title)) || unquote(title) });
  }

  return limited({ artist: channelArtist || 'Unbekannt', title: unquote(cleaned) || raw || 'Ohne Titel' });
}

export interface LibrarySong {
  id: number;
  title: string;
  artist: string;
  youtubeUrl: string | null;
  youtubeMusicUrl: string | null;
}

export interface SongMatch<T extends LibrarySong> {
  song: T;
  /** video: gleiches Video schon verlinkt; title: gleicher Titel und Interpret */
  reason: 'video' | 'title';
}

/** Findet zu einem Video den passenden Song der Bibliothek – erst über das Video, dann über Titel und Interpret. */
export function createSongMatcher<T extends LibrarySong>(
  songs: readonly T[],
): (videoId: string, parsed: ParsedVideoTitle) => SongMatch<T> | null {
  const byVideo = new Map<string, T>();
  const byTitle = new Map<string, T[]>();
  for (const song of songs) {
    const videoId = songVideoId(song);
    if (videoId && !byVideo.has(videoId)) byVideo.set(videoId, song);
    const key = matchKey(song.title);
    if (key) byTitle.set(key, [...(byTitle.get(key) ?? []), song]);
  }

  return (videoId, parsed) => {
    const linked = byVideo.get(videoId);
    if (linked) return { song: linked, reason: 'video' };
    const candidates = byTitle.get(matchKey(parsed.title)) ?? [];
    const sameArtist = candidates.find((song) => artistsMatch(song.artist, parsed.artist));
    return sameArtist ? { song: sameArtist, reason: 'title' } : null;
  };
}

export interface VideoSummary {
  videoId: string;
  title: string;
  channelTitle: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
}

export interface SearchHints {
  title?: string | null | undefined;
  artist?: string | null | undefined;
  durationSeconds?: number | null | undefined;
}

export interface RankedVideo extends VideoSummary {
  score: number;
  /** Der beste Treffer, wenn er gut genug passt, um ihn ohne Nachsehen zu übernehmen. */
  recommended: boolean;
}

/** Versionen, die selten gemeint sind, wenn jemand den Song selbst sucht. */
const UNWANTED_WORDS = [
  'cover',
  'karaoke',
  'instrumental',
  'reaction',
  'tutorial',
  'lesson',
  'slowed',
  'sped up',
  'nightcore',
  '8d',
  'bass boosted',
  'remix',
  'live',
  'acoustic',
  'piano',
  'hour',
  'hours',
];

const RECOMMEND_THRESHOLD = 7;

/** Sortiert Suchtreffer danach, wie gut sie zum gesuchten Song passen. */
export function rankVideos(videos: readonly VideoSummary[], hints: SearchHints): RankedVideo[] {
  const titleKey = matchKey(hints.title ?? '');
  const titlePlain = ` ${plainKey(hints.title ?? '')} `;
  const artist = (hints.artist ?? '').trim();
  const artistKey = matchKey(artist);
  const duration = hints.durationSeconds ?? null;

  const scored = videos.map((video, index) => {
    const text = ` ${plainKey(video.title)} `;
    const owner = video.channelTitle ?? '';
    let score = 0;

    if (titleKey) {
      if (text.includes(` ${titleKey} `)) {
        score += 4;
      } else {
        const words = titleKey.split(' ');
        score += (words.filter((word) => text.includes(` ${word} `)).length / words.length) * 3;
      }
    }

    if (artistKey) {
      const channelMatches = cleanChannelName(owner) !== '' && artistsMatch(artist, cleanChannelName(owner));
      if (text.includes(` ${artistKey} `) || channelMatches) score += 3;
      // Offizielle Quellen: automatisch erzeugte Musik-Uploads und VEVO-Kanäle des Interpreten.
      if (channelMatches && /(\s-\s*Topic|VEVO)$/i.test(owner)) score += 1;
    }

    if (duration !== null && video.durationSeconds !== null) {
      const difference = Math.abs(duration - video.durationSeconds);
      if (difference <= 3) score += 3;
      else if (difference <= 10) score += 2;
      else if (difference <= 30) score += 1;
      else if (difference > 90) score -= 2;
    }

    if (UNWANTED_WORDS.some((word) => text.includes(` ${word} `) && !titlePlain.includes(` ${word} `))) {
      score -= 4;
    }

    return { video, index, score };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  return scored.map(({ video, score }, rank) => {
    const durationFits =
      duration === null || video.durationSeconds === null || Math.abs(duration - video.durationSeconds) <= 30;
    return { ...video, score, recommended: rank === 0 && score >= RECOMMEND_THRESHOLD && durationFits };
  });
}

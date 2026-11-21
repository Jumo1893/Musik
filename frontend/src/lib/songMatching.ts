// Vergleich von Titel und Interpret, um Dubletten zu erkennen. Die Regeln sind dieselben wie im
// Backend (backend/src/services/songMatching.ts), damit beide Seiten gleich urteilen;
// Änderungen gehören in beide Dateien.

import type { Song } from '../types.ts';
import { extractAppleTrackId, extractYoutubeId, youtubeIdOf } from './links.ts';

/** Kleinschreibung, ohne Akzente und Satzzeichen – so lassen sich Schreibweisen vergleichen. */
export function simplify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/&/g, ' and ')
    .replace(/[’'ʼ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const FEATURING = /\s(?:feat\.?|ft\.?|featuring)\s.*$/i;

/** Titel ohne Zusätze wie „(feat. …)“, „[Remastered]“ oder „- Radio Edit“, aber lesbar. */
export function plainTitle(title: string): string {
  return (
    title
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(/\s[-–—]\s.*$/, '')
      .replace(FEATURING, '')
      .replace(/\s+/g, ' ')
      .trim() || title.trim()
  );
}

/** Hauptinterpret ohne Gastinterpreten („Daft Punk feat. Pharrell Williams“ → „Daft Punk“). */
export function plainArtist(artist: string): string {
  return artist.replace(FEATURING, '').trim() || artist.trim();
}

/** Vergleichsform des Titels ohne Zusätze. */
export function coreTitle(title: string): string {
  return simplify(plainTitle(title)) || simplify(title);
}

function simplifyArtist(artist: string): string {
  return simplify(artist).replace(/^the /, '');
}

/** Einzelne Namen bei Zusammenarbeiten: „Macklemore & Ryan Lewis feat. Ray Dalton“ → drei Namen. */
function artistNames(artist: string): string[] {
  return artist
    .split(/\s*(?:,|&|\+|\/|\band\b|\bund\b|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b|\bx\b|\bvs\.?)\s*/i)
    .map(simplifyArtist)
    .filter(Boolean);
}

/** 2: gleicher Interpret, 1: der Hauptinterpret einer Seite ist auch an der anderen beteiligt, 0: passt nicht. */
export function artistScore(wanted: string, found: string): number {
  if (simplifyArtist(wanted) === simplifyArtist(found)) return 2;
  const wantedNames = artistNames(wanted);
  const foundNames = artistNames(found);
  const [wantedMain] = wantedNames;
  const [foundMain] = foundNames;
  if (wantedMain && foundNames.includes(wantedMain)) return 1;
  if (foundMain && wantedNames.includes(foundMain)) return 1;
  return 0;
}

/** 2: gleicher Titel, 1: gleicher Titel ohne Zusätze, 0: passt nicht. */
export function titleScore(wanted: string, found: string): number {
  if (simplify(wanted) === simplify(found)) return 2;
  return coreTitle(wanted) === coreTitle(found) ? 1 : 0;
}

// Fassungen mit anderem Tempo oder Charakter: Die zählen nur, wenn genau so eine gesucht ist.
const OTHER_VERSION = /\b(?:remix|rmx|slowed|sped|speed up|nightcore|reverb|8d|type beat|bootleg|karaoke)\b/;

/** true, wenn der gefundene Titel eine Bearbeitung (Remix, slowed …) ist, die nicht gesucht war. */
export function isOtherVersion(wantedTitle: string, foundTitle: string): boolean {
  const other = OTHER_VERSION.exec(simplify(foundTitle));
  return other !== null && !simplify(wantedTitle).includes(other[0]);
}

// Live- und Akustikfassungen gelten als eigener Song, aber nur, wenn ein Zusatz sie so nennt:
// „Hurt (Live)“ und „Hurt - Live“ sind eine, „Live Forever“ ist keine.
const PERFORMANCE = /\b(?:live|acoustic|akustik|unplugged|instrumental)\b/g;

/** Zusätze eines Titels in Klammern oder hinter einem Gedankenstrich, vereinfacht. */
function titleAdditions(title: string): string {
  const bracketed = [...title.matchAll(/\(([^)]*)\)|\[([^\]]*)\]/g)].map((match) => match[1] ?? match[2] ?? '');
  const afterDash = /\s[-–—]\s(.*)$/.exec(title.replace(/\([^)]*\)|\[[^\]]*\]/g, ' '))?.[1] ?? '';
  return simplify([...bracketed, afterDash].join(' '));
}

/** Merkmale einer eigenen Fassung, sortiert: „Hurt (Live)“ → [„live“], „Haus am See (Remix)“ → [„remix“]. */
export function versionMarks(title: string): string[] {
  const marks = new Set<string>();
  for (const match of simplify(title).matchAll(new RegExp(OTHER_VERSION.source, 'g'))) marks.add(match[0]);
  for (const match of titleAdditions(title).matchAll(PERFORMANCE)) marks.add(match[0]);
  return [...marks].sort();
}

/** Dieselbe Fassung: Beide Titel sind Originale, oder beide sind dieselbe Art von Bearbeitung bzw. Live-Fassung. */
export function sameVersion(first: string, second: string): boolean {
  const a = versionMarks(first);
  const b = versionMarks(second);
  return a.length === b.length && a.every((mark, index) => mark === b[index]);
}

/** Erster Name eines Interpreten ohne Gastinterpreten und Artikel: „The Killers feat. X“ → „killers“. */
function mainArtistName(artist: string): string {
  return artistNames(artist)[0] ?? simplifyArtist(artist);
}

/** Derselbe Hauptinterpret; Gastinterpreten und „The“ zählen nicht („Daft Punk feat. Pharrell Williams“ = „Daft Punk“). */
export function sameMainArtist(first: string, second: string): boolean {
  if (simplifyArtist(first) !== '' && simplifyArtist(first) === simplifyArtist(second)) return true;
  const main = mainArtistName(first);
  return main !== '' && main === mainArtistName(second);
}

/**
 * Derselbe Song, egal von welchem Album: gleicher Hauptinterpret, gleicher Titel ohne Zusätze
 * wie „Remastered“ oder „feat. …“ und dieselbe Fassung (ein Remix oder eine Live-Aufnahme
 * ist ein anderer Song als das Original).
 */
export function sameSong(first: { title: string; artist: string }, second: { title: string; artist: string }): boolean {
  return (
    sameMainArtist(first.artist, second.artist) &&
    coreTitle(first.title) === coreTitle(second.title) &&
    sameVersion(first.title, second.title)
  );
}

// --- Dubletten ---------------------------------------------------------------

/** Was über einen Song bekannt ist, der vielleicht schon in der Bibliothek steht. */
export interface DuplicateQuery {
  title: string;
  artist: string;
  appleMusicUrl?: string | null | undefined;
  youtubeUrl?: string | null | undefined;
  youtubeMusicUrl?: string | null | undefined;
}

export interface Duplicate {
  song: Song;
  /** link: derselbe YouTube- oder Apple-Music-Link ist schon gespeichert; title: gleicher Song nach Titel und Interpret */
  reason: 'link' | 'title';
}

/**
 * Baut eine Suche nach Dubletten über die Bibliothek. Ein gespeicherter Link zum selben Video
 * oder Apple-Music-Track zählt immer, sonst Titel und Interpret nach sameSong. `excludeId`
 * ist der gerade bearbeitete Song; er zählt nicht als seine eigene Dublette.
 */
export function duplicateFinder(songs: readonly Song[], excludeId: number | null = null): (query: DuplicateQuery) => Duplicate | null {
  const byVideo = new Map<string, Song>();
  const byTrack = new Map<string, Song>();
  const byTitle = new Map<string, Song[]>();
  for (const song of songs) {
    if (song.id === excludeId) continue;
    const videoId = youtubeIdOf(song);
    if (videoId && !byVideo.has(videoId)) byVideo.set(videoId, song);
    const trackId = extractAppleTrackId(song.appleMusicUrl);
    if (trackId && !byTrack.has(trackId)) byTrack.set(trackId, song);
    const key = coreTitle(song.title);
    byTitle.set(key, [...(byTitle.get(key) ?? []), song]);
  }

  return (query) => {
    const videoId = extractYoutubeId(query.youtubeUrl) ?? extractYoutubeId(query.youtubeMusicUrl);
    const linkedVideo = videoId ? byVideo.get(videoId) : undefined;
    if (linkedVideo) return { song: linkedVideo, reason: 'link' };
    const trackId = extractAppleTrackId(query.appleMusicUrl);
    const linkedTrack = trackId ? byTrack.get(trackId) : undefined;
    if (linkedTrack) return { song: linkedTrack, reason: 'link' };

    if (query.title.trim() === '' || query.artist.trim() === '') return null;
    const matches = (byTitle.get(coreTitle(query.title)) ?? []).filter((song) => sameSong(song, query));
    // Die genaue Schreibweise vor einer mit Zusätzen („Hurt“ vor „Hurt (Remastered)“).
    const exact = matches.find((song) => simplify(song.title) === simplify(query.title));
    const best = exact ?? matches[0];
    return best ? { song: best, reason: 'title' } : null;
  };
}

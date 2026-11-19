// Abgleich von Titel und Interpret zwischen der eigenen Bibliothek und Online-Quellen
// (songbpm.com, MusicBrainz). Online-Quellen schreiben Songs oft etwas anders: mit
// Gastinterpreten, Zusätzen wie „Remastered“ oder ohne Artikel vor dem Bandnamen.

/** Der gesuchte Song. */
export interface SongQuery {
  title: string;
  artist: string;
  durationSeconds?: number | null | undefined;
}

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

export const FEATURING = /\s(?:feat\.?|ft\.?|featuring)\s.*$/i;

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

/** Suchtext für Online-Suchen: Hauptinterpret und Titel ohne Zusätze treffen am zuverlässigsten. */
export function searchText(query: SongQuery): string {
  return `${plainArtist(query.artist)} ${plainTitle(query.title)}`.slice(0, 200);
}

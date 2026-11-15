import { describe, expect, test } from 'vitest';
import type { Category, Song } from '../types.ts';
import { toCsv, toFilename } from './csv.ts';
import { formatCount, formatDuration, formatTotalDuration, parseDuration } from './format.ts';
import { extractYoutubeId, searchUrl, streamingLinks, youtubeQueueUrl, YOUTUBE_QUEUE_LIMIT } from './links.ts';
import { distinctGenres, filterSongs, normalizeText, songCsvRow, sortSongs, totalDuration } from './songs.ts';

let nextId = 1;

function song(overrides: Partial<Song> = {}): Song {
  const id = nextId++;
  return {
    id,
    title: `Titel ${id}`,
    artist: `Interpret ${id}`,
    album: null,
    durationSeconds: null,
    releaseYear: null,
    genre: null,
    bpm: null,
    energy: null,
    rating: null,
    notes: null,
    appleMusicUrl: null,
    youtubeUrl: null,
    youtubeMusicUrl: null,
    artworkUrl: null,
    categoryIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Dauer', () => {
  test('formatDuration zeigt Minuten:Sekunden, ab einer Stunde mit Stunden', () => {
    expect(formatDuration(217)).toBe('3:37');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(null)).toBe('–');
  });

  test('formatTotalDuration fasst in Stunden und Minuten zusammen', () => {
    expect(formatTotalDuration(0)).toBe('0 Min.');
    expect(formatTotalDuration(2700)).toBe('45 Min.');
    expect(formatTotalDuration(7200)).toBe('2 Std.');
    expect(formatTotalDuration(9060)).toBe('2 Std. 31 Min.');
    expect(formatTotalDuration(3599)).toBe('1 Std.');
  });

  test('parseDuration versteht m:ss, h:mm:ss und reine Minuten', () => {
    expect(parseDuration('3:37')).toEqual({ ok: true, seconds: 217 });
    expect(parseDuration(' 03:07 ')).toEqual({ ok: true, seconds: 187 });
    expect(parseDuration('1:02:05')).toEqual({ ok: true, seconds: 3725 });
    expect(parseDuration('4')).toEqual({ ok: true, seconds: 240 });
    expect(parseDuration('75:30')).toEqual({ ok: true, seconds: 4530 });
    expect(parseDuration('')).toEqual({ ok: true, seconds: null });
    expect(parseDuration('   ')).toEqual({ ok: true, seconds: null });
  });

  test('parseDuration lehnt Unsinn ab', () => {
    for (const input of ['abc', '3:77', '3:5:99', '1:2:3:4', '-3:00', '3,5', '0:00', '0', '3:', ':30', '24:00:00']) {
      expect(parseDuration(input), input).toEqual({ ok: false });
    }
  });

  test('formatDuration und parseDuration passen zusammen', () => {
    for (const seconds of [1, 59, 60, 217, 3599, 3600, 86_399]) {
      expect(parseDuration(formatDuration(seconds))).toEqual({ ok: true, seconds });
    }
  });

  test('formatCount wählt Einzahl oder Mehrzahl', () => {
    expect(formatCount(1, 'Song', 'Songs')).toBe('1 Song');
    expect(formatCount(0, 'Song', 'Songs')).toBe('0 Songs');
    expect(formatCount(1234, 'Song', 'Songs')).toBe('1.234 Songs');
  });
});

describe('Streaming-Links', () => {
  test('extractYoutubeId erkennt die üblichen Link-Formen', () => {
    const id = '8AHCfZTRGiI';
    for (const link of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtube.com/watch?v=${id}&list=PL123&t=42s`,
      `https://m.youtube.com/watch?feature=share&v=${id}`,
      `https://youtu.be/${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://music.youtube.com/watch?v=${id}&si=abc`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/embed/${id}?start=3`,
      `https://www.youtube.com/live/${id}`,
      `  https://youtu.be/${id}  `,
    ]) {
      expect(extractYoutubeId(link), link).toBe(id);
    }
  });

  test('extractYoutubeId liefert null, wenn keine Video-ID zu finden ist', () => {
    for (const link of [
      null,
      undefined,
      '',
      'kein link',
      'https://www.youtube.com/',
      'https://www.youtube.com/playlist?list=PL123',
      'https://www.youtube.com/watch?v=zukurz',
      'https://www.youtube.com/results?search_query=hurt',
      'https://example.org/watch?v=8AHCfZTRGiI',
      'https://notyoutu.be/8AHCfZTRGiI',
    ]) {
      expect(extractYoutubeId(link), String(link)).toBeNull();
    }
  });

  test('ohne gespeicherte Links führen alle drei Plattformen zur Suche', () => {
    const links = streamingLinks(song({ artist: 'Die Ärzte', title: 'Schrei nach Liebe & mehr' }));
    expect(links.map((link) => [link.platform, link.direct])).toEqual([
      ['appleMusic', false],
      ['youtube', false],
      ['youtubeMusic', false],
    ]);
    const term = 'Die%20%C3%84rzte%20Schrei%20nach%20Liebe%20%26%20mehr';
    expect(links.map((link) => link.url)).toEqual([
      `https://music.apple.com/search?term=${term}`,
      `https://www.youtube.com/results?search_query=${term}`,
      `https://music.youtube.com/search?q=${term}`,
    ]);
  });

  test('gespeicherte Links werden unverändert verwendet', () => {
    const stored = {
      appleMusicUrl: 'https://music.apple.com/de/album/hurt/1440811207?i=1440811252',
      youtubeUrl: 'https://youtu.be/8AHCfZTRGiI',
      youtubeMusicUrl: 'https://music.youtube.com/watch?v=AAAAAAAAAAA',
    };
    const links = streamingLinks(song(stored));
    expect(links.every((link) => link.direct)).toBe(true);
    expect(links.map((link) => link.url)).toEqual(Object.values(stored));
  });

  test('ein YouTube-Link genügt für YouTube und YouTube Music', () => {
    const fromYoutube = streamingLinks(song({ youtubeUrl: 'https://youtu.be/8AHCfZTRGiI' }));
    expect(fromYoutube[2]).toMatchObject({ direct: true, url: 'https://music.youtube.com/watch?v=8AHCfZTRGiI' });

    const fromMusic = streamingLinks(song({ youtubeMusicUrl: 'https://music.youtube.com/watch?v=8AHCfZTRGiI' }));
    expect(fromMusic[1]).toMatchObject({ direct: true, url: 'https://www.youtube.com/watch?v=8AHCfZTRGiI' });
    expect(fromMusic[0]!.direct).toBe(false);
  });

  test('die Apple-Music-Suche führt in den Katalog des eingestellten Landes', () => {
    expect(searchUrl('appleMusic', 'Hurt', 'de')).toBe('https://music.apple.com/de/search?term=Hurt');
    expect(searchUrl('appleMusic', 'Hurt')).toBe('https://music.apple.com/search?term=Hurt');
    // Nur zweistellige Ländercodes gelangen in die Adresse.
    expect(searchUrl('appleMusic', 'Hurt', '../x')).toBe('https://music.apple.com/search?term=Hurt');
    expect(searchUrl('youtube', 'Hurt', 'de')).toBe('https://www.youtube.com/results?search_query=Hurt');
    expect(streamingLinks(song({ artist: 'A', title: 'B' }), 'de')[0]!.url).toBe(
      'https://music.apple.com/de/search?term=A%20B',
    );
  });

  test('searchUrl kürzt Leerraum und kodiert Sonderzeichen', () => {
    expect(searchUrl('youtube', '  AC/DC T.N.T. ')).toBe('https://www.youtube.com/results?search_query=AC%2FDC%20T.N.T.');
  });

  test('youtubeQueueUrl baut eine Wiedergabeliste ohne Dopplungen und mit Obergrenze', () => {
    expect(youtubeQueueUrl([])).toBeNull();
    expect(youtubeQueueUrl(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'aaaaaaaaaaa'])).toBe(
      'https://www.youtube.com/watch_videos?video_ids=aaaaaaaaaaa,bbbbbbbbbbb',
    );
    const many = Array.from({ length: 80 }, (_, index) => `video${String(index).padStart(6, '0')}`);
    const url = new URL(youtubeQueueUrl(many)!);
    expect(url.searchParams.get('video_ids')!.split(',')).toHaveLength(YOUTUBE_QUEUE_LIMIT);
  });
});

describe('CSV', () => {
  test('trennt mit Semikolon und setzt Anführungszeichen nur wo nötig', () => {
    expect(toCsv(['Titel', 'Dauer'], [['Hurt', 217]])).toBe('Titel;Dauer\r\nHurt;217\r\n');
    expect(toCsv(['a'], [['mit; Semikolon'], ['mit "Zitat"'], ['mit\nUmbruch'], [null], [undefined]])).toBe(
      'a\r\n"mit; Semikolon"\r\n"mit ""Zitat"""\r\n"mit\nUmbruch"\r\n\r\n\r\n',
    );
  });

  test('entschärft Zellen, die ein Tabellenprogramm als Formel lesen würde', () => {
    expect(toCsv(['a'], [['=SUMME(A1)'], ['+44'], ['-'], ['@home']])).toBe("a\r\n'=SUMME(A1)\r\n'+44\r\n'-\r\n'@home\r\n");
    // Zahlen bleiben Zahlen, auch negative.
    expect(toCsv(['a'], [[-5]])).toBe('a\r\n-5\r\n');
  });

  test('toFilename entfernt Zeichen, die in Dateinamen nicht erlaubt sind', () => {
    expect(toFilename('Abend/Runde: "ruhig"?')).toBe('Abend Runde ruhig');
    expect(toFilename('  Sommer   2026 ')).toBe('Sommer 2026');
    expect(toFilename('???', 'playlist')).toBe('playlist');
  });
});

describe('Songliste', () => {
  const hurt = song({ title: 'Hurt', artist: 'Johnny Cash', album: 'American IV', genre: 'Country', categoryIds: [1, 2] });
  const maedchen = song({ title: 'Mädchen', artist: 'Lucilectric', genre: 'Pop', categoryIds: [2] });
  const africa = song({ title: 'Africa', artist: 'Toto', categoryIds: [] });
  const all = [hurt, maedchen, africa];
  const noFilter = { text: '', categoryIds: [], onlyUncategorized: false };

  test('normalizeText ignoriert Groß-/Kleinschreibung und Akzente', () => {
    expect(normalizeText('Mädchen Café BEYONCÉ')).toBe('madchen cafe beyonce');
  });

  test('die Suche findet alle Wörter in Titel, Interpret, Album oder Genre', () => {
    const search = (text: string) => filterSongs(all, { ...noFilter, text }).map((s) => s.title);
    expect(search('')).toEqual(['Hurt', 'Mädchen', 'Africa']);
    expect(search('cash')).toEqual(['Hurt']);
    expect(search('hurt johnny')).toEqual(['Hurt']);
    expect(search('american')).toEqual(['Hurt']);
    expect(search('madchen')).toEqual(['Mädchen']);
    expect(search('MÄDCHEN')).toEqual(['Mädchen']);
    expect(search('pop')).toEqual(['Mädchen']);
    expect(search('hurt toto')).toEqual([]);
  });

  test('Kategorie-Filter verlangen alle gewählten Kategorien', () => {
    const byCategories = (categoryIds: number[]) => filterSongs(all, { ...noFilter, categoryIds }).map((s) => s.title);
    expect(byCategories([2])).toEqual(['Hurt', 'Mädchen']);
    expect(byCategories([1, 2])).toEqual(['Hurt']);
    expect(byCategories([3])).toEqual([]);
    expect(filterSongs(all, { ...noFilter, onlyUncategorized: true })).toEqual([africa]);
  });

  test('sortiert nach Text ohne Rücksicht auf Groß-/Kleinschreibung und Umlaute', () => {
    const songs = [song({ artist: 'Zaz' }), song({ artist: 'ärzte' }), song({ artist: 'ABBA' }), song({ artist: 'abba', title: 'A' })];
    const sorted = sortSongs(songs, { key: 'artist', descending: false }).map((s) => s.artist);
    expect(sorted).toEqual(['abba', 'ABBA', 'ärzte', 'Zaz']);
    expect(sortSongs(songs, { key: 'artist', descending: true })[0]!.artist).toBe('Zaz');
  });

  test('Songs ohne Angabe stehen beim Sortieren nach Zahlen immer am Ende', () => {
    const short = song({ durationSeconds: 100 });
    const long = song({ durationSeconds: 300 });
    const unknown = song({ durationSeconds: null });
    const songs = [unknown, long, short];
    expect(sortSongs(songs, { key: 'duration', descending: false })).toEqual([short, long, unknown]);
    expect(sortSongs(songs, { key: 'duration', descending: true })).toEqual([long, short, unknown]);
  });

  test('sortiert nach Hinzufügedatum und lässt die Eingabe unverändert', () => {
    const older = song({ createdAt: '2026-01-01T10:00:00.000Z' });
    const newer = song({ createdAt: '2026-03-01T10:00:00.000Z' });
    const songs = [older, newer];
    expect(sortSongs(songs, { key: 'added', descending: true })).toEqual([newer, older]);
    expect(songs).toEqual([older, newer]);
  });

  test('totalDuration zählt Songs ohne Dauer nicht mit', () => {
    expect(totalDuration([song({ durationSeconds: 100 }), song(), song({ durationSeconds: 20 })])).toBe(120);
  });

  test('distinctGenres fasst Schreibweisen zusammen und sortiert', () => {
    const songs = [song({ genre: 'Rock' }), song({ genre: 'pop' }), song({ genre: 'Pop' }), song({ genre: ' ' }), song()];
    expect(distinctGenres(songs)).toEqual(['pop', 'Rock']);
  });

  test('songCsvRow schreibt Kategorien als Namen', () => {
    const categories = new Map<number, Category>([
      [1, { id: 1, name: 'ruhig', color: '#2a78d6', description: null, songCount: 1 }],
      [2, { id: 2, name: 'Abend', color: '#eb6834', description: null, songCount: 2 }],
    ]);
    const row = songCsvRow({ ...hurt, durationSeconds: 217, rating: 5, categoryIds: [1, 2, 99] }, categories);
    expect(row.slice(0, 5)).toEqual(['Hurt', 'Johnny Cash', 'American IV', '3:37', 217]);
    expect(row[10]).toBe('Abend, ruhig');
  });
});

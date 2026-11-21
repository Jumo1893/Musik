import { describe, expect, test } from 'vitest';
import type { Category, GeneratorCriteria, GenreInfo, Song } from '../types.ts';
import { describeCriteria, EMPTY_CRITERIA } from './criteria.ts';
import { toCsv, toFilename } from './csv.ts';
import { formatCount, formatDuration, formatTotalDuration, parseDuration } from './format.ts';
import {
  GenreIndex,
  genreTree,
  libraryGenreGroups,
  sameGenres,
  type GenreTreeMainRow,
  type GenreTreeOptions,
} from './genres.ts';
import {
  extractAppleTrackId,
  extractYoutubeId,
  looksLikeLink,
  searchUrl,
  streamingLinks,
  youtubeQueueUrl,
  YOUTUBE_QUEUE_LIMIT,
} from './links.ts';
import { duplicateFinder } from './songMatching.ts';
import { librarySuggestions, type SuggestionTarget } from './suggestions.ts';
import {
  addGenre,
  distinctGenres,
  filterSongs,
  mergeGenres,
  normalizeText,
  removeGenre,
  SONG_CSV_HEADER,
  songCsvRow,
  sortSongs,
  totalDuration,
} from './songs.ts';

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
    genres: [],
    mainGenres: [],
    bpm: null,
    energy: null,
    singAlong: null,
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
  const hurt = song({
    title: 'Hurt',
    artist: 'Johnny Cash',
    album: 'American IV',
    genres: ['Country'],
    mainGenres: ['Country'],
    categoryIds: [1, 2],
  });
  const maedchen = song({
    title: 'Mädchen',
    artist: 'Lucilectric',
    genres: ['Pop', 'Neue Deutsche Welle'],
    mainGenres: ['Pop', 'Electronic'],
    categoryIds: [2],
  });
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
    expect(search('deutsche welle')).toEqual(['Mädchen']);
    // Auch das Hauptgenre zählt, obwohl es nicht am Song steht.
    expect(search('electronic')).toEqual(['Mädchen']);
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

  test('distinctGenres sammelt die Genres aller Songs, fasst Schreibweisen zusammen und sortiert', () => {
    const songs = [
      song({ genres: ['Rock'] }),
      song({ genres: ['pop', 'Dance'] }),
      song({ genres: ['Pop', 'rock'] }),
      song({ genres: [' '] }),
      song(),
    ];
    expect(distinctGenres(songs)).toEqual(['Dance', 'pop', 'Rock']);
  });

  test('mergeGenres nimmt die erste Schreibweise und ergänzt fehlende Genres', () => {
    expect(mergeGenres(['Pop', 'Rock'], ['rock', ' Jazz '])).toEqual(['Jazz', 'Pop', 'Rock']);
    expect(mergeGenres([], [])).toEqual([]);
  });

  test('addGenre und removeGenre achten nicht auf Groß-/Kleinschreibung und Satzzeichen', () => {
    expect(addGenre(['Pop'], ' Dance ')).toEqual(['Pop', 'Dance']);
    expect(addGenre(['Pop'], 'POP')).toEqual(['Pop']);
    expect(addGenre(['Hip-Hop'], 'hip hop')).toEqual(['Hip-Hop']);
    expect(addGenre(['Pop'], '   ')).toEqual(['Pop']);
    expect(removeGenre(['Pop', 'Dance'], 'dance')).toEqual(['Pop']);
  });

  test('songCsvRow schreibt Genres, Hauptgenres und Kategorien als Namen', () => {
    const categories = new Map<number, Category>([
      [1, { id: 1, name: 'ruhig', color: '#2a78d6', description: null, songCount: 1 }],
      [2, { id: 2, name: 'Abend', color: '#eb6834', description: null, songCount: 2 }],
    ]);
    const row = songCsvRow(
      {
        ...hurt,
        durationSeconds: 217,
        energy: 2,
        singAlong: 4,
        rating: 5,
        genres: ['Country Rock', 'Folk'],
        mainGenres: ['Rock', 'Country', 'Folk'],
        categoryIds: [1, 2, 99],
      },
      categories,
    );
    expect(row.slice(0, 5)).toEqual(['Hurt', 'Johnny Cash', 'American IV', '3:37', 217]);
    expect(row[6]).toBe('Country Rock, Folk');
    expect(row[7]).toBe('Rock, Country, Folk');
    expect(SONG_CSV_HEADER.slice(9, 13)).toEqual(['Energie', 'Mitsingen', 'Bewertung', 'Kategorien']);
    expect(row.slice(9, 13)).toEqual([2, 4, 5, 'Abend, ruhig']);
    expect(row).toHaveLength(SONG_CSV_HEADER.length);
  });
});

describe('Generator-Kriterien', () => {
  const categories = new Map<number, Category>();

  test('describeCriteria nennt Energie- und Mitsingen-Bereich', () => {
    expect(
      describeCriteria({ ...EMPTY_CRITERIA, targetMinutes: null, energyMin: 2, energyMax: 4, singAlongMin: 4 }, categories),
    ).toEqual(['Energie 2–4', 'Mitsingen ab 4']);
    expect(describeCriteria({ ...EMPTY_CRITERIA, targetMinutes: null, singAlongMin: 3, singAlongMax: 3 }, categories)).toEqual([
      'Mitsingen 3',
    ]);
  });

  test('describeCriteria kommt mit Kriterien von vor dem Mitsingen-Filter zurecht', () => {
    const { singAlongMin: _min, singAlongMax: _max, ...old } = { ...EMPTY_CRITERIA, targetMinutes: null, energyMax: 2 };
    expect(describeCriteria(old as GeneratorCriteria, categories)).toEqual(['Energie bis 2']);
  });
});

describe('Genre-Liste', () => {
  const info = (name: string, overrides: Partial<GenreInfo> = {}): GenreInfo => ({
    name,
    isMain: false,
    mainGenres: [],
    featuredIn: [],
    custom: false,
    aliases: [],
    ...overrides,
  });
  const index = new GenreIndex([
    info('Pop', { isMain: true }),
    info('Rock', { isMain: true }),
    info('Hip-Hop', { isMain: true, aliases: ['rap', 'hip-hop/rap'] }),
    info('Electronic', { isMain: true }),
    info('Alternative Rock', { mainGenres: ['Rock'], aliases: ['alternative'] }),
    info('Pop Rock', { mainGenres: ['Pop', 'Rock'] }),
    info('Punk Rock', { mainGenres: ['Rock'], aliases: ['punk'] }),
    info('Pop-Punk', { mainGenres: ['Pop', 'Rock'] }),
    info('Rock and Roll', { mainGenres: ['Rock'] }),
    info('EDM', { mainGenres: ['Electronic'], aliases: ['electronic dance music', 'dance'] }),
    info('Électro', { mainGenres: ['Electronic', 'Hip-Hop'] }),
    info('New wave pop', { custom: true, mainGenres: ['Pop'] }),
  ]);

  test('ordnet Schreibweisen den Genres der Liste zu', () => {
    expect(index.canonical('hip hop')).toBe('Hip-Hop');
    expect(index.canonical('Hip-Hop/Rap')).toBe('Hip-Hop');
    expect(index.canonical('ALTERNATIVE')).toBe('Alternative Rock');
    expect(index.canonical(' Polka ')).toBe('Polka');
    expect(index.mainGenresOf('pop rock')).toEqual(['Pop', 'Rock']);
    expect(index.mainGenresOf('Rock')).toEqual(['Rock']);
    expect(index.mainGenresOf('Polka')).toEqual([]);
    expect(index.mainGenresOfAll(['Électro', 'Pop Rock', 'Polka'])).toEqual(['Pop', 'Rock', 'Hip-Hop', 'Electronic']);
  });

  test('die Suche bevorzugt Treffer am Anfang, Hauptgenres und kurze Namen', () => {
    const names = (query: string) => index.search(query).map((genre) => genre.name);
    expect(names('rock')).toEqual(['Rock', 'Rock and Roll', 'Pop Rock', 'Punk Rock', 'Alternative Rock']);
    // Eine genau passende Schreibweise steht vorn, auch vor Namen, die mit dem Wort beginnen.
    expect(names('punk')).toEqual(['Punk Rock', 'Pop-Punk']);
    expect(names('rap')).toEqual(['Hip-Hop']);
    expect(names('dance')).toEqual(['EDM']);
    expect(names('electro')).toEqual(['Électro', 'Electronic', 'EDM']);
    expect(names('ternat')).toEqual(['Alternative Rock']);
    expect(names('  ')).toEqual([]);
  });

  test('sameGenres vergleicht ohne Reihenfolge und Schreibweise', () => {
    expect(sameGenres(['Pop', 'Hip-Hop'], ['hip hop', 'pop'])).toBe(true);
    expect(sameGenres(['Pop'], ['Pop', 'Rock'])).toBe(false);
    expect(sameGenres([], [])).toBe(true);
  });

  test('die Genres der Bibliothek stehen beim jeweiligen Hauptgenre', () => {
    const songs = [
      song({ genres: ['Pop Rock'], mainGenres: ['Pop', 'Rock'] }),
      song({ genres: ['Punk Rock', 'Hip-Hop'], mainGenres: ['Rock', 'Hip-Hop'] }),
      song({ genres: ['Mein Genre'], mainGenres: [] }),
      song({ genres: ['New wave pop'], mainGenres: ['Pop'] }),
    ];
    expect(libraryGenreGroups(songs, index)).toEqual([
      { main: 'Pop', subgenres: ['New wave pop', 'Pop Rock'] },
      { main: 'Rock', subgenres: ['Pop Rock', 'Punk Rock'] },
      { main: 'Hip-Hop', subgenres: [] },
      { main: null, subgenres: ['Mein Genre'] },
    ]);
  });

  test('neue Genres bekommen die Hauptgenres, die als Wort im Namen stehen', () => {
    expect(index.guessMainGenres('New wave pop')).toEqual(['Pop']);
    expect(index.guessMainGenres('Deutscher Rock & Pop')).toEqual(['Pop', 'Rock']);
    expect(index.guessMainGenres('Ostblock Rap')).toEqual(['Hip-Hop']);
    // Nur ganze Wörter: „Popcorn“ ist kein Pop.
    expect(index.guessMainGenres('Popcorn')).toEqual([]);
    // So stehen sie schon vor dem Speichern beim richtigen Hauptgenre.
    expect(index.mainGenresOf('Deutscher Rock')).toEqual(['Rock']);
    expect(index.mainGenresOfAll(['Ostblock Rap', 'Pop Rock'])).toEqual(['Pop', 'Rock', 'Hip-Hop']);
  });
});

describe('Genre-Auswahl als Baum', () => {
  const info = (name: string, overrides: Partial<GenreInfo> = {}): GenreInfo => ({
    name,
    isMain: false,
    mainGenres: [],
    featuredIn: [],
    custom: false,
    aliases: [],
    ...overrides,
  });
  const index = new GenreIndex([
    info('Pop', { isMain: true }),
    info('Rock', { isMain: true }),
    info('Hip-Hop', { isMain: true, aliases: ['rap'] }),
    info('Alternative Rock', { mainGenres: ['Rock'], featuredIn: ['Rock'] }),
    info('Boom Bap', { mainGenres: ['Hip-Hop'], featuredIn: ['Hip-Hop'] }),
    info('Deutschrap', { mainGenres: ['Hip-Hop'] }),
    info('Krautrock', { mainGenres: ['Rock'] }),
    info('Math Rock', { mainGenres: ['Rock'] }),
    info('New wave pop', { mainGenres: ['Pop'], custom: true }),
    info('Pop Rock', { mainGenres: ['Pop', 'Rock'], featuredIn: ['Pop'] }),
    info('Pop-Punk', { mainGenres: ['Pop', 'Rock'] }),
    info('Punk Rock', { mainGenres: ['Rock'], featuredIn: ['Rock'] }),
    info('Schrammelmusik', { custom: true }),
    info('Shoegaze', { mainGenres: ['Rock'] }),
    info('Zeuhl', { mainGenres: ['Rock'] }),
  ]);
  const options = (overrides: Partial<GenreTreeOptions> = {}): GenreTreeOptions => ({
    value: [],
    libraryGenres: [],
    expanded: new Set(),
    showAll: new Set(),
    ...overrides,
  });
  const main = (name: string | null, overrides: Partial<GenreTreeMainRow> = {}): GenreTreeMainRow => ({
    kind: 'main',
    main: name,
    expanded: false,
    selected: false,
    selectedCount: 0,
    ...overrides,
  });
  const sub = (genre: string, mainGenre: string | null, selected = false) => ({ kind: 'sub', genre, main: mainGenre, selected });

  test('zugeklappt stehen die Hauptgenres da, mit der Zahl gewählter Untergenres', () => {
    expect(genreTree(index, options({ value: ['punk rock', 'Pop', 'Alternative Rock'] }))).toEqual([
      main('Pop', { selected: true }),
      main('Rock', { selectedCount: 2 }),
      main('Hip-Hop'),
      // Eigene Genres ohne Hauptgenre haben eine eigene Gruppe.
      main(null),
    ]);
  });

  test('aufgeklappt zeigt ein Hauptgenre seine kurze Liste und „Mehr anzeigen“', () => {
    const rows = genreTree(index, options({ value: ['Zeuhl'], libraryGenres: ['Shoegaze'], expanded: new Set(['Rock']) }));
    expect(rows.slice(1, 7)).toEqual([
      main('Rock', { expanded: true, selectedCount: 1 }),
      // Bekannte Untergenres, gewählte und die der Bibliothek, alphabetisch
      sub('Alternative Rock', 'Rock'),
      sub('Punk Rock', 'Rock'),
      sub('Shoegaze', 'Rock'),
      sub('Zeuhl', 'Rock', true),
      { kind: 'more', main: 'Rock', hidden: 4 },
    ]);
    expect(rows[7]).toEqual(main('Hip-Hop'));
  });

  test('„Mehr anzeigen“ zeigt alle Untergenres', () => {
    const rows = genreTree(index, options({ expanded: new Set(['Rock']), showAll: new Set(['Rock']) }));
    expect(rows.filter((row) => row.kind === 'sub').map((row) => row.genre)).toEqual([
      'Alternative Rock',
      'Krautrock',
      'Math Rock',
      'Pop Rock',
      'Pop-Punk',
      'Punk Rock',
      'Shoegaze',
      'Zeuhl',
    ]);
    expect(rows.some((row) => row.kind === 'more')).toBe(false);
  });

  test('versteckt „Mehr anzeigen“ nur wenige Untergenres, stehen gleich alle da', () => {
    const rows = genreTree(index, options({ expanded: new Set(['Pop', 'Hip-Hop']) }));
    expect(rows).toEqual([
      main('Pop', { expanded: true }),
      sub('New wave pop', 'Pop'),
      sub('Pop Rock', 'Pop'),
      sub('Pop-Punk', 'Pop'),
      main('Rock'),
      main('Hip-Hop', { expanded: true }),
      sub('Boom Bap', 'Hip-Hop'),
      sub('Deutschrap', 'Hip-Hop'),
      main(null),
    ]);
  });

  test('abgewählte Genres bleiben sichtbar, statt aus der kurzen Liste zu verschwinden', () => {
    const rows = genreTree(index, options({ keepVisible: ['Krautrock'], expanded: new Set(['Rock']) }));
    expect(rows).toContainEqual(sub('Krautrock', 'Rock'));
    expect(rows).toContainEqual({ kind: 'more', main: 'Rock', hidden: 5 });
  });

  test('eingetippte Genres stehen beim Hauptgenre, das sie beim Speichern bekommen', () => {
    const rows = genreTree(
      index,
      options({ value: ['Deutscher Rock', 'Polka'], expanded: new Set(['Rock', null]), showAll: new Set(['Rock']) }),
    );
    expect(rows).toContainEqual(main('Rock', { expanded: true, selectedCount: 1 }));
    expect(rows).toContainEqual(sub('Deutscher Rock', 'Rock', true));
    // Ohne passendes Hauptgenre landen sie bei den eigenen Genres ohne Hauptgenre.
    expect(rows.slice(-3)).toEqual([
      main(null, { expanded: true, selectedCount: 1 }),
      sub('Polka', null, true),
      sub('Schrammelmusik', null),
    ]);
  });
});

describe('Dubletten', () => {
  const hurt = song({
    title: 'Hurt',
    artist: 'Johnny Cash',
    album: 'American IV',
    appleMusicUrl: 'https://music.apple.com/de/album/hurt/1440811595?i=1440811605',
    youtubeUrl: 'https://www.youtube.com/watch?v=8AHCfZTRGiI',
  });
  const live = song({ title: 'Hurt (Live)', artist: 'Johnny Cash', album: 'Live' });
  const find = duplicateFinder([hurt, live]);

  test('Apple-Music-Links nennen ihre Track-ID, Alben und Playlists nicht', () => {
    expect(extractAppleTrackId('https://music.apple.com/de/album/hurt/1440811595?i=1440811605')).toBe('1440811605');
    expect(extractAppleTrackId('https://music.apple.com/de/song/hurt/1440811605')).toBe('1440811605');
    expect(extractAppleTrackId('https://music.apple.com/us/song/1440811605')).toBe('1440811605');
    expect(extractAppleTrackId('https://music.apple.com/de/album/american-iv/1440811595')).toBeNull();
    expect(extractAppleTrackId('https://music.apple.com/de/playlist/x/pl.u-abc')).toBeNull();
    expect(extractAppleTrackId('https://example.org/song/x/123')).toBeNull();
  });

  test('derselbe Song von einem anderen Album oder mit Zusätzen ist eine Dublette', () => {
    expect(find({ title: 'Hurt', artist: 'Johnny Cash' })).toEqual({ song: hurt, reason: 'title' });
    expect(find({ title: 'Hurt (Remastered)', artist: 'johnny cash' })?.song).toBe(hurt);
    expect(find({ title: 'Hurt', artist: 'Johnny Cash feat. June Carter' })?.song).toBe(hurt);
  });

  test('eine Live-Fassung zählt nur, wenn die vorhandene auch eine ist', () => {
    expect(find({ title: 'Hurt - Live', artist: 'Johnny Cash' })?.song).toBe(live);
    expect(find({ title: 'Hurt (Remix)', artist: 'Johnny Cash' })).toBeNull();
    expect(find({ title: 'Hurt', artist: 'Nine Inch Nails' })).toBeNull();
  });

  test('ein schon gespeicherter Link ist immer eine Dublette', () => {
    expect(find({ title: 'Irgendwas', artist: 'Jemand', youtubeUrl: 'https://youtu.be/8AHCfZTRGiI?t=30' })).toEqual({
      song: hurt,
      reason: 'link',
    });
    expect(find({ title: '', artist: '', appleMusicUrl: 'https://music.apple.com/de/song/hurt/1440811605' })?.song).toBe(hurt);
  });

  test('der bearbeitete Song ist nicht seine eigene Dublette', () => {
    const whileEditing = duplicateFinder([hurt, live], hurt.id);
    expect(whileEditing({ title: 'Hurt', artist: 'Johnny Cash', youtubeUrl: hurt.youtubeUrl })).toBeNull();
  });
});

describe('Links im Suchfeld', () => {
  test('looksLikeLink unterscheidet Links von Suchbegriffen', () => {
    expect(looksLikeLink('https://music.apple.com/de/song/hurt/1440811605')).toBe(true);
    expect(looksLikeLink(' youtu.be/8AHCfZTRGiI ')).toBe(true);
    expect(looksLikeLink('music.youtube.com/watch?v=8AHCfZTRGiI')).toBe(true);
    expect(looksLikeLink('Hurt Johnny Cash')).toBe(false);
    expect(looksLikeLink('https://example.org/x y')).toBe(false);
  });
});

describe('Vorschläge aus ähnlichen Songs', () => {
  const MELANCHOLY = 1;
  const CALM = 2;
  const PARTY = 3;
  const categories = new Map<number, Category>([
    [MELANCHOLY, { id: MELANCHOLY, name: 'melancholisch', color: '#2a78d6', description: null, songCount: 0 }],
    [CALM, { id: CALM, name: 'ruhig', color: '#1baf7a', description: null, songCount: 0 }],
    [PARTY, { id: PARTY, name: 'Party', color: '#eb6834', description: null, songCount: 0 }],
  ]);
  const cash = (overrides: Partial<Song>) => song({ artist: 'Johnny Cash', ...overrides });
  const target = (overrides: Partial<SuggestionTarget> = {}): SuggestionTarget => ({
    id: null,
    artist: 'Johnny Cash',
    genres: [],
    mainGenres: [],
    bpm: null,
    ...overrides,
  });

  test('gleicher Interpret: ab zwei Songs und wenn mindestens die Hälfte die Kategorie hat', () => {
    const library = [
      cash({ categoryIds: [MELANCHOLY, CALM], energy: 2 }),
      cash({ categoryIds: [MELANCHOLY], energy: 2 }),
      cash({ categoryIds: [MELANCHOLY, PARTY], energy: 4 }),
      cash({ categoryIds: [] }),
      song({ artist: 'Nine Inch Nails', categoryIds: [PARTY] }),
    ];
    const result = librarySuggestions(library, target(), categories);
    expect(result.categories.map((item) => item.categoryId)).toEqual([MELANCHOLY]);
    expect(result.categories[0]!.reason).toBe('3 von 3 Songs von Johnny Cash haben „melancholisch“');
    expect(result.energy).toEqual({ value: 2, count: 2, total: 3, basis: 'Songs von Johnny Cash' });
    expect(result.singAlong).toBeNull();

    // Schon gewählte Kategorien werden nicht noch einmal vorgeschlagen.
    expect(librarySuggestions(library, target(), categories, [MELANCHOLY]).categories).toEqual([]);
    // Ein einzelner Song reicht nicht.
    expect(librarySuggestions(library.slice(0, 1), target(), categories).categories).toEqual([]);
  });

  test('der Interpret zählt stärker als ein gemeinsames Untergenre, das mehr als ein Hauptgenre mit Tempo', () => {
    const library = [
      song({ artist: 'A', genres: ['Alternative Rock'], mainGenres: ['Rock'], categoryIds: [PARTY] }),
      song({ artist: 'B', genres: ['Alternative Rock'], mainGenres: ['Rock'], categoryIds: [PARTY] }),
      cash({ categoryIds: [CALM] }),
      cash({ categoryIds: [CALM] }),
      song({ artist: 'C', genres: ['Rock'], mainGenres: ['Rock'], bpm: 125, categoryIds: [MELANCHOLY] }),
      song({ artist: 'D', genres: ['Punk Rock'], mainGenres: ['Rock'], bpm: 118, categoryIds: [MELANCHOLY] }),
      song({ artist: 'E', genres: ['Rock'], mainGenres: ['Rock'], bpm: 160, categoryIds: [PARTY] }),
    ];
    const result = librarySuggestions(
      library,
      target({ genres: ['Alternative Rock'], mainGenres: ['Rock'], bpm: 120 }),
      categories,
    );
    expect(result.categories.map((item) => item.categoryId)).toEqual([CALM, PARTY, MELANCHOLY]);
    expect(result.categories[1]!.reason).toBe('häufig bei Alternative Rock: 2 von 2 Songs haben „Party“');
    expect(result.categories[2]!.reason).toMatch(/^häufig bei Rock mit ähnlichem Tempo/);
  });

  test('ohne passende Songs gibt es nichts, und der Song selbst zählt nie', () => {
    const self = cash({ categoryIds: [MELANCHOLY], energy: 3 });
    const other = cash({ categoryIds: [MELANCHOLY], energy: 3 });
    expect(librarySuggestions([self, other], target({ id: self.id }), categories)).toEqual({
      categories: [],
      energy: null,
      singAlong: null,
    });
    expect(librarySuggestions([self, other], target({ artist: 'Niemand' }), categories).categories).toEqual([]);
  });
});

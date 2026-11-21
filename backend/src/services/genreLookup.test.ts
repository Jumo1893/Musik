import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { HttpError } from '../errors.ts';
import { catalogDb, testCatalog } from '../testing/testGenres.ts';
import {
  chooseGenres,
  earliestReleaseYear,
  GenreLookupService,
  matchingRecordings,
  pickReleaseGroups,
  rankGenres,
  type TagLevel,
} from './genreLookup.ts';
import type { MbRecording } from './musicBrainz.ts';

const ARTIST_ID = '012151a8-0f9a-44c9-997f-ebd68b5389f9';
const ALBUM_ID = 'a186ae54-41a1-4b46-861c-c0d80c154556';
const SINGLE_ID = 'b2b4e4d8-5a37-4a9f-9a3e-4f3c1b2a6d11';
const BEST_OF_ID = 'c3c5f5e9-6b48-4b0a-8b4f-5a4d2c3b7e22';

function recording(overrides: Partial<MbRecording> = {}): MbRecording {
  return {
    id: 'rec-1',
    score: 100,
    title: 'Warriors',
    length: 170_000,
    'artist-credit': [{ name: 'Imagine Dragons', joinphrase: '', artist: { id: ARTIST_ID, name: 'Imagine Dragons' } }],
    releases: [],
    tags: [],
    ...overrides,
  };
}

const tags = (entries: Record<string, number>) => Object.entries(entries).map(([name, count]) => ({ name, count }));

describe('matchingRecordings', () => {
  test('behält nur Aufnahmen mit passendem Titel und Interpret, die genaueste zuerst', () => {
    const query = { title: 'Warriors', artist: 'Imagine Dragons', durationSeconds: 170 };
    const found = matchingRecordings(
      [
        recording({ id: 'live', title: 'Warriors (live)', length: 180_000 }),
        recording({ id: 'other-artist', 'artist-credit': [{ name: 'Edward Sharpe', artist: { id: 'x', name: 'Edward Sharpe' } }] }),
        recording({ id: 'remix', title: 'Warriors (Remix)' }),
        recording({ id: 'weak', score: 40 }),
        recording({ id: 'longer', length: 240_000 }),
        recording({ id: 'exact' }),
      ],
      query,
    );
    assert.deepEqual(
      found.map((item) => item.id),
      ['exact', 'longer', 'live'],
    );
  });
});

describe('pickReleaseGroups', () => {
  test('nimmt die erste Single mit dem Titel und das erste Album, keine Sampler', () => {
    const query = { title: 'Warriors', artist: 'Imagine Dragons' };
    const group = (id: string, title: string, type: string, secondary: string[] = []) => ({
      id,
      title,
      'primary-type': type,
      'secondary-types': secondary,
    });
    const picked = pickReleaseGroups(
      [
        recording({
          releases: [
            { id: 'r1', date: '2015-02-17', 'release-group': group(ALBUM_ID, 'Smoke + Mirrors', 'Album') },
            { id: 'r2', date: '2014-09-18', 'release-group': group(SINGLE_ID, 'Warriors', 'Single') },
            { id: 'r3', date: '2010-01-01', 'release-group': group('other-single', 'Radioactive', 'Single') },
            { id: 'r4', date: '2013-01-01', 'release-group': group(BEST_OF_ID, 'Hits 2014', 'Album', ['Compilation']) },
          ],
        }),
      ],
      query,
    );
    // Erstveröffentlichung ist die Single von 2014; der frühere Sampler und die andere Single zählen nicht.
    assert.deepEqual(picked, { single: SINGLE_ID, album: ALBUM_ID, firstYear: 2014 });
  });
});

describe('earliestReleaseYear', () => {
  const query = { title: 'Folsom Prison Blues', artist: 'Johnny Cash' };
  const cash = [{ name: 'Johnny Cash', joinphrase: '', artist: { id: ARTIST_ID, name: 'Johnny Cash' } }];
  const single = (title: string, date: string, secondary: string[] = []) => ({
    id: title,
    title,
    'first-release-date': date,
    'primary-type': 'Single',
    'secondary-types': secondary,
    'artist-credit': cash,
  });

  test('findet die erste Single auch als Seite einer Doppel-Single, ohne Live- und andere Fassungen', () => {
    const recordings = [
      recording({ title: 'Folsom Prison Blues', 'first-release-date': '1964', disambiguation: 'live, 1964-07-24: Newport Folk Festival' }),
      recording({ title: 'Folsom Prison Blues', 'first-release-date': '1989' }),
      recording({ title: 'Folsom Prison Blues (Remix)', 'first-release-date': '1950' }),
    ];
    const singles = [
      single('Folsom Prison Blues / So Doggone Lonesome', '1955-12-15'),
      single('Folsom Prison Blues', '1968-04-30'),
      single('Folsom Prison Blues / San Quentin', '1950', ['Live']),
      { ...single('Folsom Prison Blues', '1940'), 'artist-credit': [{ name: 'Someone', artist: { id: 'x', name: 'Someone' } }] },
    ];
    assert.equal(earliestReleaseYear(null, recordings, singles, query), 1955);
    assert.equal(earliestReleaseYear(null, recordings, [], query), 1989);
    assert.equal(earliestReleaseYear(1957, recordings, [], query), 1957);
    assert.equal(earliestReleaseYear(null, [], [], query), null);
  });
});

describe('rankGenres und chooseGenres', () => {
  const catalog = testCatalog();
  const choose = (levels: TagLevel[]) => chooseGenres(rankGenres(levels, catalog));

  test('die genaueste Ebene entscheidet, Untergenres bringen ihr Hauptgenre mit', () => {
    const result = choose([
      { source: 'recording', tags: tags({ 'alternative rock': 7, pop: 4, rock: 4, 'pop rock': 3, 'indie rock': 2, 'league of legends': 9 }) },
      { source: 'album', tags: tags({ 'alternative rock': 5, electronic: 2, 'pop rock': 2, rock: 2 }) },
    ]);
    assert.deepEqual(result.genres, ['Alternative Rock']);
    // Rock steckt schon in Alternative Rock und wird nicht noch einmal vorgeschlagen.
    assert.deepEqual(result.suggestions, ['Pop', 'Pop Rock', 'Indie Rock']);
  });

  test('ein klar führendes Hauptgenre wird selbst übernommen', () => {
    const result = choose([
      { source: 'album', tags: tags({ pop: 25, 'dance-pop': 11, 'pop rock': 8, 'contemporary r&b': 7, ballad: 2 }) },
    ]);
    assert.deepEqual(result.genres, ['Pop']);
    assert.deepEqual(result.suggestions, ['Dance-Pop', 'Pop Rock', 'Contemporary R&B']);

    // Ein schwächeres Untergenre verdrängt das führende Hauptgenre nicht (Man in the Mirror).
    const mirror = choose([
      { source: 'recording', tags: tags({ pop: 6, disco: 4, dance: 1 }) },
      { source: 'album', tags: tags({ pop: 25, 'dance-pop': 11 }) },
    ]);
    assert.deepEqual(mirror, { genres: ['Pop'], suggestions: ['Disco'] });
  });

  test('ein Hauptgenre neben einem seiner Untergenres entfällt', () => {
    const result = choose([{ source: 'album', tags: tags({ pop: 3, 'pop rock': 3, 'pop punk': 3, 'teen pop': 1 }) }]);
    assert.deepEqual(result.genres, ['Pop Rock']);
  });

  test('bei Gleichstand werden mehrere Genres übernommen, höchstens drei', () => {
    assert.deepEqual(choose([{ source: 'artist', tags: tags({ 'electro house': 3, house: 3 }) }]).genres, ['Electro House', 'House']);
    assert.deepEqual(
      choose([{ source: 'recording', tags: tags({ 'hip hop': 1, pop: 1, 'alternative rock': 1, house: 1, 'dance-pop': 1 }) }]).genres,
      ['Alternative Rock', 'Dance-Pop', 'House'],
    );
  });

  test('Schreibweisen desselben Genres zählen einmal, unbekannte Tags gar nicht', () => {
    const result = choose([{ source: 'recording', tags: tags({ 'hip hop': 3, rap: 2, 'seen live': 10, 'pop rock': -1 }) }]);
    assert.deepEqual(result, { genres: ['Hip-Hop'], suggestions: [] });
    assert.deepEqual(choose([{ source: 'recording', tags: tags({ 'seen live': 4 }) }]), { genres: [], suggestions: [] });
  });
});

describe('GenreLookupService', () => {
  /** Nachgebautes MusicBrainz: Antworten je Endpunkt, alle Anfragen werden mitgeschrieben. */
  function fakeMusicBrainz(handlers: Record<string, (query: string) => unknown | Response>) {
    const calls: Array<{ entity: string; query: string; userAgent: string | null }> = [];
    const fetchFn = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(String(input));
      const entity = url.pathname.replace('/ws/2/', '');
      const query = url.searchParams.get('query') ?? '';
      calls.push({ entity, query, userAgent: new Headers(init?.headers).get('user-agent') });
      const handler = handlers[entity];
      const body = handler ? handler(query) : {};
      return body instanceof Response ? body : Response.json(body);
    }) as typeof fetch;
    const service = new GenreLookupService({ fetchFn, minIntervalMs: 0, retryDelayMs: 0, backgroundDelayMs: 0 });
    return { service, calls };
  }

  const warriors = recording({
    tags: tags({ 'alternative rock': 7, pop: 4, rock: 4 }),
    releases: [
      {
        id: 'r1',
        date: '2015-02-17',
        'release-group': { id: ALBUM_ID, title: 'Smoke + Mirrors', 'primary-type': 'Album', 'secondary-types': [] },
      },
    ],
  });

  test('sucht Aufnahme und Album und liefert Genres mit Link zur Aufnahme', async () => {
    const { service, calls } = fakeMusicBrainz({
      recording: () => ({ recordings: [warriors] }),
      'release-group': () => ({ 'release-groups': [{ id: ALBUM_ID, tags: tags({ 'alternative rock': 5, rock: 2 }) }] }),
    });
    const match = await service.lookup(catalogDb(), { title: 'Warriors', artist: 'Imagine Dragons', durationSeconds: 170 });
    assert.deepEqual(match, {
      genres: ['Alternative Rock'],
      suggestions: ['Pop'],
      firstReleaseYear: 2015,
      title: 'Warriors',
      artist: 'Imagine Dragons',
      url: 'https://musicbrainz.org/recording/rec-1',
    });
    assert.deepEqual(
      calls.map((call) => [call.entity, call.query]),
      [
        ['recording', 'recording:"Warriors" AND artist:"Imagine Dragons"'],
        ['release-group', `rgid:${ALBUM_ID}`],
        ['release-group', 'releasegroup:"Warriors" AND artist:"Imagine Dragons" AND (primarytype:single OR primarytype:ep)'],
      ],
    );
    assert.match(calls[0]!.userAgent ?? '', /^MusikBibliothek\//);

    // Dieselbe Suche geht nur einmal raus.
    await service.lookup(catalogDb(), { title: 'warriors', artist: 'imagine dragons' });
    assert.equal(calls.length, 3);
  });

  test('fragt den Interpreten nur, wenn Aufnahme und Veröffentlichungen nichts sagen', async () => {
    const { service, calls } = fakeMusicBrainz({
      recording: () => ({ recordings: [recording({ title: 'Satisfaction', tags: tags({ favourite: 3 }) })] }),
      artist: () => ({ artists: [{ id: ARTIST_ID, name: 'Benny Benassi', tags: tags({ 'electro house': 3, house: 3 }) }] }),
    });
    const match = await service.lookup(catalogDb(), { title: 'Satisfaction', artist: 'Imagine Dragons' });
    assert.deepEqual(match?.genres, ['Electro House', 'House']);
    assert.deepEqual(
      calls.map((call) => call.entity),
      ['recording', 'artist', 'release-group'],
    );
  });

  test('kennt MusicBrainz den Song nicht, ist das Ergebnis null', async () => {
    const { service } = fakeMusicBrainz({
      recording: () => ({ recordings: [recording({ title: 'Ganz Anderes Lied' })] }),
    });
    assert.equal(await service.lookup(catalogDb(), { title: 'Warriors', artist: 'Imagine Dragons' }), null);
  });

  test('wiederholt Anfragen bei Überlast und meldet Ausfälle als 502', async () => {
    let busy = 2;
    const { service, calls } = fakeMusicBrainz({
      recording: () => (busy-- > 0 ? new Response('busy', { status: 503 }) : { recordings: [warriors] }),
      'release-group': () => ({ 'release-groups': [] }),
    });
    assert.deepEqual((await service.lookup(catalogDb(), { title: 'Warriors', artist: 'Imagine Dragons' }))?.genres, [
      'Alternative Rock',
    ]);
    assert.equal(calls.filter((call) => call.entity === 'recording').length, 3);

    const down = fakeMusicBrainz({ recording: () => new Response('kaputt', { status: 500 }) });
    await assert.rejects(down.service.lookup(catalogDb(), { title: 'Warriors', artist: 'Imagine Dragons' }), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 502);
      return true;
    });

    const strange = fakeMusicBrainz({ recording: () => ({ unexpected: true }) });
    await assert.rejects(strange.service.lookup(catalogDb(), { title: 'Warriors', artist: 'Imagine Dragons' }), HttpError);
  });
});

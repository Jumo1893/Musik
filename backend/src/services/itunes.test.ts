import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { HttpError } from '../errors.ts';
import { mapItunesTrack, searchItunes } from './itunes.ts';

// Gekürzter Treffer in der Form, wie ihn die iTunes Search API liefert.
const TRACK = {
  wrapperType: 'track',
  kind: 'song',
  trackName: 'Hurt',
  artistName: 'Johnny Cash',
  collectionName: 'American IV: The Man Comes Around',
  trackTimeMillis: 216_533,
  releaseDate: '2002-11-05T08:00:00Z',
  primaryGenreName: 'Country',
  trackViewUrl: 'https://music.apple.com/de/album/hurt/1440811595?i=1440811605&uo=4',
  artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/cover.jpg/100x100bb.jpg',
  previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/aa/bb/cc/mzaf_1.plus.aac.p.m4a',
};

function fakeFetch(body: unknown, status = 200): { fetchFn: typeof fetch; calls: URL[] } {
  const calls: URL[] = [];
  const fetchFn = (async (input: Parameters<typeof fetch>[0]) => {
    calls.push(new URL(String(input)));
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetchFn, calls };
}

describe('mapItunesTrack', () => {
  test('übernimmt die Metadaten eines Treffers', () => {
    assert.deepEqual(mapItunesTrack(TRACK), {
      title: 'Hurt',
      artist: 'Johnny Cash',
      album: 'American IV: The Man Comes Around',
      durationSeconds: 217,
      releaseYear: 2002,
      genre: 'Country',
      appleMusicUrl: 'https://music.apple.com/de/album/hurt/1440811595?i=1440811605',
      artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/cover.jpg/300x300bb.jpg',
      previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/aa/bb/cc/mzaf_1.plus.aac.p.m4a',
    });
  });

  test('kommt mit fehlenden Angaben zurecht', () => {
    assert.deepEqual(mapItunesTrack({ trackName: 'Hurt', artistName: 'Johnny Cash' }), {
      title: 'Hurt',
      artist: 'Johnny Cash',
      album: null,
      durationSeconds: null,
      releaseYear: null,
      genre: null,
      appleMusicUrl: null,
      artworkUrl: null,
      previewUrl: null,
    });
  });

  test('verwirft Links, die nicht https sind', () => {
    const mapped = mapItunesTrack({
      ...TRACK,
      trackViewUrl: 'javascript:alert(1)',
      artworkUrl100: 'http://x/y.jpg',
      previewUrl: 'http://audio.example/x.m4a',
    });
    assert.equal(mapped?.appleMusicUrl, null);
    assert.equal(mapped?.artworkUrl, null);
    assert.equal(mapped?.previewUrl, null);
  });

  test('verwirft Einträge ohne Titel oder Interpret', () => {
    assert.equal(mapItunesTrack({ artistName: 'Johnny Cash' }), null);
    assert.equal(mapItunesTrack({ trackName: '', artistName: 'Johnny Cash' }), null);
    assert.equal(mapItunesTrack(null), null);
    assert.equal(mapItunesTrack('Hurt'), null);
  });
});

describe('searchItunes', () => {
  test('fragt Songs im gewünschten Land ab und überspringt unbrauchbare Treffer', async () => {
    const { fetchFn, calls } = fakeFetch({ resultCount: 2, results: [TRACK, { kind: 'music-video' }] });
    const results = await searchItunes('johnny cash hurt', 'de', fetchFn);

    assert.equal(results.length, 1);
    assert.equal(results[0]!.title, 'Hurt');

    assert.equal(calls.length, 1);
    const url = calls[0]!;
    assert.equal(url.origin + url.pathname, 'https://itunes.apple.com/search');
    assert.equal(url.searchParams.get('term'), 'johnny cash hurt');
    assert.equal(url.searchParams.get('entity'), 'song');
    assert.equal(url.searchParams.get('country'), 'de');
  });

  test('meldet einen Ausfall der Suche als 502 mit verständlicher Meldung', async () => {
    const { fetchFn } = fakeFetch({ errorMessage: 'kaputt' }, 503);
    await assert.rejects(searchItunes('hurt', 'de', fetchFn), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 502);
      return true;
    });

    const failing = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await assert.rejects(searchItunes('hurt', 'de', failing), HttpError);
  });

  test('meldet eine unerwartete Antwort als 502', async () => {
    const { fetchFn } = fakeFetch({ unexpected: true });
    await assert.rejects(searchItunes('hurt', 'de', fetchFn), HttpError);
  });
});

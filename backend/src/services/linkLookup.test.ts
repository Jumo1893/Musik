import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { HttpError } from '../errors.ts';
import type { LookupResult } from '../types.ts';
import { bestCatalogMatch, LinkLookupService, parseMusicLink } from './linkLookup.ts';

const HURT = {
  trackName: 'Hurt',
  artistName: 'Johnny Cash',
  collectionName: 'American IV: The Man Comes Around',
  trackTimeMillis: 216_533,
  releaseDate: '2002-11-05T08:00:00Z',
  trackViewUrl: 'https://music.apple.com/de/album/hurt/1440811595?i=1440811605&uo=4',
};
const HURT_LIVE = { ...HURT, trackName: 'Hurt (Live)', collectionName: 'Live', trackViewUrl: 'https://music.apple.com/de/album/hurt-live/1?i=2' };
const COVER = { ...HURT, artistName: 'Karaoke Stars', trackViewUrl: 'https://music.apple.com/de/album/hurt/3?i=4' };

function result(overrides: Partial<LookupResult>): LookupResult {
  return {
    title: 'Hurt',
    artist: 'Johnny Cash',
    album: null,
    durationSeconds: null,
    releaseYear: null,
    genre: null,
    appleMusicUrl: null,
    artworkUrl: null,
    previewUrl: null,
    explicit: null,
    ...overrides,
  };
}

/** Nachgebautes iTunes und YouTube-oEmbed; die Anfragen werden mitgeschrieben. */
function fakeServices(oembed: { status: number; body?: unknown } | 'offline') {
  const calls: URL[] = [];
  const fetchFn = (async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname === '/oembed') {
      if (oembed === 'offline') throw new TypeError('fetch failed');
      return Response.json(oembed.body ?? {}, { status: oembed.status });
    }
    if (url.pathname === '/lookup') return Response.json({ results: url.searchParams.get('id') === '1440811605' ? [HURT] : [] });
    return Response.json({ results: [COVER, HURT_LIVE, HURT] });
  }) as typeof fetch;
  return { service: new LinkLookupService({ itunesCountry: 'de', fetchFn }), calls };
}

describe('parseMusicLink', () => {
  test('erkennt Songs von Apple Music samt Track-ID', () => {
    assert.deepEqual(parseMusicLink('https://music.apple.com/de/album/hurt/1440811595?i=1440811605'), {
      kind: 'appleTrack',
      trackId: '1440811605',
    });
    assert.deepEqual(parseMusicLink(' https://music.apple.com/de/song/hurt/1440811605 '), { kind: 'appleTrack', trackId: '1440811605' });
    assert.deepEqual(parseMusicLink('music.apple.com/us/song/1440811605'), { kind: 'appleTrack', trackId: '1440811605' });
    assert.equal(parseMusicLink('https://music.apple.com/de/album/american-iv/1440811595').kind, 'appleAlbum');
    assert.equal(parseMusicLink('https://music.apple.com/de/playlist/top-100/pl.u-abc').kind, 'applePlaylist');
    assert.equal(parseMusicLink('https://music.apple.com/de/artist/johnny-cash/136975').kind, 'appleArtist');
  });

  test('erkennt Videos von YouTube und YouTube Music, auch mit Playlist und Zeitangabe', () => {
    for (const link of [
      'https://www.youtube.com/watch?v=8AHCfZTRGiI&list=PL123&index=4',
      'https://youtu.be/8AHCfZTRGiI?t=42',
      'https://music.youtube.com/watch?v=8AHCfZTRGiI&si=abc',
      'https://m.youtube.com/watch?v=8AHCfZTRGiI',
    ]) {
      assert.deepEqual(parseMusicLink(link), { kind: 'youtubeVideo', videoId: '8AHCfZTRGiI' }, link);
    }
    assert.equal(parseMusicLink('https://www.youtube.com/playlist?list=PL1234567890').kind, 'youtubePlaylist');
  });

  test('alles andere ist unbekannt', () => {
    for (const link of ['https://open.spotify.com/track/abc', 'Hurt Johnny Cash', 'https://www.youtube.com/@johnnycash']) {
      assert.equal(parseMusicLink(link).kind, 'unknown', link);
    }
  });
});

describe('bestCatalogMatch', () => {
  test('nimmt nur einen Treffer mit passendem Interpreten, Titel und Fassung', () => {
    const live = result({ title: 'Hurt (Live)' });
    const studio = result({ title: 'Hurt' });
    const other = result({ artist: 'Nine Inch Nails' });
    assert.equal(bestCatalogMatch([other, live, studio], { title: 'Hurt', artist: 'Johnny Cash' }), studio);
    assert.equal(bestCatalogMatch([other, studio, live], { title: 'Hurt (Live)', artist: 'Johnny Cash' }), live);
    assert.equal(bestCatalogMatch([other], { title: 'Hurt', artist: 'Johnny Cash' }), null);
  });
});

describe('LinkLookupService', () => {
  test('holt einen Apple-Music-Song über die Track-ID und speichert den bereinigten Link', async () => {
    const { service, calls } = fakeServices({ status: 200 });
    const found = await service.lookup('https://music.apple.com/de/album/hurt/1440811595?i=1440811605&uo=4&at=xyz');
    assert.equal(found.kind, 'apple');
    assert.equal(found.kind === 'apple' && found.result.appleMusicUrl, 'https://music.apple.com/de/album/hurt/1440811595?i=1440811605');
    assert.equal(calls[0]!.searchParams.get('id'), '1440811605');
    assert.equal(calls[0]!.searchParams.get('country'), 'de');

    await assert.rejects(service.lookup('https://music.apple.com/de/song/weg/999'), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 404);
      return true;
    });
  });

  test('liest Titel und Kanal eines Videos und schlägt den passenden Katalog-Treffer vor', async () => {
    const { service, calls } = fakeServices({
      status: 200,
      body: { title: 'Johnny Cash - Hurt (Official Music Video)', author_name: 'JohnnyCashVEVO', thumbnail_url: 'https://i.ytimg.com/vi/x/hqdefault.jpg' },
    });
    const found = await service.lookup('https://music.youtube.com/watch?v=8AHCfZTRGiI&list=RDAMVM&t=12');
    assert.ok(found.kind === 'youtube');
    assert.equal(found.youtubeUrl, 'https://www.youtube.com/watch?v=8AHCfZTRGiI');
    assert.deepEqual(found.parsed, { title: 'Hurt', artist: 'Johnny Cash' });
    assert.equal(found.best?.title, 'Hurt');
    assert.deepEqual(
      found.results.map((item) => `${item.artist}: ${item.title}`),
      ['Karaoke Stars: Hurt', 'Johnny Cash: Hurt (Live)'],
    );
    assert.equal(calls[0]!.searchParams.get('url'), 'https://www.youtube.com/watch?v=8AHCfZTRGiI');
    assert.equal(calls[1]!.searchParams.get('term'), 'Johnny Cash Hurt');
  });

  test('ein gelöschtes Video oder ein nicht erreichbares YouTube liefert trotzdem den Link', async () => {
    for (const oembed of [{ status: 404 }, 'offline'] as const) {
      const { service } = fakeServices(oembed);
      const found = await service.lookup('https://youtu.be/8AHCfZTRGiI');
      assert.deepEqual(found, {
        kind: 'youtube',
        videoId: '8AHCfZTRGiI',
        youtubeUrl: 'https://www.youtube.com/watch?v=8AHCfZTRGiI',
        video: null,
        parsed: null,
        best: null,
        results: [],
      });
    }
  });

  test('Alben, Playlists und unbekannte Links ergeben eine verständliche Meldung', async () => {
    const { service, calls } = fakeServices({ status: 200 });
    const message = async (link: string) => {
      try {
        await service.lookup(link);
        return null;
      } catch (err) {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        return err.message;
      }
    };
    assert.match((await message('https://music.apple.com/de/album/american-iv/1440811595'))!, /ganzen Album/);
    assert.match((await message('https://www.youtube.com/playlist?list=PL1234567890'))!, /YouTube-Playlist/);
    assert.equal(
      await message('https://open.spotify.com/track/abc'),
      'Diesen Link kenne ich nicht. Es funktionieren Links von Apple Music, YouTube und YouTube Music.',
    );
    assert.equal(calls.length, 0, 'ohne erkannten Song wird nichts nachgeschlagen');
  });
});

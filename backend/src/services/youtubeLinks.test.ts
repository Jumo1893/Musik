import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LibraryJobs } from './libraryJobs.ts';
import { parseSongVideos, songVideoQuery } from './wikidata.ts';
import { matchingWikidataVideos, YoutubeLinkService } from './youtubeLinks.ts';

const db = { query: async () => ({ rows: [] }) } as never;

/** Antwortzeile des SPARQL-Dienstes */
function binding(item: string, video: string, performer: string) {
  return {
    item: { value: `http://www.wikidata.org/entity/${item}` },
    video: { value: video },
    performerLabel: { value: performer },
  };
}

describe('Wikidata', () => {
  test('die Abfrage sucht den Titel in mehreren Sprachen und maskiert Anführungszeichen', () => {
    const query = songVideoQuery(['Hurt', 'Hurt', 'Say "Hi" \\ now']);
    assert.match(query, /"Hurt"@en "Hurt"@de "Hurt"@mul "Say \\"Hi\\" \\\\ now"@en/);
    assert.match(query, /wdt:P1651/);
    assert.match(query, /wdt:P175/);
  });

  test('fasst Zeilen je Eintrag zusammen und verwirft ungültige Video-IDs', () => {
    const songs = parseSongVideos({
      results: {
        bindings: [
          binding('Q1142043', 'dhh21crSohs', 'Nine Inch Nails'),
          binding('Q18235107', 'vt1Pwfnh5pc', 'Johnny Cash'),
          binding('Q18235107', 'vt1Pwfnh5pc', 'Johnny Cash'),
          binding('Q18235107', 'kein-video', 'Johnny Cash'),
        ],
      },
    });
    assert.deepEqual(songs, [
      { itemId: 'Q1142043', videoIds: ['dhh21crSohs'], performers: ['Nine Inch Nails'] },
      { itemId: 'Q18235107', videoIds: ['vt1Pwfnh5pc'], performers: ['Johnny Cash'] },
    ]);
    assert.throws(() => parseSongVideos({ unexpected: true }));
  });

  test('nur Einträge mit passendem Interpreten zählen', () => {
    const songs = [
      { itemId: 'Q1', videoIds: ['dhh21crSohs'], performers: ['Nine Inch Nails'] },
      { itemId: 'Q2', videoIds: ['vt1Pwfnh5pc'], performers: ['Johnny Cash'] },
    ];
    assert.deepEqual(matchingWikidataVideos(songs, { title: 'Hurt', artist: 'Johnny Cash' }), [{ itemId: 'Q2', videoId: 'vt1Pwfnh5pc' }]);
  });
});

/** Nachgebautes Wikidata, MusicBrainz und YouTube-oEmbed. */
function fakeSources(options: {
  wikidata: Array<ReturnType<typeof binding>> | 'offline';
  musicBrainzUrls?: string[];
  /** Video-IDs, die YouTube (noch) kennt */
  validVideos: string[];
}) {
  const calls: string[] = [];
  const fetchFn = (async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input));
    if (url.hostname === 'query.wikidata.org') {
      calls.push('wikidata');
      if (options.wikidata === 'offline') return new Response('', { status: 503 });
      return Response.json({ results: { bindings: options.wikidata } });
    }
    const videoId = new URL(url.searchParams.get('url') ?? 'https://x').searchParams.get('v') ?? '';
    calls.push(`oembed:${videoId}`);
    return options.validVideos.includes(videoId)
      ? Response.json({ title: `Video ${videoId}`, author_name: 'Kanal', thumbnail_url: 'https://i.ytimg.com/vi/x/hqdefault.jpg' })
      : new Response('Not Found', { status: 404 });
  }) as typeof fetch;
  const genreLookup = {
    recordingIds: async () => {
      calls.push('musicbrainz');
      return ['rec-1', 'rec-2'];
    },
    recordingStreamingUrls: async (id: string) => (id === 'rec-2' ? (options.musicBrainzUrls ?? []) : []),
    recordingUrl: (id: string) => `https://musicbrainz.org/recording/${id}`,
  };
  return { service: new YoutubeLinkService({ genreLookup, fetchFn }), calls };
}

describe('YoutubeLinkService', () => {
  const hurt = { title: 'Hurt', artist: 'Johnny Cash', durationSeconds: 217 };

  test('nimmt das erste gültige Video von Wikidata und überspringt gelöschte', async () => {
    const { service, calls } = fakeSources({
      wikidata: [binding('Q1', 'dhh21crSohs', 'Nine Inch Nails'), binding('Q2', 'aaaaaaaaaaa', 'Johnny Cash'), binding('Q2', 'vt1Pwfnh5pc', 'Johnny Cash')],
      validVideos: ['dhh21crSohs', 'vt1Pwfnh5pc'],
    });
    const match = await service.lookup(db, hurt);
    assert.equal(match?.videoId, 'vt1Pwfnh5pc');
    assert.equal(match?.source, 'wikidata');
    assert.equal(match?.url, 'https://www.youtube.com/watch?v=vt1Pwfnh5pc');
    assert.equal(match?.sourceUrl, 'https://www.wikidata.org/wiki/Q2');
    assert.equal(match?.videoTitle, 'Video vt1Pwfnh5pc');
    assert.deepEqual(calls, ['wikidata', 'oembed:aaaaaaaaaaa', 'oembed:vt1Pwfnh5pc'], 'MusicBrainz wird nicht mehr gefragt');

    // Derselbe Song wird nicht noch einmal nachgeschlagen.
    await service.lookup(db, { ...hurt, title: 'Hurt (Remastered)' });
    assert.equal(calls.length, 3);
  });

  test('fällt Wikidata aus oder kennt nichts, hilft MusicBrainz', async () => {
    const { service, calls } = fakeSources({
      wikidata: 'offline',
      musicBrainzUrls: ['https://music.youtube.com/watch?v=vt1Pwfnh5pc', 'https://example.org/x'],
      validVideos: ['vt1Pwfnh5pc'],
    });
    const match = await service.lookup(db, hurt);
    assert.equal(match?.source, 'musicbrainz');
    assert.equal(match?.sourceUrl, 'https://musicbrainz.org/recording/rec-2');
    assert.deepEqual(calls, ['wikidata', 'musicbrainz', 'oembed:vt1Pwfnh5pc']);
  });

  test('findet keine Quelle ein gültiges Video, ist das Ergebnis null', async () => {
    const { service } = fakeSources({ wikidata: [binding('Q2', 'vt1Pwfnh5pc', 'Johnny Cash')], validVideos: [] });
    assert.equal(await service.lookup(db, hurt), null);
  });
});

describe('LibraryJobs', () => {
  test('geht die Songs durch, sammelt Funde und zählt mit', async () => {
    const jobs = new LibraryJobs();
    const job = jobs.start({
      kind: 'youtube-links',
      songIds: [1, 2, 3],
      delayMs: 0,
      maxFailures: 2,
      work: async (songId) => ({ result: songId === 2 ? null : { songId }, online: true }),
    });
    assert.equal(job.status, 'running');
    assert.equal(jobs.start({ kind: 'youtube-links', songIds: [9], delayMs: 0, maxFailures: 1, work: async () => ({ result: null, online: false }) }), job);
    await jobs.idle();
    assert.equal(job.status, 'done');
    assert.equal(job.done, 3);
    assert.deepEqual(job.results, [{ songId: 1 }, { songId: 3 }]);
    assert.equal(jobs.latest('youtube-links'), job);
    assert.ok(jobs.remove(job.id));
    assert.equal(jobs.get(job.id), undefined);
  });

  test('ein angehaltener Auftrag behält seine Funde', async () => {
    const jobs = new LibraryJobs();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const job = jobs.start({
      kind: 'youtube-links',
      songIds: [1, 2, 3],
      delayMs: 0,
      maxFailures: 2,
      work: async (songId) => {
        if (songId === 2) await gate;
        return { result: { songId }, online: true };
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.ok(jobs.remove(job.id));
    release();
    await jobs.idle();
    assert.equal(job.status, 'cancelled');
    assert.deepEqual(job.results, [{ songId: 1 }, { songId: 2 }]);
    assert.equal(jobs.get(job.id), job, 'bleibt bis zum Vergessen abrufbar');
  });

  test('bricht nach zu vielen Fehlschlägen in Folge ab und behält die Funde', async () => {
    const jobs = new LibraryJobs();
    const job = jobs.start({
      kind: 'youtube-links',
      songIds: [1, 2, 3, 4],
      delayMs: 0,
      maxFailures: 2,
      work: async (songId) => {
        if (songId > 1) throw new Error('offline');
        return { result: { songId }, online: true };
      },
    });
    await jobs.idle();
    assert.equal(job.status, 'failed');
    assert.deepEqual(job.results, [{ songId: 1 }]);
    assert.match(job.error ?? '', /nicht erreichbar/);
  });
});

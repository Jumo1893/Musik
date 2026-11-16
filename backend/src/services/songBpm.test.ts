import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { HttpError } from '../errors.ts';
import { coreTitle, parseSearchResults, pickBestMatch, searchText, SongBpmService, type BpmCandidate } from './songBpm.ts';

/** Ein Treffer im Aufbau der Ergebnisseite von songbpm.com (gekürzt). */
function card(path: string, artist: string, title: string, key: string, duration: string, bpm: string): string {
  return `
    <div class="bg-card m-0 mb-6 flex">
      <a class="hover:bg-foreground/5 flex flex-col" href="${path}">
        <div class="flex flex-1 flex-row items-center">
          <div class="mr-4 block"><figure class="size-24" style="background-image:url(&quot;https://i.scdn.co/image/x&quot;)"></figure></div>
          <div class="flex-1">
            <p class="text-sm font-light uppercase sm:text-base"> ${artist} </p>
            <p class="pr-2 text-lg sm:text-2xl sm:font-light"> ${title} </p>
          </div>
        </div>
        <div class="flex w-full flex-row">
          <div class="flex flex-1 flex-col items-center"> <span class="text-xs uppercase">Key</span> <span class="text-nowrap text-2xl">${key}</span> </div>
          <div class="flex flex-1 flex-col items-center"> <span class="text-xs uppercase">Duration</span> <span class="text-nowrap text-2xl"> ${duration} </span> </div>
          <div class="flex flex-1 flex-col items-center"> <span class="text-xs uppercase">BPM</span> <span class="text-nowrap text-2xl font-bold"> ${bpm} </span> </div>
        </div>
      </a>
      <div class="flex flex-row divide-x border-t">
        <a href="https://open.spotify.com/track/abc" rel="noreferrer" target="_blank"><span class="sr-only">Listen on</span> Spotify</a>
      </div>
    </div>`;
}

function page(...cards: string[]): string {
  return `<!DOCTYPE html><html><head><title>BPM and key</title></head><body>
    <a href="/">Start</a>
    <main><h1>BPM results for <span class="font-bold">Johnny Cash Hurt</span></h1>${cards.join('')}</main>
    </body></html>`;
}

const HURT_PAGE = page(
  card('/@johnny-cash/hurt-4bef9ff2', 'Johnny Cash', 'Hurt', 'A', '3:37', '90'),
  card('/@johnny-cash/hurt', 'Johnny Cash', 'Hurt', 'A', '3:38', '91'),
  card('/@katy-perry/the-one-that-got-away', 'Katy Perry', 'The One That Got Away', 'C♯/D♭', '3:47', '134'),
);

function candidate(artist: string, title: string, bpm: number, durationSeconds: number | null = null): BpmCandidate {
  return { artist, title, bpm, durationSeconds, key: null, path: `/@x/${bpm}` };
}

describe('parseSearchResults', () => {
  test('liest Interpret, Titel, Tonart, Dauer und Tempo aller Treffer', () => {
    assert.deepEqual(parseSearchResults(HURT_PAGE), [
      { artist: 'Johnny Cash', title: 'Hurt', key: 'A', durationSeconds: 217, bpm: 90, path: '/@johnny-cash/hurt-4bef9ff2' },
      { artist: 'Johnny Cash', title: 'Hurt', key: 'A', durationSeconds: 218, bpm: 91, path: '/@johnny-cash/hurt' },
      {
        artist: 'Katy Perry',
        title: 'The One That Got Away',
        key: 'C♯/D♭',
        durationSeconds: 227,
        bpm: 134,
        path: '/@katy-perry/the-one-that-got-away',
      },
    ]);
  });

  test('übersetzt HTML-Zeichen und überspringt unbrauchbare Einträge', () => {
    const results = parseSearchResults(
      page(
        card('/@simon-garfunkel/x', 'Simon &amp; Garfunkel', 'Mrs. Robinson &#8211; Live', 'G', '4:01', '92'),
        card('/@a/b', 'A', 'B', 'C', '3:00', '–'),
        card('/@a/c', 'A', 'C', 'C', '3:00', '9999'),
        card('/@a/d', '', 'D', 'C', '3:00', '100'),
      ),
    );
    assert.equal(results.length, 1);
    assert.equal(results[0]!.artist, 'Simon & Garfunkel');
    assert.equal(results[0]!.title, 'Mrs. Robinson – Live');
  });

  test('liefert für eine Seite ohne Treffer eine leere Liste', () => {
    assert.deepEqual(parseSearchResults('<html><body><p>Nothing found</p></body></html>'), []);
  });
});

describe('coreTitle und searchText', () => {
  test('entfernen Zusätze wie Gastinterpreten und Fassungen', () => {
    assert.equal(coreTitle('Get Lucky (feat. Pharrell Williams and Nile Rodgers)'), 'get lucky');
    assert.equal(coreTitle('Bohemian Rhapsody - Remastered 2011'), 'bohemian rhapsody');
    assert.equal(coreTitle('Señorita [Radio Edit]'), 'senorita');
    assert.equal(coreTitle('Dancing with Myself'), 'dancing with myself');
    assert.equal(coreTitle('(I Can’t Get No) Satisfaction'), 'satisfaction');
    assert.equal(coreTitle('(Untitled)'), 'untitled');
    assert.equal(
      searchText({ title: 'Get Lucky (feat. Pharrell Williams)', artist: 'Daft Punk feat. Pharrell Williams' }),
      'Daft Punk Get Lucky',
    );
    assert.equal(searchText({ title: 'Haus am See', artist: 'Peter Fox' }), 'Peter Fox Haus am See');
  });
});

describe('pickBestMatch', () => {
  test('nimmt nur Treffer, bei denen Interpret und Titel passen', () => {
    // So antwortet songbpm.com auf einen Song, den es nicht kennt.
    const unrelated = [candidate('thrubones', 'Bumblebee - Hardtekk (slowed)', 116), candidate('Zak Conner', 'Bumble Bee', 167)];
    assert.equal(pickBestMatch(unrelated, { title: 'Unbekannter Song', artist: 'Niemand' }), null);
    assert.equal(pickBestMatch([candidate('Samy Deluxe', 'Haus am Mehr', 86)], { title: 'Haus am See', artist: 'Peter Fox' }), null);
    assert.equal(pickBestMatch([candidate('Peter Fox', 'Alles neu', 134)], { title: 'Haus am See', artist: 'Peter Fox' }), null);
  });

  test('verzeiht Schreibweisen, Akzente und Zusätze', () => {
    const query = { title: 'Get Lucky (feat. Pharrell Williams & Nile Rodgers)', artist: 'Daft Punk' };
    assert.equal(pickBestMatch([candidate('Daft Punk', 'Get Lucky (Radio Edit)', 116)], query)?.bpm, 116);
    assert.equal(pickBestMatch([candidate('BEYONCÉ', 'Halo', 80)], { title: 'Halo', artist: 'Beyonce' })?.bpm, 80);
    assert.equal(pickBestMatch([candidate('Beatles', 'Help!', 95)], { title: 'Help', artist: 'The Beatles' })?.bpm, 95);
    assert.equal(
      pickBestMatch([candidate('Macklemore', "Can't Hold Us", 146)], { title: 'Can’t Hold Us', artist: 'Macklemore & Ryan Lewis' })?.bpm,
      146,
    );
  });

  test('bevorzugt genaue Treffer, dann die passende Dauer, dann die Reihenfolge der Seite', () => {
    const query = { title: 'Hurt', artist: 'Johnny Cash' };
    const hurt = parseSearchResults(HURT_PAGE);
    assert.equal(pickBestMatch(hurt, query)?.bpm, 90, 'ohne Dauer zählt die Reihenfolge');
    assert.equal(pickBestMatch(hurt, { ...query, durationSeconds: 218 })?.bpm, 91);

    const versions = [candidate('Johnny Cash', 'Hurt (Live)', 88), candidate('Johnny Cash', 'Hurt', 90)];
    assert.equal(pickBestMatch(versions, query)?.bpm, 90);
  });

  test('übergeht Fassungen mit anderem Tempo, außer genau die ist gesucht', () => {
    const versions = [candidate('Peter Fox', 'Haus am See (Slowed + Reverb)', 100), candidate('Peter Fox', 'Haus am See - Remix', 128)];
    assert.equal(pickBestMatch(versions, { title: 'Haus am See', artist: 'Peter Fox' }), null);
    assert.equal(pickBestMatch(versions, { title: 'Haus am See (Remix)', artist: 'Peter Fox' })?.bpm, 128);
  });
});

describe('SongBpmService', () => {
  function fakeSite(html: string | (() => Response)) {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchFn = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return typeof html === 'function' ? html() : new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    }) as typeof fetch;
    return { fetchFn, calls };
  }

  test('sucht über das Suchformular und liefert den passenden Treffer mit Link', async () => {
    const { fetchFn, calls } = fakeSite(HURT_PAGE);
    const service = new SongBpmService({ fetchFn });
    const match = await service.lookup({ title: 'Hurt', artist: 'Johnny Cash', durationSeconds: 216 });
    assert.deepEqual(match, {
      bpm: 90,
      key: 'A',
      title: 'Hurt',
      artist: 'Johnny Cash',
      durationSeconds: 217,
      url: 'https://songbpm.com/@johnny-cash/hurt-4bef9ff2',
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, 'https://songbpm.com/searches');
    assert.equal(calls[0]!.init?.method, 'POST');
    assert.equal(new URLSearchParams(String(calls[0]!.init?.body)).get('query'), 'Johnny Cash Hurt');
  });

  test('merkt sich Ergebnisse, aber keine Fehlschläge', async () => {
    const { fetchFn, calls } = fakeSite(HURT_PAGE);
    const service = new SongBpmService({ fetchFn });
    await service.lookup({ title: 'Hurt', artist: 'Johnny Cash' });
    await service.lookup({ title: 'hurt', artist: 'johnny cash', durationSeconds: 218 });
    assert.equal(calls.length, 1, 'dieselbe Suche geht nur einmal raus');

    let fail = true;
    const flaky = fakeSite(() => (fail ? new Response('kaputt', { status: 503 }) : new Response(HURT_PAGE)));
    const flakyService = new SongBpmService({ fetchFn: flaky.fetchFn });
    await assert.rejects(flakyService.lookup({ title: 'Hurt', artist: 'Johnny Cash' }), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 502);
      return true;
    });
    fail = false;
    assert.equal((await flakyService.lookup({ title: 'Hurt', artist: 'Johnny Cash' }))?.bpm, 90);
    assert.equal(flaky.calls.length, 2);
  });

  test('meldet nicht erreichbare Seite als 502 und unbekannte Songs als null', async () => {
    const failing = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await assert.rejects(new SongBpmService({ fetchFn: failing }).lookup({ title: 'Hurt', artist: 'Johnny Cash' }), HttpError);

    const { fetchFn } = fakeSite(HURT_PAGE);
    assert.equal(await new SongBpmService({ fetchFn }).lookup({ title: 'Firework', artist: 'Katy Perry' }), null);
  });
});

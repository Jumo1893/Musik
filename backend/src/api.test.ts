// Integrationstests der API gegen eine echte PostgreSQL. Für jeden Lauf wird eine
// eigene Wegwerf-Datenbank angelegt; die Daten der App bleiben unberührt.
// Ist keine Datenbank erreichbar, werden die Tests übersprungen. Starten lässt sie sich mit
//   podman compose -f docker-compose.yml -f docker-compose.dev.yml up -d db

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, test } from 'node:test';
import pg from 'pg';
import { createApp } from './app.ts';
import { config } from './config.ts';
import { createPool, type Pool } from './db.ts';
import { MIGRATIONS_DIR, migrate } from './migrate.ts';
import { GenreLookupService } from './services/genreLookup.ts';
import { SongBpmService } from './services/songBpm.ts';
import { YoutubeService } from './services/youtube.ts';
import { FakeGoogle } from './testing/fakeGoogle.ts';

const adminConfig = { ...config.db, database: 'postgres' };

async function reasonDatabaseIsUnavailable(): Promise<string | null> {
  const client = new pg.Client({ ...adminConfig, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.end();
    return null;
  } catch (err) {
    // Verbindungsfehler tragen oft nur einen Code (ECONNREFUSED) und keine Meldung.
    const code = (err as { code?: unknown } | null)?.code;
    const reason = (err instanceof Error && err.message) || (typeof code === 'string' ? code : String(err));
    return `PostgreSQL unter ${config.db.host}:${config.db.port} nicht erreichbar (${reason})`;
  }
}

async function runAsAdmin(sql: string): Promise<void> {
  const client = new pg.Client(adminConfig);
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

const unavailable = await reasonDatabaseIsUnavailable();
if (unavailable) console.warn(`API-Tests übersprungen: ${unavailable}`);

// Die Antworten sind bewusst lose typisiert – geprüft wird, was wirklich über die Leitung geht.
type Json = any;

describe('API', { skip: unavailable ?? false }, () => {
  const databaseName = `musik_test_${process.pid}_${Date.now()}`;
  let pool: Pool;
  let server: Server;
  let baseUrl: string;
  let seededCategories: string[];
  /** Nachgebautes Google; wird vor jedem Test neu angelegt. */
  let fake = new FakeGoogle();
  /** Nachgebautes songbpm.com: kennt zwei Songs, die gestellten Suchen werden mitgeschrieben. */
  const bpmSearches: string[] = [];
  const songBpm = new SongBpmService({
    backgroundDelayMs: 0,
    fetchFn: (async (_input: unknown, init?: RequestInit) => {
      bpmSearches.push(new URLSearchParams(String(init?.body)).get('query') ?? '');
      const card = (artist: string, title: string, bpm: number) =>
        `<a href="/@x/${bpm}"><p>${artist}</p><p>${title}</p><span>Key</span><span>A</span>` +
        `<span>Duration</span><span>3:33</span><span>BPM</span><span>${bpm}</span></a>`;
      return new Response(card('Rick Astley', 'Never Gonna Give You Up', 113) + card('Ed Sheeran', 'Shape of You', 96));
    }) as typeof fetch,
  });
  /** Nachgebautes MusicBrainz: kennt zwei Aufnahmen, die gestellten Suchen werden mitgeschrieben. */
  const genreSearches: string[] = [];
  const genreLookup = new GenreLookupService({
    minIntervalMs: 0,
    retryDelayMs: 0,
    backgroundDelayMs: 0,
    fetchFn: (async (input: unknown) => {
      const url = new URL(String(input));
      const query = url.searchParams.get('query') ?? '';
      genreSearches.push(query);
      const known = [
        {
          id: 'warriors-1',
          title: 'Warriors',
          artist: 'Imagine Dragons',
          tags: [
            { name: 'alternative rock', count: 7 },
            { name: 'pop', count: 4 },
            { name: 'league of legends', count: 9 },
          ],
        },
        {
          id: 'rick-1',
          title: 'Never Gonna Give You Up',
          artist: 'Rick Astley',
          tags: [
            { name: 'dance-pop', count: 3 },
            { name: 'pop', count: 1 },
          ],
        },
      ];
      const recordings = known
        .filter((song) => query.includes(`"${song.title}"`))
        .map((song) => ({
          id: song.id,
          score: 100,
          title: song.title,
          'artist-credit': [{ name: song.artist, artist: { id: '00000000-0000-0000-0000-000000000000', name: song.artist } }],
          releases: [],
          tags: song.tags,
        }));
      return Response.json({ recordings });
    }) as typeof fetch,
  });
  const REDIRECT_URI = 'http://localhost:8090/api/youtube/callback';

  // Kategorien, die vor jedem Test frisch angelegt werden (IDs 1 bis 3).
  const CALM = 1;
  const LOUD = 2;
  const SUMMER = 3;

  async function api(method: string, path: string, body?: unknown): Promise<{ status: number; body: Json }> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const response = await fetch(baseUrl + path, init);
    const text = await response.text();
    return { status: response.status, body: text === '' ? null : JSON.parse(text) };
  }

  async function createSong(song: Record<string, unknown>): Promise<Json> {
    const response = await api('POST', '/api/songs', song);
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return response.body;
  }

  before(async () => {
    await runAsAdmin(`CREATE DATABASE ${databaseName}`);
    pool = createPool({ ...config.db, database: databaseName });
    await migrate(pool);
    const { rows } = await pool.query<{ name: string }>('SELECT name FROM categories ORDER BY id');
    seededCategories = rows.map((row) => row.name);

    const youtube = new YoutubeService({
      pool,
      clientId: 'test-client',
      clientSecret: 'test-secret',
      redirectUri: REDIRECT_URI,
      endpoints: fake.endpoints,
      regionCode: 'DE',
      fetchFn: (input, init) => fake.fetch(input, init),
    });
    const app = createApp(pool, {
      itunesCountry: 'de',
      youtube,
      songBpm,
      genreLookup,
      allowedHosts: ['localhost', '127.0.0.1', '[::1]'],
    });
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    server?.closeAllConnections();
    await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
    await pool?.end();
    await runAsAdmin(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  });

  beforeEach(async () => {
    // Nachträge im Hintergrund dürfen nicht in den nächsten Test hineinlaufen.
    await songBpm.idle();
    await genreLookup.idle();
    bpmSearches.length = 0;
    genreSearches.length = 0;
    await pool.query(
      'TRUNCATE songs, playlists, categories, youtube_account, youtube_quota_usage RESTART IDENTITY CASCADE',
    );
    fake = new FakeGoogle();
    await pool.query(
      `INSERT INTO categories (name, color) VALUES ('ruhig', '#2a78d6'), ('laut', '#eb6834'), ('Sommer', '#eda100')`,
    );
  });

  describe('Start', () => {
    test('die Migrationen legen Startkategorien an und laufen nur einmal', async () => {
      assert.ok(seededCategories.includes('melancholisch'));
      assert.ok(seededCategories.includes('aufpushend'));
      assert.ok(seededCategories.includes('Sport'));
      assert.ok(seededCategories.includes('Einschlafen'));
      assert.equal(seededCategories.length, 20);
      assert.equal(new Set(seededCategories.map((name) => name.toLowerCase())).size, 20);
      assert.deepEqual(await migrate(pool), []);
    });

    test('ein bestehender Bestand behält beim Update seine Genres und eigenen Kategorien', async () => {
      // Stand vor den Migrationen für mehrere Genres und weitere Kategorien nachbauen.
      const name = `${databaseName}_update`;
      const oldDir = await mkdtemp(join(tmpdir(), 'musik-migrationen-'));
      await runAsAdmin(`CREATE DATABASE ${name}`);
      const oldPool = createPool({ ...config.db, database: name });
      try {
        for (const file of await readdir(MIGRATIONS_DIR)) {
          if (file < '004') await copyFile(join(MIGRATIONS_DIR, file), join(oldDir, file));
        }
        await migrate(oldPool, oldDir);
        await oldPool.query(
          `INSERT INTO songs (title, artist, genre)
           VALUES ('a', 'x', ' Pop '), ('b', 'x', '  '), ('c', 'x', NULL), ('d', 'x', 'Hip-Hop/Rap'),
                  ('e', 'x', 'indie pop'), ('f', 'x', 'New wave pop')`,
        );
        await oldPool.query(`INSERT INTO categories (name, color) VALUES ('sommer', '#123456')`);

        const applied = await migrate(oldPool);
        assert.ok(applied.includes('004_mehrere_genres.sql'));
        assert.ok(applied.includes('005_weitere_kategorien.sql'));
        assert.ok(applied.includes('006_genres.sql'));
        assert.ok(applied.includes('007_genre_kurzlisten.sql'));

        // Schreibweisen der Genre-Liste; was die Liste nicht kennt, bleibt als eigenes Genre.
        const songs = await oldPool.query('SELECT title, genres, song_main_genres(genres) AS main FROM songs ORDER BY title');
        assert.deepEqual(songs.rows, [
          { title: 'a', genres: ['Pop'], main: ['Pop'] },
          { title: 'b', genres: [], main: [] },
          { title: 'c', genres: [], main: [] },
          { title: 'd', genres: ['Hip-Hop'], main: ['Hip-Hop'] },
          { title: 'e', genres: ['Indie Pop'], main: ['Pop', 'Rock'] },
          { title: 'f', genres: ['New wave pop'], main: ['Pop'] },
        ]);
        const custom = await oldPool.query('SELECT name FROM genres WHERE NOT from_list');
        assert.deepEqual(custom.rows, [{ name: 'New wave pop' }]);
        // Die selbst angelegte Kategorie gleichen Namens bleibt unverändert und einzeln.
        const summer = await oldPool.query(`SELECT name, color FROM categories WHERE lower(name) = 'sommer'`);
        assert.deepEqual(summer.rows, [{ name: 'sommer', color: '#123456' }]);
        const count = await oldPool.query<{ count: number }>('SELECT count(*)::integer AS count FROM categories');
        assert.equal(count.rows[0]!.count, 20);
      } finally {
        await oldPool.end();
        await runAsAdmin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
        await rm(oldDir, { recursive: true, force: true });
      }
    });

    test('GET /api/health meldet Bereitschaft', async () => {
      assert.deepEqual(await api('GET', '/api/health'), { status: 200, body: { status: 'ok' } });
    });

    test('GET /api/config nennt das Land des Apple-Music-Katalogs', async () => {
      assert.deepEqual(await api('GET', '/api/config'), { status: 200, body: { appleMusicStorefront: 'de' } });
    });

    test('unbekannte Endpunkte und kaputtes JSON liefern verständliche Fehler', async () => {
      const unknown = await api('GET', '/api/gibt-es-nicht');
      assert.equal(unknown.status, 404);
      assert.equal(typeof unknown.body.error, 'string');

      const broken = await api('POST', '/api/songs', '{"title": ');
      assert.equal(broken.status, 400);
      assert.equal(typeof broken.body.error, 'string');
    });
  });

  describe('Songs', () => {
    test('legt einen Song mit allen Angaben an und liefert ihn wieder aus', async () => {
      const created = await createSong({
        title: ' Hurt ',
        artist: 'Johnny Cash',
        album: 'American IV',
        durationSeconds: 217,
        releaseYear: 2002,
        genres: ['Country', ' Folk ', 'country'],
        bpm: 90,
        energy: 2,
        singAlong: 4,
        rating: 5,
        notes: 'Gänsehaut',
        appleMusicUrl: 'https://music.apple.com/de/album/hurt/1440811595?i=1440811605',
        youtubeUrl: 'https://www.youtube.com/watch?v=8AHCfZTRGiI',
        youtubeMusicUrl: 'https://music.youtube.com/watch?v=8AHCfZTRGiI',
        artworkUrl: 'https://example.org/cover.jpg',
        categoryIds: [SUMMER, CALM],
      });

      assert.equal(created.title, 'Hurt');
      assert.deepEqual(created.genres, ['Country', 'Folk']);
      assert.deepEqual(created.mainGenres, ['Country', 'Folk']);
      assert.deepEqual(created.categoryIds, [CALM, SUMMER]);
      assert.equal(created.durationSeconds, 217);
      assert.equal(created.rating, 5);
      assert.equal(created.energy, 2);
      assert.equal(created.singAlong, 4);
      assert.ok(!Number.isNaN(Date.parse(created.createdAt)));

      const fetched = await api('GET', `/api/songs/${created.id}`);
      assert.equal(fetched.status, 200);
      assert.deepEqual(fetched.body, created);
    });

    test('ein Song braucht nur Titel und Interpret', async () => {
      const created = await createSong({ title: 'Ohne Alles', artist: 'Niemand' });
      assert.equal(created.album, null);
      assert.equal(created.durationSeconds, null);
      assert.equal(created.youtubeUrl, null);
      assert.deepEqual(created.categoryIds, []);
    });

    test('listet Songs nach Interpret und Titel sortiert', async () => {
      await createSong({ title: 'Zebra', artist: 'abba' });
      await createSong({ title: 'Waterloo', artist: 'ABBA' });
      await createSong({ title: 'Africa', artist: 'Toto' });
      const list = await api('GET', '/api/songs');
      assert.equal(list.status, 200);
      assert.deepEqual(list.body.map((song: Json) => song.title), ['Waterloo', 'Zebra', 'Africa']);
    });

    test('lehnt ungültige Eingaben mit Meldung je Feld ab', async () => {
      const response = await api('POST', '/api/songs', { title: '', artist: 'x', rating: 9 });
      assert.equal(response.status, 400);
      assert.equal(response.body.fields.title, 'Bitte einen Titel angeben.');
      assert.equal(typeof response.body.fields.rating, 'string');
      assert.match(response.body.error, /Bitte einen Titel angeben\./);
    });

    test('lehnt denselben Song ein zweites Mal ab, andere Alben sind erlaubt', async () => {
      await createSong({ title: 'Hurt', artist: 'Johnny Cash', album: 'American IV' });

      const duplicate = await api('POST', '/api/songs', { title: 'HURT', artist: 'johnny cash', album: 'american iv' });
      assert.equal(duplicate.status, 409);
      assert.match(duplicate.body.error, /gibt es schon/);

      await createSong({ title: 'Hurt', artist: 'Johnny Cash', album: 'Live' });
      await createSong({ title: 'Hurt', artist: 'Nine Inch Nails', album: 'American IV' });
    });

    test('lehnt unbekannte Kategorien ab und legt dann nichts an', async () => {
      const response = await api('POST', '/api/songs', { title: 'a', artist: 'b', categoryIds: [CALM, 999] });
      assert.equal(response.status, 400);
      assert.match(response.body.error, /Kategorien/);
      assert.deepEqual((await api('GET', '/api/songs')).body, []);
    });

    test('ändert einen Song samt Kategorien', async () => {
      const created = await createSong({ title: 'Alt', artist: 'x', rating: 2, singAlong: 3, categoryIds: [CALM, LOUD] });
      const updated = await api('PUT', `/api/songs/${created.id}`, {
        title: 'Neu',
        artist: 'x',
        energy: 4,
        categoryIds: [SUMMER],
      });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.title, 'Neu');
      assert.equal(updated.body.rating, null, 'nicht mitgeschickte Felder werden geleert');
      assert.equal(updated.body.singAlong, null);
      assert.equal(updated.body.energy, 4);
      assert.deepEqual(updated.body.categoryIds, [SUMMER]);
      assert.equal(updated.body.createdAt, created.createdAt);
      assert.ok(Date.parse(updated.body.updatedAt) >= Date.parse(created.updatedAt));
    });

    test('ein fehlgeschlagenes Ändern lässt den Song unverändert', async () => {
      const created = await createSong({ title: 'Bleibt', artist: 'x', categoryIds: [CALM] });
      const response = await api('PUT', `/api/songs/${created.id}`, { title: 'Weg', artist: 'x', categoryIds: [999] });
      assert.equal(response.status, 400);
      assert.deepEqual((await api('GET', `/api/songs/${created.id}`)).body, created);
    });

    test('löscht einen Song', async () => {
      const created = await createSong({ title: 'Weg damit', artist: 'x' });
      assert.equal((await api('DELETE', `/api/songs/${created.id}`)).status, 204);
      assert.equal((await api('GET', `/api/songs/${created.id}`)).status, 404);
      assert.equal((await api('DELETE', `/api/songs/${created.id}`)).status, 404);
    });

    test('unbekannte und unsinnige IDs ergeben 404', async () => {
      for (const id of ['999', '0', 'abc', '-1', '1.5', '99999999999']) {
        assert.equal((await api('GET', `/api/songs/${id}`)).status, 404, id);
        assert.equal((await api('PUT', `/api/songs/${id}`, { title: 'a', artist: 'b' })).status, 404, id);
      }
    });
  });

  describe('Kategorien', () => {
    test('listet Kategorien nach Namen sortiert mit Anzahl der Songs', async () => {
      await createSong({ title: 'a', artist: 'x', categoryIds: [CALM, SUMMER] });
      await createSong({ title: 'b', artist: 'x', categoryIds: [CALM] });
      const list = await api('GET', '/api/categories');
      assert.equal(list.status, 200);
      assert.deepEqual(
        list.body.map((category: Json) => [category.name, category.songCount]),
        [
          ['laut', 0],
          ['ruhig', 2],
          ['Sommer', 1],
        ],
      );
    });

    test('legt an, ändert und löscht eine Kategorie', async () => {
      const created = await api('POST', '/api/categories', { name: ' Roadtrip ', color: '#E34948' });
      assert.equal(created.status, 201);
      assert.deepEqual(created.body, {
        id: created.body.id,
        name: 'Roadtrip',
        color: '#e34948',
        description: null,
        songCount: 0,
      });

      const updated = await api('PUT', `/api/categories/${created.body.id}`, {
        name: 'Autofahrt',
        color: '#008300',
        description: 'Lange Strecken',
      });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.name, 'Autofahrt');
      assert.equal(updated.body.description, 'Lange Strecken');

      assert.equal((await api('DELETE', `/api/categories/${created.body.id}`)).status, 204);
      assert.equal((await api('DELETE', `/api/categories/${created.body.id}`)).status, 404);
      assert.equal((await api('PUT', `/api/categories/${created.body.id}`, { name: 'x' })).status, 404);
    });

    test('lehnt doppelte Namen und ungültige Farben ab', async () => {
      const duplicate = await api('POST', '/api/categories', { name: 'RUHIG' });
      assert.equal(duplicate.status, 409);
      assert.match(duplicate.body.error, /gibt es schon/);

      const renamed = await api('PUT', `/api/categories/${LOUD}`, { name: 'ruhig' });
      assert.equal(renamed.status, 409);

      const invalid = await api('POST', '/api/categories', { name: 'Bunt', color: 'rot' });
      assert.equal(invalid.status, 400);
      assert.equal(typeof invalid.body.fields.color, 'string');
    });

    test('beim Löschen einer Kategorie bleiben die Songs erhalten', async () => {
      const song = await createSong({ title: 'a', artist: 'x', categoryIds: [CALM, LOUD] });
      assert.equal((await api('DELETE', `/api/categories/${CALM}`)).status, 204);
      assert.deepEqual((await api('GET', `/api/songs/${song.id}`)).body.categoryIds, [LOUD]);
    });
  });

  describe('Playlists', () => {
    async function threeSongs(): Promise<number[]> {
      const first = await createSong({ title: 'Eins', artist: 'x', durationSeconds: 100 });
      const second = await createSong({ title: 'Zwei', artist: 'y', durationSeconds: 200 });
      const third = await createSong({ title: 'Drei', artist: 'z' });
      return [first.id, second.id, third.id];
    }

    test('speichert Songs in der übergebenen Reihenfolge', async () => {
      const [a, b, c] = await threeSongs();
      const created = await api('POST', '/api/playlists', {
        name: ' Abendrunde ',
        description: 'Zum Ausklang',
        songIds: [c, a, b],
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.name, 'Abendrunde');
      assert.deepEqual(created.body.songIds, [c, a, b]);
      assert.equal(created.body.totalDurationSeconds, 300, 'Songs ohne Dauer zählen nicht mit');
      assert.equal(created.body.criteria, null);

      const fetched = await api('GET', `/api/playlists/${created.body.id}`);
      assert.deepEqual(fetched.body, created.body);
    });

    test('sortiert um, entfernt Songs und behält dabei die Kriterien', async () => {
      const [a, b, c] = await threeSongs();
      const created = await api('POST', '/api/playlists', {
        name: 'Mix',
        songIds: [a, b, c],
        criteria: { includeCategoryIds: [CALM], targetMinutes: 30 },
      });
      assert.equal(created.body.criteria.targetMinutes, 30);
      assert.equal(created.body.criteria.order, 'shuffle');

      const updated = await api('PUT', `/api/playlists/${created.body.id}`, { name: 'Mix 2', songIds: [c, a] });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.name, 'Mix 2');
      assert.deepEqual(updated.body.songIds, [c, a]);
      assert.equal(updated.body.totalDurationSeconds, 100);
      assert.equal(updated.body.criteria.targetMinutes, 30);
    });

    test('eine leere Playlist ist erlaubt', async () => {
      const created = await api('POST', '/api/playlists', { name: 'Leer' });
      assert.equal(created.status, 201);
      assert.deepEqual(created.body.songIds, []);
      assert.equal(created.body.totalDurationSeconds, 0);
    });

    test('lehnt unbekannte Songs und fehlende Namen ab', async () => {
      const [a] = await threeSongs();
      const unknownSong = await api('POST', '/api/playlists', { name: 'x', songIds: [a, 999] });
      assert.equal(unknownSong.status, 400);
      assert.match(unknownSong.body.error, /Songs/);
      assert.deepEqual((await api('GET', '/api/playlists')).body, []);

      const noName = await api('POST', '/api/playlists', { songIds: [a] });
      assert.equal(noName.status, 400);
      assert.equal(noName.body.fields.name, 'Bitte einen Namen angeben.');
    });

    test('ein gelöschter Song verschwindet aus der Playlist, die Reihenfolge bleibt', async () => {
      const [a, b, c] = await threeSongs();
      const created = await api('POST', '/api/playlists', { name: 'Mix', songIds: [c, b, a] });
      await api('DELETE', `/api/songs/${b}`);
      const fetched = await api('GET', `/api/playlists/${created.body.id}`);
      assert.deepEqual(fetched.body.songIds, [c, a]);
    });

    test('listet zuletzt geänderte Playlists zuerst und löscht Playlists', async () => {
      const first = await api('POST', '/api/playlists', { name: 'Erste' });
      const second = await api('POST', '/api/playlists', { name: 'Zweite' });
      await api('PUT', `/api/playlists/${first.body.id}`, { name: 'Erste, geändert' });

      const list = await api('GET', '/api/playlists');
      assert.deepEqual(list.body.map((playlist: Json) => playlist.name), ['Erste, geändert', 'Zweite']);

      assert.equal((await api('DELETE', `/api/playlists/${second.body.id}`)).status, 204);
      assert.equal((await api('GET', `/api/playlists/${second.body.id}`)).status, 404);
      assert.equal((await api('DELETE', `/api/playlists/${second.body.id}`)).status, 404);
    });

    test('der Generator schlägt passende Songs vor, ohne etwas zu speichern', async () => {
      const calm = await createSong({ title: 'Ruhig', artist: 'a', categoryIds: [CALM], durationSeconds: 180 });
      const both = await createSong({ title: 'Beides', artist: 'b', categoryIds: [CALM, SUMMER], durationSeconds: 180 });
      await createSong({ title: 'Laut', artist: 'c', categoryIds: [LOUD], durationSeconds: 180 });
      await createSong({ title: 'Ruhig und laut', artist: 'd', categoryIds: [CALM, LOUD], durationSeconds: 180 });

      const generated = await api('POST', '/api/playlists/generate', {
        includeCategoryIds: [CALM],
        excludeCategoryIds: [LOUD],
        seed: 5,
      });
      assert.equal(generated.status, 200);
      assert.deepEqual([...generated.body.songIds].sort(), [calm.id, both.id].sort());
      assert.equal(generated.body.candidateCount, 2);
      assert.equal(generated.body.seed, 5);
      assert.deepEqual((await api('GET', '/api/playlists')).body, []);

      const limited = await api('POST', '/api/playlists/generate', { targetMinutes: 6 });
      assert.equal(limited.body.songIds.length, 2);
      assert.equal(limited.body.candidateCount, 4);

      const invalid = await api('POST', '/api/playlists/generate', { order: 'rückwärts' });
      assert.equal(invalid.status, 400);
    });
  });

  describe('Auswertung', () => {
    test('eine leere Bibliothek ergibt Nullen statt Fehler', async () => {
      const { status, body } = await api('GET', '/api/stats');
      assert.equal(status, 200);
      assert.deepEqual(body.totals, {
        songCount: 0,
        artistCount: 0,
        categoryCount: 3,
        playlistCount: 0,
        totalDurationSeconds: 0,
        averageDurationSeconds: null,
        averageRating: null,
        withoutCategory: 0,
        withoutDuration: 0,
        withoutRating: 0,
        withoutEnergy: 0,
        withoutSingAlong: 0,
        withoutLinks: 0,
      });
      assert.deepEqual(body.topArtists, []);
      assert.deepEqual(body.bySingAlong, []);
      assert.deepEqual(body.byDecade, []);
      assert.equal(body.byCategory.length, 3);
    });

    test('zählt die Bibliothek nach allen Dimensionen aus', async () => {
      await createSong({
        title: 'a',
        artist: 'ABBA',
        durationSeconds: 100,
        releaseYear: 1979,
        genres: ['Pop'],
        rating: 5,
        energy: 4,
        singAlong: 5,
        bpm: 120,
        categoryIds: [CALM, SUMMER],
        youtubeUrl: 'https://youtu.be/8AHCfZTRGiI',
      });
      await createSong({
        title: 'b',
        artist: 'abba',
        durationSeconds: 200,
        releaseYear: 1981,
        genres: ['pop', 'Dance'],
        rating: 4,
        energy: 2,
        singAlong: 2,
        bpm: 100,
        categoryIds: [CALM, SUMMER],
      });
      await createSong({
        title: 'c',
        artist: 'Toto',
        durationSeconds: 450,
        releaseYear: 1982,
        genres: ['Rock'],
        singAlong: 5,
        categoryIds: [CALM],
      });
      await createSong({ title: 'd', artist: 'Unbekannt' });
      await api('POST', '/api/playlists', { name: 'Mix' });

      const { body } = await api('GET', '/api/stats');

      assert.deepEqual(body.totals, {
        songCount: 4,
        artistCount: 3,
        categoryCount: 3,
        playlistCount: 1,
        totalDurationSeconds: 750,
        averageDurationSeconds: 250,
        averageRating: 4.5,
        withoutCategory: 1,
        withoutDuration: 1,
        withoutRating: 2,
        withoutEnergy: 2,
        withoutSingAlong: 1,
        withoutLinks: 3,
      });

      assert.deepEqual(
        body.byCategory.map((row: Json) => [row.name, row.songCount, row.totalDurationSeconds]),
        [
          ['ruhig', 3, 750],
          ['Sommer', 2, 300],
          ['laut', 0, 0],
        ],
      );
      const summer = body.byCategory.find((row: Json) => row.name === 'Sommer');
      assert.equal(summer.averageRating, 4.5);
      assert.equal(summer.averageEnergy, 3);
      assert.equal(summer.averageSingAlong, 3.5);
      assert.equal(summer.averageBpm, 110);
      const loud = body.byCategory.find((row: Json) => row.name === 'laut');
      assert.equal(loud.averageRating, null);
      assert.equal(loud.averageSingAlong, null);
      const calm = body.byCategory.find((row: Json) => row.name === 'ruhig');
      assert.equal(calm.averageSingAlong, 4);

      assert.deepEqual(body.topArtists, [
        { artist: 'ABBA', songCount: 2, totalDurationSeconds: 300 },
        { artist: 'Toto', songCount: 1, totalDurationSeconds: 450 },
        { artist: 'Unbekannt', songCount: 1, totalDurationSeconds: 0 },
      ]);
      // „Dance“ heißt in der Genre-Liste EDM und gehört zu Electronic.
      assert.deepEqual(body.byMainGenre, [
        { genre: 'Pop', songCount: 2 },
        { genre: 'Electronic', songCount: 1 },
        { genre: 'Rock', songCount: 1 },
        { genre: null, songCount: 1 },
      ]);
      assert.deepEqual(body.bySubgenre, [
        { genre: null, songCount: 3 },
        { genre: 'EDM', songCount: 1 },
      ]);
      assert.deepEqual(body.byDecade, [
        { decade: 1970, songCount: 1 },
        { decade: 1980, songCount: 2 },
      ]);
      assert.deepEqual(body.byRating, [
        { rating: 4, songCount: 1 },
        { rating: 5, songCount: 1 },
        { rating: null, songCount: 2 },
      ]);
      assert.deepEqual(body.byEnergy, [
        { energy: 2, songCount: 1 },
        { energy: 4, songCount: 1 },
        { energy: null, songCount: 2 },
      ]);
      assert.deepEqual(body.bySingAlong, [
        { singAlong: 2, songCount: 1 },
        { singAlong: 5, songCount: 2 },
        { singAlong: null, songCount: 1 },
      ]);
      assert.deepEqual(body.byDurationMinute, [
        { minute: 1, songCount: 1 },
        { minute: 3, songCount: 1 },
        { minute: 7, songCount: 1 },
      ]);
      assert.deepEqual(body.categoryPairs, [{ firstId: CALM, secondId: SUMMER, songCount: 2 }]);
    });
  });

  describe('Genres', () => {
    test('die Genre-Liste nennt Hauptgenres und ihre Untergenres', async () => {
      const { status, body } = await api('GET', '/api/genres');
      assert.equal(status, 200);
      const byName = new Map<string, Json>(body.map((genre: Json) => [genre.name, genre]));
      const mainNames = body.filter((genre: Json) => genre.isMain).map((genre: Json) => genre.name);
      assert.deepEqual(mainNames.slice(0, 4), ['Pop', 'Rock', 'Hip-Hop', 'Electronic']);
      assert.equal(mainNames.length, 17);
      assert.equal(body.findIndex((genre: Json) => !genre.isMain), 17, 'Hauptgenres stehen vorn');
      assert.deepEqual(byName.get('Alternative Rock'), {
        name: 'Alternative Rock',
        isMain: false,
        mainGenres: ['Rock'],
        featuredIn: ['Rock'],
        custom: false,
        aliases: ['alternative', 'alternative & punk', 'alternative/indie'],
      });
      assert.deepEqual(byName.get('Pop Rock').mainGenres, ['Pop', 'Rock']);
      // Schreibweisen, die sich nur in Leer- und Satzzeichen unterscheiden (hip hop), braucht es nicht.
      assert.ok(byName.get('Hip-Hop').aliases.includes('rap'));
      assert.ok(body.length > 1000);
    });

    test('jedes Hauptgenre hat eine kurze Liste bekannter Untergenres', async () => {
      const { body } = await api('GET', '/api/genres');
      const byName = new Map<string, Json>(body.map((genre: Json) => [genre.name, genre]));
      // Die kurze Liste gilt je Hauptgenre: Emo Rap gehört auch zu Electronic und Rock, steht aber nur bei Hip-Hop vorn.
      assert.deepEqual(byName.get('Synth-Pop').featuredIn, ['Pop', 'Electronic']);
      assert.deepEqual(byName.get('Emo Rap').mainGenres, ['Rock', 'Hip-Hop', 'Electronic']);
      assert.deepEqual(byName.get('Emo Rap').featuredIn, ['Hip-Hop']);
      assert.deepEqual(byName.get('Zeuhl').featuredIn, []);
      assert.deepEqual(byName.get('Rock').featuredIn, []);

      for (const main of body.filter((genre: Json) => genre.isMain)) {
        const featured = body.filter((genre: Json) => genre.featuredIn.includes(main.name));
        assert.ok(featured.length >= 5 && featured.length <= 25, `${main.name}: ${featured.length} Untergenres in der kurzen Liste`);
        for (const genre of featured) assert.ok(genre.mainGenres.includes(main.name), `${genre.name} gehört zu ${main.name}`);
      }
    });

    test('Genres werden beim Speichern vereinheitlicht, unbekannte als eigene Genres angelegt', async () => {
      const song = await createSong({
        title: 'Mix',
        artist: 'X',
        genres: ['hip hop', 'ALTERNATIVE ROCK', 'Indie-Schrammel-Pop', 'Hip-Hop/Rap'],
      });
      assert.deepEqual(song.genres, ['Hip-Hop', 'Alternative Rock', 'Indie-Schrammel-Pop']);
      assert.deepEqual(song.mainGenres, ['Pop', 'Rock', 'Hip-Hop']);

      const listed = (await api('GET', '/api/genres')).body.find((genre: Json) => genre.name === 'Indie-Schrammel-Pop');
      assert.deepEqual(listed, {
        name: 'Indie-Schrammel-Pop',
        isMain: false,
        mainGenres: ['Pop'],
        featuredIn: [],
        custom: true,
        aliases: [],
      });

      // Eine andere Schreibweise desselben eigenen Genres führt zum vorhandenen Eintrag.
      const second = await createSong({ title: 'Mix 2', artist: 'X', genres: ['indie schrammel pop'] });
      assert.deepEqual(second.genres, ['Indie-Schrammel-Pop']);

      // Nutzt kein Song das eigene Genre mehr, verschwindet es aus der Auswahl.
      await api('DELETE', `/api/songs/${song.id}`);
      await api('DELETE', `/api/songs/${second.id}`);
      const after = (await api('GET', '/api/genres')).body.map((genre: Json) => genre.name);
      assert.ok(!after.includes('Indie-Schrammel-Pop'));
    });

    test('ein Hauptgenre im Generator umfasst seine Untergenres', async () => {
      const alternative = await createSong({ title: 'a', artist: 'A', genres: ['Alternative Rock'] });
      const pop = await createSong({ title: 'b', artist: 'B', genres: ['Pop'] });
      const punk = await createSong({ title: 'c', artist: 'C', genres: ['Punk Rock'] });

      const rock = await api('POST', '/api/playlists/generate', { genres: ['Rock'], seed: 1 });
      assert.equal(rock.status, 200);
      assert.deepEqual(new Set(rock.body.songIds), new Set([alternative.id, punk.id]));
      const onlyPunk = await api('POST', '/api/playlists/generate', { genres: ['Punk Rock'], seed: 1 });
      assert.deepEqual(onlyPunk.body.songIds, [punk.id]);
      const popOnly = await api('POST', '/api/playlists/generate', { genres: ['Pop'], seed: 1 });
      assert.deepEqual(popOnly.body.songIds, [pop.id]);
    });

    test('findet die Genres eines Songs auf MusicBrainz', async () => {
      const found = await api('GET', '/api/lookup/genres?title=Warriors&artist=Imagine+Dragons&duration=170');
      assert.equal(found.status, 200);
      assert.deepEqual(found.body.match, {
        genres: ['Alternative Rock'],
        suggestions: ['Pop'],
        title: 'Warriors',
        artist: 'Imagine Dragons',
        url: 'https://musicbrainz.org/recording/warriors-1',
      });

      const unknown = await api('GET', '/api/lookup/genres?title=Hurt&artist=Johnny+Cash');
      assert.deepEqual(unknown, { status: 200, body: { match: null } });
      assert.deepEqual(genreSearches, [
        'recording:"Warriors" AND artist:"Imagine Dragons"',
        'recording:"Hurt" AND artist:"Johnny Cash"',
      ]);
      assert.equal((await api('GET', '/api/lookup/genres?artist=Johnny+Cash')).status, 400);
    });

    test('ein von Hand angelegter Song bekommt keine Genres untergeschoben', async () => {
      const song = await createSong({ title: 'Warriors', artist: 'Imagine Dragons' });
      await genreLookup.idle();
      assert.deepEqual((await api('GET', `/api/songs/${song.id}`)).body.genres, []);
      assert.deepEqual(genreSearches, []);
    });
  });

  describe('Online-Suche', () => {
    test('verlangt einen Suchbegriff', async () => {
      const response = await api('GET', '/api/lookup/itunes');
      assert.equal(response.status, 400);
      assert.equal(response.body.fields.term, 'Bitte einen Suchbegriff angeben.');
      assert.equal((await api('GET', '/api/lookup/itunes?term=a')).status, 400);
    });

    test('findet das Tempo eines Songs auf songbpm.com', async () => {
      const found = await api('GET', `/api/lookup/bpm?title=${encodeURIComponent('Shape of You')}&artist=Ed+Sheeran&duration=233`);
      assert.equal(found.status, 200);
      assert.equal(found.body.match.bpm, 96);
      assert.equal(found.body.match.url, 'https://songbpm.com/@x/96');

      const unknown = await api('GET', '/api/lookup/bpm?title=Hurt&artist=Johnny+Cash');
      assert.deepEqual(unknown, { status: 200, body: { match: null } });
      assert.deepEqual(bpmSearches, ['Ed Sheeran Shape of You', 'Johnny Cash Hurt']);
    });

    test('verlangt für die Tempo-Suche Titel und Interpret', async () => {
      const response = await api('GET', '/api/lookup/bpm?title=Hurt');
      assert.equal(response.status, 400);
      assert.equal(response.body.fields.artist, 'Bitte einen Interpreten angeben.');
      assert.equal((await api('GET', '/api/lookup/bpm?title=Hurt&artist=Johnny+Cash&duration=0')).status, 400);
      assert.deepEqual(bpmSearches, []);
    });

    test('ein von Hand angelegter Song bekommt kein Tempo untergeschoben', async () => {
      const song = await createSong({ title: 'Shape of You', artist: 'Ed Sheeran', bpm: null });
      await songBpm.idle();
      assert.equal((await api('GET', `/api/songs/${song.id}`)).body.bpm, null);
      assert.deepEqual(bpmSearches, []);
    });
  });

  describe('YouTube', () => {
    /** Ruft die API auf, ohne Weiterleitungen zu folgen, und liefert deren Ziel. */
    async function redirectTarget(path: string): Promise<string> {
      const response = await fetch(baseUrl + path, { redirect: 'manual' });
      assert.equal(response.status, 302, `${path} sollte weiterleiten`);
      return response.headers.get('location') ?? '';
    }

    async function startLogin(): Promise<string> {
      return new URL(await redirectTarget('/api/youtube/connect')).searchParams.get('state') ?? '';
    }

    /** Vollständiger Ablauf: App → Google → zurück zur App. */
    async function connect(): Promise<void> {
      const state = await startLogin();
      const target = await redirectTarget(`/api/youtube/callback?code=${fake.issueCode()}&state=${state}`);
      assert.equal(target, '/youtube?verbunden=1');
    }

    async function waitForJob(id: string): Promise<Json> {
      for (let attempt = 0; attempt < 200; attempt++) {
        const job = await api('GET', `/api/youtube/jobs/${id}`);
        assert.equal(job.status, 200);
        if (job.body.status !== 'running') return job.body;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.fail('Die Übertragung wurde nicht fertig.');
    }

    test('ohne Verbindung meldet der Status, was zu tun ist', async () => {
      const { status, body } = await api('GET', '/api/youtube/status');
      assert.equal(status, 200);
      assert.equal(body.configured, true);
      assert.equal(body.connected, false);
      assert.equal(body.redirectUri, REDIRECT_URI);
      assert.deepEqual(
        [body.quota.unitsUsed, body.quota.unitsLimit, body.quota.searchesUsed, body.quota.searchesLimit],
        [0, 10_000, 0, 100],
      );
      assert.ok(Date.parse(body.quota.resetsAt) > Date.now());

      const playlists = await api('GET', '/api/youtube/playlists');
      assert.equal(playlists.status, 409);
      assert.equal(playlists.body.code, 'youtube_not_connected');

      const playlist = (await api('POST', '/api/playlists', { name: 'x' })).body;
      const exported = await api('POST', `/api/playlists/${playlist.id}/youtube`, {});
      assert.equal(exported.status, 409);
      assert.equal(exported.body.code, 'youtube_not_connected');
    });

    test('ohne Zugangsdaten ist die Anbindung nicht eingerichtet', async () => {
      const unconfigured = new YoutubeService({
        pool,
        clientId: null,
        clientSecret: null,
        redirectUri: REDIRECT_URI,
        endpoints: fake.endpoints,
        regionCode: 'DE',
      });
      assert.equal((await unconfigured.status()).configured, false);
      assert.throws(() => unconfigured.createAuthorizationUrl(), /noch nicht eingerichtet/);
    });

    test('die Anmeldung schickt zu Google und verbindet nach dem Rücksprung', async () => {
      const authUrl = new URL(await redirectTarget('/api/youtube/connect'));
      assert.equal(authUrl.origin + authUrl.pathname, fake.endpoints.authUrl);
      assert.equal(authUrl.searchParams.get('client_id'), 'test-client');
      assert.equal(authUrl.searchParams.get('redirect_uri'), REDIRECT_URI);
      assert.equal(authUrl.searchParams.get('response_type'), 'code');
      assert.equal(authUrl.searchParams.get('scope'), 'https://www.googleapis.com/auth/youtube');
      assert.equal(authUrl.searchParams.get('access_type'), 'offline');
      assert.match(authUrl.searchParams.get('prompt') ?? '', /consent/);
      const state = authUrl.searchParams.get('state') ?? '';
      assert.ok(state.length >= 32);

      const callback = `/api/youtube/callback?code=${fake.issueCode()}&state=${state}`;
      assert.equal(await redirectTarget(callback), '/youtube?verbunden=1');
      // Jeder state gilt nur einmal.
      assert.equal(await redirectTarget(callback), '/youtube?fehler=sitzung');

      const { body } = await api('GET', '/api/youtube/status');
      assert.equal(body.connected, true);
      assert.equal(body.expired, false);
      assert.deepEqual(body.channel, {
        id: 'UCfakechannel',
        title: 'Mein Testkanal',
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
      });
      assert.equal(fake.refreshTokens.size, 1, 'ein Refresh-Token wurde ausgestellt');
    });

    test('abgebrochene, fremde und unvollständige Anmeldungen verbinden nicht', async () => {
      assert.equal(await redirectTarget('/api/youtube/callback?code=x&state=ausgedacht'), '/youtube?fehler=sitzung');
      assert.equal(
        await redirectTarget(`/api/youtube/callback?error=access_denied&state=${await startLogin()}`),
        '/youtube?fehler=abgebrochen',
      );
      assert.equal(
        await redirectTarget(`/api/youtube/callback?code=ungueltig&state=${await startLogin()}`),
        '/youtube?fehler=anmeldung',
      );
      fake.grantedScope = 'openid';
      assert.equal(
        await redirectTarget(`/api/youtube/callback?code=${fake.issueCode()}&state=${await startLogin()}`),
        '/youtube?fehler=berechtigung',
      );
      assert.equal((await api('GET', '/api/youtube/status')).body.connected, false);
    });

    test('abgelaufene Tokens werden erneuert, ein widerrufener Zugang verlangt neues Verbinden', async () => {
      await connect();
      fake.expireAccessTokens();
      assert.equal((await api('GET', '/api/youtube/playlists')).status, 200);
      assert.ok(fake.calls.some((call) => call.grantType === 'refresh_token'));

      fake.revokeAll();
      const failed = await api('GET', '/api/youtube/playlists');
      assert.equal(failed.status, 401);
      assert.equal(failed.body.code, 'youtube_reconnect');
      assert.equal((await api('GET', '/api/youtube/status')).body.expired, true);

      await connect();
      assert.equal((await api('GET', '/api/youtube/status')).body.expired, false);
      assert.equal((await api('GET', '/api/youtube/playlists')).status, 200);
    });

    test('die Suche bewertet Treffer und zählt das Kontingent mit', async () => {
      await connect();
      const query = new URLSearchParams({
        q: 'Ed Sheeran Shape of You',
        title: 'Shape of You',
        artist: 'Ed Sheeran',
        duration: '263',
      });
      const { status, body } = await api('GET', `/api/youtube/search?${query}`);
      assert.equal(status, 200);
      assert.equal(body[0].videoId, 'JGwWNGJdvx8');
      assert.equal(body[0].recommended, true);
      assert.equal(body[0].title, 'Ed Sheeran - Shape of You (Official Music Video)');
      assert.equal(body[0].durationSeconds, 264);
      assert.ok(body.findIndex((video: Json) => video.videoId === 'shapeCover1') > 0);

      const quota = (await api('GET', '/api/youtube/status')).body.quota;
      assert.equal(quota.searchesUsed, 1);
      assert.equal(quota.unitsUsed, 2, 'Kanal beim Verbinden und Dauer der Treffer');
      assert.equal((await api('GET', '/api/youtube/search?q=a')).status, 400);
      // Sehr lange Songtitel werden für die Suche gekürzt statt abgelehnt.
      const long = await api('GET', `/api/youtube/search?q=${encodeURIComponent('Adele Hello '.repeat(40))}`);
      assert.equal(long.status, 200);
    });

    test('ein aufgebrauchtes Kontingent wird verständlich gemeldet', async () => {
      await connect();
      fake.failNext.push({ status: 403, reason: 'quotaExceeded' });
      const search = await api('GET', '/api/youtube/search?q=Hello%20Adele');
      assert.equal(search.status, 429);
      assert.equal(search.body.code, 'youtube_quota');
      assert.match(search.body.error, /100 YouTube-Suchen/);

      fake.failNext.push({ status: 403, reason: 'quotaExceeded' });
      const playlists = await api('GET', '/api/youtube/playlists');
      assert.equal(playlists.status, 429);
      assert.match(playlists.body.error, /Tageskontingent/);
    });

    test('ohne YouTube-Kanal gibt es einen Hinweis', async () => {
      fake.hasChannel = false;
      await connect();
      assert.equal((await api('GET', '/api/youtube/status')).body.channel, null);
      const playlists = await api('GET', '/api/youtube/playlists');
      assert.equal(playlists.status, 409);
      assert.equal(playlists.body.code, 'youtube_no_channel');
      assert.equal((await api('GET', '/api/youtube/status')).body.expired, false);
    });

    test('listet die eigenen Playlists, auch über mehrere Seiten', async () => {
      fake = new FakeGoogle({ pageSize: 1 });
      await connect();
      const { body } = await api('GET', '/api/youtube/playlists');
      assert.deepEqual(
        body.map((playlist: Json) => [playlist.id, playlist.title, playlist.itemCount, playlist.privacyStatus]),
        [
          ['PLfakeFavorites', 'Lieblingssongs', 6, 'private'],
          ['PLfakeWorkout', 'Workout', 6, 'public'],
        ],
      );
      assert.equal(body[0].url, 'https://www.youtube.com/playlist?list=PLfakeFavorites');
      assert.equal(body[0].musicUrl, 'https://music.youtube.com/playlist?list=PLfakeFavorites');
    });

    test('die Vorschau erkennt Songs der Bibliothek, Dubletten und nicht verfügbare Videos', async () => {
      fake = new FakeGoogle({ pageSize: 4 });
      await connect();
      const hello = await createSong({ title: 'Hello', artist: 'Adele', durationSeconds: 295 });
      const { status, body } = await api('GET', '/api/youtube/playlists/PLfakeFavorites');
      assert.equal(status, 200);
      assert.equal(body.playlist.title, 'Lieblingssongs');
      assert.deepEqual(
        body.items.map((item: Json) => [
          item.videoId,
          item.available,
          item.artist,
          item.title,
          item.match?.songId ?? null,
          item.duplicateOf,
        ]),
        [
          ['dQw4w9WgXcQ', true, 'Rick Astley', 'Never Gonna Give You Up', null, null],
          ['YQHsXMglC9A', true, 'Adele', 'Hello', hello.id, null],
          ['deletedVid1', false, 'Unbekannt', 'Deleted video', null, null],
          ['JGwWNGJdvx8', true, 'Ed Sheeran', 'Shape of You', null, null],
          ['adeleHello1', true, 'Adele', 'Hello', hello.id, null],
          ['dQw4w9WgXcQ', true, 'Rick Astley', 'Never Gonna Give You Up', null, 0],
        ],
      );
      assert.equal(body.items[1].match.reason, 'title');
      assert.equal(body.items[0].durationSeconds, 213);
      assert.equal(body.items[0].isMusic, true);

      const liked = await api('GET', '/api/youtube/playlists/mag-ich');
      assert.equal(liked.status, 200);
      assert.deepEqual(
        liked.body.items.map((item: Json) => [item.videoId, item.isMusic]),
        [
          ['dQw4w9WgXcQ', true],
          ['catVideo123', false],
          ['RgKAFK5djSk', true],
        ],
      );
      assert.equal((await api('GET', '/api/youtube/playlists/PLgibtsnicht')).status, 404);
      assert.equal((await api('GET', '/api/youtube/playlists/..%2F..')).status, 404);
    });

    test('übernimmt Videos als Songs, verknüpft vorhandene und legt eine Playlist an', async () => {
      const hello = await createSong({ title: 'Hello', artist: 'Adele', album: '25' });
      const seeYou = await createSong({
        title: 'See You Again',
        artist: 'Wiz Khalifa',
        youtubeUrl: 'https://www.youtube.com/watch?v=RgKAFK5djSk',
      });
      const result = await api('POST', '/api/youtube/import', {
        playlist: { name: 'Lieblingssongs', description: 'Von YouTube' },
        categoryIds: [CALM],
        items: [
          {
            action: 'create',
            videoId: 'dQw4w9WgXcQ',
            title: 'Never Gonna Give You Up',
            artist: 'Rick Astley',
            durationSeconds: 213,
            thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
          },
          { action: 'link', videoId: 'YQHsXMglC9A', songId: hello.id },
          { action: 'create', videoId: 'JGwWNGJdvx8', title: 'Shape of You', artist: 'Ed Sheeran', durationSeconds: 264 },
          // Derselbe Song noch einmal: wird weder doppelt angelegt noch doppelt gezählt.
          { action: 'create', videoId: 'adeleHello1', title: 'never gonna give you up', artist: 'rick astley' },
          { action: 'link', videoId: 'adeleHello1', songId: hello.id },
          // Schon verlinkt: bleibt, wie er ist.
          { action: 'link', videoId: 'RgKAFK5djSk', songId: seeYou.id },
        ],
      });
      assert.equal(result.status, 201, JSON.stringify(result.body));
      assert.deepEqual(
        { ...result.body, playlistId: typeof result.body.playlistId },
        { createdSongs: 2, linkedSongs: 1, existingSongs: 1, playlistId: 'number' },
      );

      const playlist = (await api('GET', `/api/playlists/${result.body.playlistId}`)).body;
      assert.equal(playlist.name, 'Lieblingssongs');
      assert.equal(playlist.youtubePlaylistId, null, 'übernommene Playlists werden nicht zurückübertragen');
      const songs: Json[] = (await api('GET', '/api/songs')).body;
      const byTitle = new Map<string, Json>(songs.map((song) => [song.title, song]));
      assert.equal(byTitle.size, 4);
      assert.deepEqual(playlist.songIds, [
        byTitle.get('Never Gonna Give You Up').id,
        hello.id,
        byTitle.get('Shape of You').id,
        seeYou.id,
      ]);
      assert.equal(byTitle.get('Hello').youtubeUrl, 'https://www.youtube.com/watch?v=YQHsXMglC9A');
      assert.equal(byTitle.get('Shape of You').youtubeUrl, 'https://www.youtube.com/watch?v=JGwWNGJdvx8');
      assert.deepEqual(byTitle.get('Shape of You').categoryIds, [CALM]);
      assert.deepEqual(byTitle.get('Hello').categoryIds, [], 'vorhandene Songs behalten ihre Kategorien');
      assert.equal(byTitle.get('Never Gonna Give You Up').artworkUrl, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
      assert.equal(byTitle.get('Never Gonna Give You Up').durationSeconds, 213);

      // Das Tempo der neu angelegten Songs wird im Hintergrund nachgetragen, vorhandene bleiben unberührt.
      await songBpm.idle();
      const afterwards = new Map<string, Json>(
        ((await api('GET', '/api/songs')).body as Json[]).map((song) => [song.title, song.bpm]),
      );
      assert.equal(afterwards.get('Never Gonna Give You Up'), 113);
      assert.equal(afterwards.get('Shape of You'), 96);
      assert.equal(afterwards.get('Hello'), null);
      // Gesucht wird nur für neue Songs (eine frühere Suche kann schon im Zwischenspeicher liegen).
      assert.ok(!bpmSearches.some((search) => search.includes('Hello')), JSON.stringify(bpmSearches));

      // Genres ebenso: Rick Astley kennt der MusicBrainz-Nachbau, Ed Sheeran nicht.
      await genreLookup.idle();
      const genres = new Map<string, Json>(((await api('GET', '/api/songs')).body as Json[]).map((song) => [song.title, song.genres]));
      assert.deepEqual(genres.get('Never Gonna Give You Up'), ['Dance-Pop']);
      assert.deepEqual(genres.get('Shape of You'), []);
      assert.ok(!genreSearches.some((search) => search.includes('Hello')), JSON.stringify(genreSearches));
    });

    test('Importe ohne Playlist und ungültige Importe', async () => {
      const onlySongs = await api('POST', '/api/youtube/import', {
        items: [{ action: 'create', videoId: 'dQw4w9WgXcQ', title: 'X', artist: 'Y' }],
      });
      assert.equal(onlySongs.status, 201);
      assert.equal(onlySongs.body.playlistId, null);

      for (const body of [
        { items: [] },
        { items: [{ action: 'create', videoId: 'kaputt', title: 'A', artist: 'B' }] },
        { items: [{ action: 'create', videoId: 'dQw4w9WgXcQ', title: '', artist: 'B' }] },
        { items: [{ action: 'link', videoId: 'dQw4w9WgXcQ', songId: 999 }] },
        { items: [{ action: 'create', videoId: 'dQw4w9WgXcQ', title: 'A', artist: 'B' }], categoryIds: [999] },
      ]) {
        assert.equal((await api('POST', '/api/youtube/import', body)).status, 400, JSON.stringify(body));
      }
      assert.equal((await api('GET', '/api/songs')).body.length, 1, 'fehlgeschlagene Importe ändern nichts');
    });

    test('gefundene Videos werden als YouTube-Link gespeichert', async () => {
      const song = await createSong({ title: 'Hello', artist: 'Adele' });
      const result = await api('POST', '/api/youtube/links', {
        links: [
          { songId: song.id, videoId: 'YQHsXMglC9A' },
          { songId: 999, videoId: 'dQw4w9WgXcQ' },
        ],
      });
      assert.deepEqual(result, { status: 200, body: { updated: 1 } });
      const saved = (await api('GET', `/api/songs/${song.id}`)).body;
      assert.equal(saved.youtubeUrl, 'https://www.youtube.com/watch?v=YQHsXMglC9A');
      const invalid = await api('POST', '/api/youtube/links', { links: [{ songId: song.id, videoId: 'zu-kurz' }] });
      assert.equal(invalid.status, 400);
    });

    test('überträgt eine Playlist und gleicht sie später ab', async () => {
      await connect();
      const rick = await createSong({
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });
      const hello = await createSong({
        title: 'Hello',
        artist: 'Adele',
        youtubeMusicUrl: 'https://music.youtube.com/watch?v=YQHsXMglC9A',
      });
      const silent = await createSong({ title: 'Ohne Video', artist: 'Niemand' });
      const shape = await createSong({
        title: 'Shape of You',
        artist: 'Ed Sheeran',
        youtubeUrl: 'https://www.youtube.com/watch?v=JGwWNGJdvx8',
      });
      const playlist = (
        await api('POST', '/api/playlists', {
          name: 'Abendrunde',
          description: 'Zum Ausklang',
          songIds: [rick.id, silent.id, hello.id],
        })
      ).body;

      const started = await api('POST', `/api/playlists/${playlist.id}/youtube`, { privacyStatus: 'unlisted' });
      assert.equal(started.status, 202);
      const first = await waitForJob(started.body.id);
      assert.equal(first.status, 'done', JSON.stringify(first.error));
      assert.deepEqual([first.result.created, first.result.added, first.done, first.total], [true, 2, 3, 3]);
      assert.deepEqual(first.result.withoutVideo, [{ songId: silent.id, title: 'Ohne Video', artist: 'Niemand' }]);
      const remoteId: string = first.result.youtubePlaylistId;
      const remote = fake.playlists.find((entry) => entry.id === remoteId)!;
      assert.deepEqual([remote.title, remote.description, remote.privacyStatus], ['Abendrunde', 'Zum Ausklang', 'unlisted']);
      assert.deepEqual(fake.playlistVideos(remoteId), ['dQw4w9WgXcQ', 'YQHsXMglC9A']);
      assert.equal(first.result.url, `https://www.youtube.com/playlist?list=${remoteId}`);
      const linked = (await api('GET', `/api/playlists/${playlist.id}`)).body;
      assert.equal(linked.youtubePlaylistId, remoteId);
      assert.ok(linked.youtubeSyncedAt);

      // Umbenennen, umsortieren und einen Song ergänzen – dann abgleichen.
      await api('PUT', `/api/playlists/${playlist.id}`, {
        name: 'Abendrunde 2',
        description: 'Zum Ausklang',
        songIds: [shape.id, hello.id, rick.id],
      });
      const second = await waitForJob((await api('POST', `/api/playlists/${playlist.id}/youtube`, {})).body.id);
      assert.equal(second.status, 'done', JSON.stringify(second.error));
      assert.deepEqual(
        [second.result.created, second.result.added, second.result.removed, second.result.moved],
        [false, 1, 0, 1],
      );
      assert.deepEqual(fake.playlistVideos(remoteId), ['JGwWNGJdvx8', 'YQHsXMglC9A', 'dQw4w9WgXcQ']);
      assert.equal(remote.title, 'Abendrunde 2');
      assert.equal(remote.privacyStatus, 'unlisted', 'die Sichtbarkeit bleibt');

      // Auf YouTube gelöscht: Beim nächsten Abgleich wird sie neu angelegt.
      fake.playlists = fake.playlists.filter((entry) => entry.id !== remoteId);
      const third = await waitForJob((await api('POST', `/api/playlists/${playlist.id}/youtube`, {})).body.id);
      assert.equal(third.result.recreated, true);
      assert.notEqual(third.result.youtubePlaylistId, remoteId);
      assert.deepEqual(fake.playlistVideos(third.result.youtubePlaylistId), [
        'JGwWNGJdvx8',
        'YQHsXMglC9A',
        'dQw4w9WgXcQ',
      ]);

      // Verknüpfung lösen: Die Playlist auf YouTube bleibt.
      assert.equal((await api('DELETE', `/api/playlists/${playlist.id}/youtube`)).status, 204);
      assert.equal((await api('GET', `/api/playlists/${playlist.id}`)).body.youtubePlaylistId, null);
      assert.ok(fake.playlistVideos(third.result.youtubePlaylistId));
    });

    test('nicht verfügbare Videos werden gemeldet, Fehler beenden die Übertragung sauber', async () => {
      await connect();
      const gone = await createSong({ title: 'Weg', artist: 'Niemand', youtubeUrl: 'https://youtu.be/abcdefghijk' });
      const rick = await createSong({
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });
      const playlist = (await api('POST', '/api/playlists', { name: 'Test', songIds: [gone.id, rick.id] })).body;

      const done = await waitForJob((await api('POST', `/api/playlists/${playlist.id}/youtube`, {})).body.id);
      assert.equal(done.status, 'done', JSON.stringify(done.error));
      assert.deepEqual(done.result.unavailable, [{ songId: gone.id, title: 'Weg', artist: 'Niemand' }]);
      assert.deepEqual(fake.playlistVideos(done.result.youtubePlaylistId), ['dQw4w9WgXcQ']);

      fake.failNext.push({ status: 403, reason: 'quotaExceeded' });
      const failed = await waitForJob((await api('POST', `/api/playlists/${playlist.id}/youtube`, {})).body.id);
      assert.equal(failed.status, 'failed');
      assert.equal(failed.error.code, 'youtube_quota');

      assert.equal((await api('POST', '/api/playlists/999/youtube', {})).status, 404);
      const invalid = await api('POST', `/api/playlists/${playlist.id}/youtube`, { privacyStatus: 'geheim' });
      assert.equal(invalid.status, 400);
      assert.equal((await api('GET', '/api/youtube/jobs/gibtsnicht')).status, 404);
    });

    test('Trennen widerruft den Zugang bei Google', async () => {
      await connect();
      const [refreshToken] = [...fake.refreshTokens];
      assert.equal((await api('POST', '/api/youtube/disconnect', {})).status, 204);
      assert.deepEqual(fake.revoked, [refreshToken]);
      assert.equal((await api('GET', '/api/youtube/status')).body.connected, false);
      assert.equal((await api('POST', '/api/youtube/disconnect', {})).status, 204, 'zweimal trennen schadet nicht');
    });
  });

  describe('Schutz der API', () => {
    test('POST-Anfragen müssen JSON senden', async () => {
      const plain = await fetch(`${baseUrl}/api/youtube/disconnect`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'x',
      });
      assert.equal(plain.status, 415);
      const form = await fetch(`${baseUrl}/api/songs`, {
        method: 'POST',
        body: new URLSearchParams({ title: 'x', artist: 'y' }),
      });
      assert.equal(form.status, 415);
      assert.deepEqual((await api('GET', '/api/songs')).body, []);
    });

    test('fremde Host-Namen werden abgewiesen (Schutz vor DNS-Rebinding)', async () => {
      const status = await new Promise<number>((resolve, reject) => {
        httpRequest(
          { host: '127.0.0.1', port: new URL(baseUrl).port, path: '/api/songs', headers: { host: 'evil.example' } },
          (response) => {
            response.resume();
            resolve(response.statusCode ?? 0);
          },
        )
          .on('error', reject)
          .end();
      });
      assert.equal(status, 403);
      assert.equal((await api('GET', '/api/songs')).status, 200);
    });
  });
});

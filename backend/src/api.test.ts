// Integrationstests der API gegen eine echte PostgreSQL. Für jeden Lauf wird eine
// eigene Wegwerf-Datenbank angelegt; die Daten der App bleiben unberührt.
// Ist keine Datenbank erreichbar, werden die Tests übersprungen. Starten lässt sie sich mit
//   podman compose -f docker-compose.yml -f docker-compose.dev.yml up -d db

import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, test } from 'node:test';
import pg from 'pg';
import { createApp } from './app.ts';
import { config } from './config.ts';
import { createPool, type Pool } from './db.ts';
import { migrate } from './migrate.ts';

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

    server = createApp(pool, { itunesCountry: 'de' }).listen(0, '127.0.0.1');
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
    await pool.query('TRUNCATE songs, playlists, categories RESTART IDENTITY CASCADE');
    await pool.query(
      `INSERT INTO categories (name, color) VALUES ('ruhig', '#2a78d6'), ('laut', '#eb6834'), ('Sommer', '#eda100')`,
    );
  });

  describe('Start', () => {
    test('die Migrationen legen Startkategorien an und laufen nur einmal', async () => {
      assert.ok(seededCategories.includes('melancholisch'));
      assert.ok(seededCategories.includes('aufpushend'));
      assert.equal(seededCategories.length, 8);
      assert.deepEqual(await migrate(pool), []);
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
        genre: 'Country',
        bpm: 90,
        energy: 2,
        rating: 5,
        notes: 'Gänsehaut',
        appleMusicUrl: 'https://music.apple.com/de/album/hurt/1440811595?i=1440811605',
        youtubeUrl: 'https://www.youtube.com/watch?v=8AHCfZTRGiI',
        youtubeMusicUrl: 'https://music.youtube.com/watch?v=8AHCfZTRGiI',
        artworkUrl: 'https://example.org/cover.jpg',
        categoryIds: [SUMMER, CALM],
      });

      assert.equal(created.title, 'Hurt');
      assert.deepEqual(created.categoryIds, [CALM, SUMMER]);
      assert.equal(created.durationSeconds, 217);
      assert.equal(created.rating, 5);
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
      const created = await createSong({ title: 'Alt', artist: 'x', rating: 2, categoryIds: [CALM, LOUD] });
      const updated = await api('PUT', `/api/songs/${created.id}`, {
        title: 'Neu',
        artist: 'x',
        energy: 4,
        categoryIds: [SUMMER],
      });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.title, 'Neu');
      assert.equal(updated.body.rating, null, 'nicht mitgeschickte Felder werden geleert');
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
        withoutLinks: 0,
      });
      assert.deepEqual(body.topArtists, []);
      assert.deepEqual(body.byDecade, []);
      assert.equal(body.byCategory.length, 3);
    });

    test('zählt die Bibliothek nach allen Dimensionen aus', async () => {
      await createSong({
        title: 'a',
        artist: 'ABBA',
        durationSeconds: 100,
        releaseYear: 1979,
        genre: 'Pop',
        rating: 5,
        energy: 4,
        bpm: 120,
        categoryIds: [CALM, SUMMER],
        youtubeUrl: 'https://youtu.be/8AHCfZTRGiI',
      });
      await createSong({
        title: 'b',
        artist: 'abba',
        durationSeconds: 200,
        releaseYear: 1981,
        genre: 'pop',
        rating: 4,
        energy: 2,
        bpm: 100,
        categoryIds: [CALM, SUMMER],
      });
      await createSong({ title: 'c', artist: 'Toto', durationSeconds: 450, releaseYear: 1982, genre: 'Rock', categoryIds: [CALM] });
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
      assert.equal(summer.averageBpm, 110);
      const loud = body.byCategory.find((row: Json) => row.name === 'laut');
      assert.equal(loud.averageRating, null);

      assert.deepEqual(body.topArtists, [
        { artist: 'ABBA', songCount: 2, totalDurationSeconds: 300 },
        { artist: 'Toto', songCount: 1, totalDurationSeconds: 450 },
        { artist: 'Unbekannt', songCount: 1, totalDurationSeconds: 0 },
      ]);
      assert.deepEqual(body.byGenre, [
        { genre: 'Pop', songCount: 2 },
        { genre: 'Rock', songCount: 1 },
        { genre: null, songCount: 1 },
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
      assert.deepEqual(body.byDurationMinute, [
        { minute: 1, songCount: 1 },
        { minute: 3, songCount: 1 },
        { minute: 7, songCount: 1 },
      ]);
      assert.deepEqual(body.categoryPairs, [{ firstId: CALM, secondId: SUMMER, songCount: 2 }]);
    });
  });

  describe('Online-Suche', () => {
    test('verlangt einen Suchbegriff', async () => {
      const response = await api('GET', '/api/lookup/itunes');
      assert.equal(response.status, 400);
      assert.equal(response.body.fields.term, 'Bitte einen Suchbegriff angeben.');
      assert.equal((await api('GET', '/api/lookup/itunes?term=a')).status, 400);
    });
  });
});

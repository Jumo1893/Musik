import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import * as z from 'zod';
import {
  categoryInputSchema,
  generatorCriteriaSchema,
  lookupQuerySchema,
  playlistInputSchema,
  songInputSchema,
} from './schemas.ts';

function messagesOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (err) {
    if (err instanceof z.ZodError) return err.issues.map((issue) => issue.message);
    throw err;
  }
  assert.fail('Eingabe wurde nicht abgelehnt');
}

describe('songInputSchema', () => {
  test('ein Song braucht nur Titel und Interpret; alles andere wird NULL', () => {
    const song = songInputSchema.parse({ title: '  Hurt ', artist: ' Johnny Cash ' });
    assert.deepEqual(song, {
      title: 'Hurt',
      artist: 'Johnny Cash',
      album: null,
      durationSeconds: null,
      releaseYear: null,
      genres: [],
      bpm: null,
      musicalKey: null,
      explicit: null,
      language: null,
      energy: null,
      singAlong: null,
      rating: null,
      notes: null,
      appleMusicUrl: null,
      youtubeUrl: null,
      youtubeMusicUrl: null,
      artworkUrl: null,
      categoryIds: [],
    });
  });

  test('leere Texte und ausdrückliches null werden zu NULL', () => {
    const song = songInputSchema.parse({
      title: 'Hurt',
      artist: 'Johnny Cash',
      album: '   ',
      genres: ['', '  '],
      notes: null,
      rating: null,
      youtubeUrl: ' ',
    });
    assert.equal(song.album, null);
    assert.deepEqual(song.genres, []);
    assert.equal(song.notes, null);
    assert.equal(song.rating, null);
    assert.equal(song.youtubeUrl, null);
  });

  test('doppelte Kategorien werden zusammengefasst, unbekannte Felder verworfen', () => {
    const song = songInputSchema.parse({ title: 'a', artist: 'b', categoryIds: [3, 1, 3], id: 99, foo: 'bar' });
    assert.deepEqual(song.categoryIds, [3, 1]);
    assert.equal('id' in song, false);
    assert.equal('foo' in song, false);
  });

  test('Genres werden getrimmt und jede Schreibweise nur einmal übernommen', () => {
    const song = songInputSchema.parse({
      title: 'a',
      artist: 'b',
      genres: [' Pop ', 'Dance', 'pop', 'Hip-Hop/Rap', 'DANCE'],
    });
    assert.deepEqual(song.genres, ['Pop', 'Dance', 'Hip-Hop/Rap']);
  });

  test('zu viele oder zu lange Genres werden abgelehnt', () => {
    const many = Array.from({ length: 21 }, (_, index) => `Genre ${index}`);
    assert.deepEqual(messagesOf(() => songInputSchema.parse({ title: 'a', artist: 'b', genres: many })), [
      'Bitte höchstens 20 Genres angeben.',
    ]);
    assert.equal(messagesOf(() => songInputSchema.parse({ title: 'a', artist: 'b', genres: ['x'.repeat(101)] })).length, 1);
    assert.equal(messagesOf(() => songInputSchema.parse({ title: 'a', artist: 'b', genres: 'Pop' })).length, 1);
  });

  test('fehlender Titel oder Interpret wird mit deutscher Meldung abgelehnt', () => {
    assert.deepEqual(messagesOf(() => songInputSchema.parse({ title: '  ', artist: 'x' })), [
      'Bitte einen Titel angeben.',
    ]);
    assert.deepEqual(messagesOf(() => songInputSchema.parse({ title: 'x' })), ['Bitte einen Interpreten angeben.']);
  });

  test('Zahlen außerhalb des Bereichs werden abgelehnt', () => {
    const base = { title: 'a', artist: 'b' };
    for (const invalid of [
      { rating: 6 },
      { rating: 0 },
      { energy: 2.5 },
      { singAlong: 6 },
      { singAlong: 0 },
      { durationSeconds: 0 },
      { bpm: 5 },
      { releaseYear: 99 },
      { rating: '4' },
    ]) {
      assert.equal(songInputSchema.safeParse({ ...base, ...invalid }).success, false, JSON.stringify(invalid));
    }
  });

  test('Links müssen http(s) sein und zur Plattform passen', () => {
    const base = { title: 'a', artist: 'b' };
    const valid = songInputSchema.parse({
      ...base,
      appleMusicUrl: 'https://music.apple.com/de/album/hurt/1440811595?i=1440811605',
      youtubeUrl: 'https://youtu.be/8AHCfZTRGiI',
      youtubeMusicUrl: 'https://music.youtube.com/watch?v=8AHCfZTRGiI',
      artworkUrl: 'https://example.org/cover.jpg',
    });
    assert.equal(valid.youtubeUrl, 'https://youtu.be/8AHCfZTRGiI');

    for (const invalid of [
      { youtubeUrl: 'javascript:alert(1)' },
      { artworkUrl: 'data:text/html,<script>alert(1)</script>' },
      { youtubeUrl: 'youtube.com/watch?v=8AHCfZTRGiI' },
      { youtubeUrl: 'https://example.org/watch?v=8AHCfZTRGiI' },
      { youtubeUrl: 'https://notyoutube.com/watch?v=8AHCfZTRGiI' },
      { appleMusicUrl: 'https://www.youtube.com/watch?v=8AHCfZTRGiI' },
      { youtubeMusicUrl: 'https://www.youtube.com/watch?v=8AHCfZTRGiI' },
    ]) {
      assert.equal(songInputSchema.safeParse({ ...base, ...invalid }).success, false, JSON.stringify(invalid));
    }
  });

  test('die Meldung zu einem falschen Link nennt die Plattform', () => {
    const [message] = messagesOf(() =>
      songInputSchema.parse({ title: 'a', artist: 'b', youtubeUrl: 'https://example.org/x' }),
    );
    assert.match(message!, /^YouTube: .*youtube\.com/);
  });
});

describe('categoryInputSchema', () => {
  test('setzt eine Standardfarbe und schreibt Farben klein', () => {
    assert.equal(categoryInputSchema.parse({ name: 'Sommer' }).color, '#2a78d6');
    assert.equal(categoryInputSchema.parse({ name: 'Sommer', color: '#EDA100' }).color, '#eda100');
  });

  test('lehnt ungültige Farben und leere Namen ab', () => {
    assert.equal(categoryInputSchema.safeParse({ name: 'Sommer', color: 'red' }).success, false);
    assert.equal(categoryInputSchema.safeParse({ name: 'Sommer', color: '#12345' }).success, false);
    assert.equal(categoryInputSchema.safeParse({ name: ' ' }).success, false);
  });
});

describe('generatorCriteriaSchema', () => {
  test('ein leeres Objekt ergibt „alles, gemischt“', () => {
    assert.deepEqual(generatorCriteriaSchema.parse({}), {
      includeCategoryIds: [],
      matchMode: 'any',
      excludeCategoryIds: [],
      excludeSongIds: [],
      genres: [],
      minRating: null,
      energyMin: null,
      energyMax: null,
      singAlongMin: null,
      singAlongMax: null,
      yearFrom: null,
      yearTo: null,
      excludeExplicit: false,
      languages: [],
      targetMinutes: null,
      maxSongs: null,
      maxPerArtist: null,
      order: 'shuffle',
      seed: null,
    });
  });

  test('lehnt unbekannte Reihenfolgen ab', () => {
    assert.equal(generatorCriteriaSchema.safeParse({ order: 'rückwärts' }).success, false);
  });
});

describe('playlistInputSchema', () => {
  test('behält die Reihenfolge der Songs und entfernt Dopplungen', () => {
    const playlist = playlistInputSchema.parse({ name: ' Abendrunde ', songIds: [5, 2, 5, 9] });
    assert.deepEqual(playlist, { name: 'Abendrunde', description: null, songIds: [5, 2, 9], criteria: null });
  });

  test('übernimmt Kriterien samt Standardwerten', () => {
    const playlist = playlistInputSchema.parse({ name: 'x', criteria: { includeCategoryIds: [1], targetMinutes: 45 } });
    assert.equal(playlist.criteria?.targetMinutes, 45);
    assert.equal(playlist.criteria?.order, 'shuffle');
  });
});

describe('lookupQuerySchema', () => {
  test('verlangt einen Suchbegriff mit mindestens zwei Zeichen', () => {
    assert.equal(lookupQuerySchema.parse({ term: '  hurt ' }).term, 'hurt');
    assert.equal(lookupQuerySchema.safeParse({ term: 'a' }).success, false);
    assert.equal(lookupQuerySchema.safeParse({}).success, false);
    assert.equal(lookupQuerySchema.safeParse({ term: ['a', 'b'] }).success, false);
  });
});

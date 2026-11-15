import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { generatorCriteriaSchema, type GeneratorCriteria } from '../schemas.ts';
import {
  ASSUMED_DURATION_SECONDS,
  DURATION_TOLERANCE_SECONDS,
  createRng,
  generatePlaylist,
  spreadArtists,
  type GeneratorSong,
} from './generator.ts';

let nextId = 1;

/** Song mit unauffälligen Standardwerten und eigenem Interpreten. */
function song(overrides: Partial<GeneratorSong> = {}): GeneratorSong {
  const id = nextId++;
  return {
    id,
    artist: `Interpret ${id}`,
    durationSeconds: 200,
    releaseYear: 2000,
    genre: 'Pop',
    energy: 3,
    rating: 3,
    categoryIds: [],
    ...overrides,
  };
}

function criteria(overrides: Record<string, unknown> = {}): GeneratorCriteria {
  return generatorCriteriaSchema.parse({ seed: 1, ...overrides });
}

function pick(songs: GeneratorSong[], overrides: Record<string, unknown> = {}): GeneratorSong[] {
  const byId = new Map(songs.map((s) => [s.id, s]));
  return generatePlaylist(songs, criteria(overrides)).songIds.map((id) => byId.get(id)!);
}

function ids(songs: GeneratorSong[]): number[] {
  return songs.map((s) => s.id).sort((a, b) => a - b);
}

function hasAdjacentSameArtist(songs: GeneratorSong[]): boolean {
  return songs.some((s, index) => index > 0 && s.artist === songs[index - 1]!.artist);
}

const SAD = 1;
const CALM = 2;
const PARTY = 3;

describe('Filter', () => {
  test('ohne Kriterien landen alle Songs in der Playlist', () => {
    const songs = [song(), song(), song()];
    const result = generatePlaylist(songs, criteria());
    assert.deepEqual([...result.songIds].sort((a, b) => a - b), ids(songs));
    assert.equal(result.candidateCount, 3);
  });

  test('„eine der Kategorien“ nimmt jeden Song mit mindestens einem Treffer', () => {
    const sad = song({ categoryIds: [SAD] });
    const calm = song({ categoryIds: [CALM] });
    const both = song({ categoryIds: [SAD, CALM] });
    const party = song({ categoryIds: [PARTY] });
    const untagged = song();
    const picked = pick([sad, calm, both, party, untagged], { includeCategoryIds: [SAD, CALM], matchMode: 'any' });
    assert.deepEqual(ids(picked), ids([sad, calm, both]));
  });

  test('„alle Kategorien“ verlangt jeden Treffer', () => {
    const sad = song({ categoryIds: [SAD] });
    const both = song({ categoryIds: [SAD, CALM, PARTY] });
    const picked = pick([sad, both], { includeCategoryIds: [SAD, CALM], matchMode: 'all' });
    assert.deepEqual(ids(picked), [both.id]);
  });

  test('ausgeschlossene Kategorien gewinnen gegen gewünschte', () => {
    const sad = song({ categoryIds: [SAD] });
    const sadParty = song({ categoryIds: [SAD, PARTY] });
    const picked = pick([sad, sadParty], { includeCategoryIds: [SAD], excludeCategoryIds: [PARTY] });
    assert.deepEqual(ids(picked), [sad.id]);
  });

  test('einzeln ausgeschlossene Songs werden nie vorgeschlagen', () => {
    const wanted = song({ categoryIds: [SAD] });
    const unwanted = song({ categoryIds: [SAD] });
    const result = generatePlaylist([wanted, unwanted], criteria({ includeCategoryIds: [SAD], excludeSongIds: [unwanted.id] }));
    assert.deepEqual(result.songIds, [wanted.id]);
    assert.equal(result.candidateCount, 1);
  });

  test('Genres werden ohne Rücksicht auf Groß-/Kleinschreibung verglichen', () => {
    const rock = song({ genre: 'Rock' });
    const pop = song({ genre: 'Pop' });
    const unknown = song({ genre: null });
    assert.deepEqual(ids(pick([rock, pop, unknown], { genres: ['rock'] })), [rock.id]);
  });

  test('Mindestbewertung schließt schlechter bewertete und unbewertete Songs aus', () => {
    const great = song({ rating: 5 });
    const good = song({ rating: 4 });
    const okay = song({ rating: 3 });
    const unrated = song({ rating: null });
    assert.deepEqual(ids(pick([great, good, okay, unrated], { minRating: 4 })), ids([great, good]));
  });

  test('Energie- und Jahresbereich schließen Songs ohne Angabe aus', () => {
    const calm = song({ energy: 1, releaseYear: 1985 });
    const medium = song({ energy: 3, releaseYear: 1995 });
    const wild = song({ energy: 5, releaseYear: 2015 });
    const unknown = song({ energy: null, releaseYear: null });
    const all = [calm, medium, wild, unknown];
    assert.deepEqual(ids(pick(all, { energyMin: 3 })), ids([medium, wild]));
    assert.deepEqual(ids(pick(all, { energyMax: 3 })), ids([calm, medium]));
    assert.deepEqual(ids(pick(all, { yearFrom: 1990, yearTo: 1999 })), [medium.id]);
  });

  test('vertauschte Bereichsgrenzen werden verziehen', () => {
    const calm = song({ energy: 1 });
    const medium = song({ energy: 3 });
    const wild = song({ energy: 5 });
    assert.deepEqual(ids(pick([calm, medium, wild], { energyMin: 5, energyMax: 3 })), ids([medium, wild]));
  });
});

describe('Auswahl', () => {
  test('hält die Ziel-Dauer ein und schöpft sie möglichst aus', () => {
    const songs = Array.from({ length: 40 }, (_, i) => song({ durationSeconds: 150 + ((i * 37) % 180) }));
    const targetMinutes = 30;
    const picked = pick(songs, { targetMinutes });
    const total = picked.reduce((sum, s) => sum + s.durationSeconds!, 0);
    assert.ok(total <= targetMinutes * 60 + DURATION_TOLERANCE_SECONDS, `zu lang: ${total}s`);
    assert.ok(total >= targetMinutes * 60 - 150, `zu kurz: ${total}s`);
  });

  test('überspringt zu lange Songs und füllt die Lücke mit kürzeren', () => {
    // Reihenfolge der Bewertung ist eindeutig: best > long > short.
    const best = song({ durationSeconds: 300, categoryIds: [SAD, CALM], rating: 5 });
    const long = song({ durationSeconds: 400, categoryIds: [SAD], rating: 5 });
    const short = song({ durationSeconds: 100, categoryIds: [SAD], rating: 1 });
    const picked = pick([best, long, short], { includeCategoryIds: [SAD, CALM], targetMinutes: 7 });
    assert.deepEqual(ids(picked), ids([best, short]));
  });

  test('Songs ohne Dauer zählen mit einer angenommenen Dauer', () => {
    const songs = Array.from({ length: 6 }, () => song({ durationSeconds: null }));
    const picked = pick(songs, { targetMinutes: 7 });
    assert.equal(picked.length, Math.floor((7 * 60 + DURATION_TOLERANCE_SECONDS) / ASSUMED_DURATION_SECONDS));
  });

  test('bevorzugt Songs, die mehr der gewünschten Kategorien treffen', () => {
    const fullMatches = [1, 2, 3].map(() => song({ categoryIds: [SAD, CALM] }));
    const halfMatches = [1, 2, 3, 4, 5].map(() => song({ categoryIds: [SAD] }));
    for (const seed of [1, 2, 3, 4, 5]) {
      const picked = pick([...halfMatches, ...fullMatches], { includeCategoryIds: [SAD, CALM], maxSongs: 3, seed });
      assert.deepEqual(ids(picked), ids(fullMatches), `Seed ${seed}`);
    }
  });

  test('„beste zuerst“ stellt die passendsten Songs an den Anfang', () => {
    const half = song({ categoryIds: [SAD], rating: 5 });
    const full = song({ categoryIds: [SAD, CALM], rating: 5 });
    const picked = pick([half, full], { includeCategoryIds: [SAD, CALM], order: 'best-first' });
    assert.deepEqual(picked.map((s) => s.id), [full.id, half.id]);
  });

  test('begrenzt die Anzahl der Songs insgesamt und pro Interpret', () => {
    const songs = [
      ...Array.from({ length: 6 }, () => song({ artist: 'Vielspieler' })),
      ...Array.from({ length: 6 }, () => song()),
    ];
    assert.equal(pick(songs, { maxSongs: 5 }).length, 5);

    const limited = pick(songs, { maxPerArtist: 2 });
    assert.equal(limited.filter((s) => s.artist === 'Vielspieler').length, 2);
    assert.equal(limited.length, 8);
  });

  test('zählt Interpreten unabhängig von Groß-/Kleinschreibung', () => {
    const songs = [song({ artist: 'ABBA' }), song({ artist: 'Abba' }), song({ artist: ' abba ' })];
    assert.equal(pick(songs, { maxPerArtist: 1 }).length, 1);
  });
});

describe('Zufall', () => {
  const songs = Array.from({ length: 30 }, () => song());

  test('derselbe Startwert liefert dieselbe Playlist', () => {
    const first = generatePlaylist(songs, criteria({ seed: 42, maxSongs: 10 }));
    const second = generatePlaylist(songs, criteria({ seed: 42, maxSongs: 10 }));
    assert.deepEqual(first.songIds, second.songIds);
    assert.equal(first.seed, 42);
  });

  test('das Ergebnis hängt nicht von der Reihenfolge der Bibliothek ab', () => {
    const forwards = generatePlaylist(songs, criteria({ seed: 7, maxSongs: 10 }));
    const backwards = generatePlaylist([...songs].reverse(), criteria({ seed: 7, maxSongs: 10 }));
    assert.deepEqual(forwards.songIds, backwards.songIds);
  });

  test('andere Startwerte liefern andere Playlists', () => {
    const variants = new Set(
      [1, 2, 3, 4, 5].map((seed) => generatePlaylist(songs, criteria({ seed, maxSongs: 10 })).songIds.join(',')),
    );
    assert.ok(variants.size > 1);
  });

  test('ohne Startwert wird einer gewählt und zurückgegeben', () => {
    const result = generatePlaylist(songs, generatorCriteriaSchema.parse({}));
    assert.ok(Number.isInteger(result.seed) && result.seed >= 0 && result.seed < 2 ** 32);
    const repeated = generatePlaylist(songs, criteria({ seed: result.seed }));
    assert.deepEqual(repeated.songIds, result.songIds);
  });

  test('createRng liefert Werte zwischen 0 und 1', () => {
    const rng = createRng(123);
    for (let i = 0; i < 1000; i++) {
      const value = rng();
      assert.ok(value >= 0 && value < 1);
    }
  });
});

describe('Reihenfolge', () => {
  const energies = [1, 5, 3, null, 2, 4, 5, 1, 3, 2, 4];
  const songs = energies.map((energy) => song({ energy }));
  const levels = (picked: GeneratorSong[]) => picked.map((s) => s.energy ?? 3);

  test('„aufbauend“ sortiert nach steigender Energie', () => {
    const picked = levels(pick(songs, { order: 'energy-up' }));
    assert.equal(picked.length, songs.length);
    assert.deepEqual(picked, [...picked].sort((a, b) => a - b));
  });

  test('„abbauend“ sortiert nach fallender Energie', () => {
    const picked = levels(pick(songs, { order: 'energy-down' }));
    assert.deepEqual(picked, [...picked].sort((a, b) => b - a));
  });

  test('„Bogen“ steigt bis zum Höhepunkt und fällt dann wieder', () => {
    const picked = levels(pick(songs, { order: 'energy-arc' }));
    const peak = picked.indexOf(Math.max(...picked));
    const rising = picked.slice(0, peak + 1);
    const falling = picked.slice(peak);
    assert.deepEqual(rising, [...rising].sort((a, b) => a - b));
    assert.deepEqual(falling, [...falling].sort((a, b) => b - a));
    // Anfang und Ende sind beide ruhig, der Höhepunkt liegt dazwischen.
    assert.ok(peak > 0 && peak < picked.length - 1);
  });

  test('gemischte Playlists vermeiden denselben Interpreten direkt hintereinander', () => {
    const mixed = [
      ...Array.from({ length: 4 }, () => song({ artist: 'A' })),
      ...Array.from({ length: 4 }, () => song({ artist: 'B' })),
      ...Array.from({ length: 4 }, () => song({ artist: 'C' })),
    ];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const picked = pick(mixed, { order: 'shuffle', seed });
      assert.equal(picked.length, mixed.length);
      assert.ok(!hasAdjacentSameArtist(picked), `Seed ${seed}: ${picked.map((s) => s.artist).join('')}`);
    }
  });

  test('innerhalb gleicher Energie werden Interpreten ebenfalls verteilt', () => {
    const sameLevel = [
      song({ artist: 'A', energy: 2 }),
      song({ artist: 'A', energy: 2 }),
      song({ artist: 'B', energy: 2 }),
      song({ artist: 'A', energy: 4 }),
      song({ artist: 'B', energy: 4 }),
      song({ artist: 'B', energy: 4 }),
    ];
    for (const seed of [1, 2, 3, 4, 5]) {
      const picked = pick(sameLevel, { order: 'energy-up', seed });
      assert.deepEqual(levels(picked), [2, 2, 2, 4, 4, 4]);
      assert.ok(!hasAdjacentSameArtist(picked), `Seed ${seed}: ${picked.map((s) => s.artist).join('')}`);
    }
  });
});

describe('spreadArtists', () => {
  const spread = (artists: string, previous: string | null = null) =>
    spreadArtists([...artists], (artist) => artist, previous).join('');
  const hasRepeat = (artists: string) => /(.)\1/.test(artists);

  test('trennt gleiche Interpreten, wenn genug andere da sind', () => {
    assert.equal(hasRepeat(spread('AAABBC')), false);
    assert.equal(hasRepeat(spread('AABB')), false);
    assert.equal(spread('AAB'), 'ABA');
  });

  test('holt am Ende übrig gebliebene Dopplungen nach vorne', () => {
    assert.equal(hasRepeat(spread('BCAA')), false);
    assert.equal(hasRepeat(spread('BCBCAA')), false);
  });

  test('behält alle Einträge, auch wenn sich Dopplungen nicht vermeiden lassen', () => {
    const result = spread('AAAB');
    assert.equal([...result].sort().join(''), 'AAAB');
  });

  test('berücksichtigt den Interpreten vor der Liste', () => {
    assert.equal(spread('AB', 'A'), 'BA');
    assert.equal(spread('A', 'A'), 'A');
  });

  test('lässt Listen ohne Dopplungen unverändert', () => {
    assert.equal(spread('ABCABC'), 'ABCABC');
    assert.equal(spread(''), '');
  });
});

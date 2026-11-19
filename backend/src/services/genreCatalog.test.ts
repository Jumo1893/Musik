import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { testCatalog } from '../testing/testGenres.ts';
import { genreKey } from './genreCatalog.ts';

describe('genreKey', () => {
  test('vergleicht ohne Groß-/Kleinschreibung, Akzente, Leer- und Satzzeichen', () => {
    assert.equal(genreKey('Hip-Hop'), genreKey('hip hop'));
    assert.equal(genreKey('Synth-Pop'), genreKey('synthpop'));
    assert.equal(genreKey('R&B'), 'randb');
    assert.equal(genreKey('Laïkó'), 'laiko');
    assert.equal(genreKey(' - '), '');
  });
});

describe('GenreCatalog', () => {
  test('findet Genres über Namen und andere Schreibweisen', () => {
    const catalog = testCatalog();
    assert.equal(catalog.find('alternative rock')?.name, 'Alternative Rock');
    assert.equal(catalog.find('Hip-Hop/Rap')?.name, 'Hip-Hop');
    assert.equal(catalog.find('Electronic Dance Music')?.name, 'EDM');
    assert.equal(catalog.find('synthpop')?.name, 'Synth-Pop');
    assert.equal(catalog.find('Polka'), undefined);
    assert.equal(catalog.find(''), undefined);
  });

  test('bringt Genres auf die Schreibweise der Liste und lässt unbekannte stehen', () => {
    const catalog = testCatalog();
    assert.deepEqual(catalog.canonicalize(['hip hop', ' Polka ', 'ALTERNATIVE', 'Hip-Hop/Rap', '', 'polka']), [
      'Hip-Hop',
      'Polka',
      'Alternative Rock',
    ]);
  });

  test('nennt die Hauptgenres eines Genres', () => {
    const catalog = testCatalog();
    assert.deepEqual(catalog.mainGenresOf('pop rock'), ['Pop', 'Rock']);
    assert.deepEqual(catalog.mainGenresOf('Rock'), ['Rock']);
    assert.deepEqual(catalog.mainGenresOf('Polka'), []);
    assert.deepEqual(
      catalog.mainGenres().map((main) => main.name),
      ['Pop', 'Rock', 'Hip-Hop', 'Electronic', 'R&B & Soul'],
    );
  });

  test('ordnet eigene Genres den Hauptgenres zu, die als Wort im Namen stehen', () => {
    const catalog = testCatalog();
    assert.deepEqual(catalog.guessMainGenres('New wave pop'), ['Pop']);
    assert.deepEqual(catalog.guessMainGenres('Deutscher Rock & Pop'), ['Pop', 'Rock']);
    assert.deepEqual(catalog.guessMainGenres('Ostblock Hip Hop'), ['Hip-Hop']);
    assert.deepEqual(catalog.guessMainGenres('Schrammel-R&B'), ['R&B & Soul']);
    // Nur ganze Wörter: „Popcorn“ ist kein Pop, „Deutschrap“ kein Rap.
    assert.deepEqual(catalog.guessMainGenres('Popcorn'), []);
    assert.deepEqual(catalog.guessMainGenres('Deutschrap'), []);
  });
});

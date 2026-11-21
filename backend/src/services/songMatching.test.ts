import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { sameMainArtist, sameSong, sameVersion, versionMarks } from './songMatching.ts';

describe('versionMarks und sameVersion', () => {
  test('erkennen Bearbeitungen im ganzen Titel, Live-Fassungen nur in Zusätzen', () => {
    assert.deepEqual(versionMarks('Hurt'), []);
    assert.deepEqual(versionMarks('Hurt (Live)'), ['live']);
    assert.deepEqual(versionMarks('Wonderwall - Live at Knebworth'), ['live']);
    assert.deepEqual(versionMarks('Live Forever'), []);
    assert.deepEqual(versionMarks('Haus am See (Slowed + Reverb)'), ['reverb', 'slowed']);
    assert.deepEqual(versionMarks('Haus am See Remix'), ['remix']);
    assert.deepEqual(versionMarks('Layla [Acoustic]'), ['acoustic']);
  });

  test('Remaster und Radio Edit sind dieselbe Fassung, Live und Remix nicht', () => {
    assert.equal(sameVersion('Hurt', 'Hurt (Remastered)'), true);
    assert.equal(sameVersion('Señorita', 'Señorita [Radio Edit]'), true);
    assert.equal(sameVersion('Hurt', 'Hurt (Live)'), false);
    assert.equal(sameVersion('Hurt (Live)', 'Hurt - Live'), true);
    assert.equal(sameVersion('Haus am See', 'Haus am See (Remix)'), false);
  });
});

describe('sameMainArtist', () => {
  test('Gastinterpreten und Artikel zählen nicht, andere Interpreten schon', () => {
    assert.equal(sameMainArtist('Daft Punk', 'Daft Punk feat. Pharrell Williams'), true);
    assert.equal(sameMainArtist('The Killers', 'Killers'), true);
    assert.equal(sameMainArtist('Macklemore & Ryan Lewis', 'Macklemore'), true);
    assert.equal(sameMainArtist('Johnny Cash', 'Nine Inch Nails'), false);
    assert.equal(sameMainArtist('Eminem', 'Rihanna feat. Eminem'), false);
  });
});

describe('sameSong', () => {
  const hurt = { title: 'Hurt', artist: 'Johnny Cash' };

  test('gleicher Song auch von einem anderen Album und mit Zusätzen', () => {
    assert.equal(sameSong(hurt, { title: 'Hurt (Remastered)', artist: 'Johnny Cash' }), true);
    assert.equal(sameSong(hurt, { title: 'hurt', artist: 'JOHNNY CASH' }), true);
    assert.equal(
      sameSong({ title: 'Get Lucky', artist: 'Daft Punk' }, { title: 'Get Lucky (feat. Pharrell Williams)', artist: 'Daft Punk feat. Pharrell Williams' }),
      true,
    );
  });

  test('andere Fassung, anderer Interpret oder anderer Titel sind ein anderer Song', () => {
    assert.equal(sameSong(hurt, { title: 'Hurt (Live)', artist: 'Johnny Cash' }), false);
    assert.equal(sameSong(hurt, { title: 'Hurt', artist: 'Nine Inch Nails' }), false);
    assert.equal(sameSong(hurt, { title: 'Hurts', artist: 'Johnny Cash' }), false);
    assert.equal(sameSong({ title: 'Hurt (Live)', artist: 'Johnny Cash' }, { title: 'Hurt - Live', artist: 'Johnny Cash' }), true);
  });
});

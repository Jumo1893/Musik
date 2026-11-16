import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { extractYoutubeId, playlistLinks, songVideoId } from './youtubeIds.ts';
import { nextQuotaReset, quotaDay } from './youtubeQuota.ts';
import {
  artistsMatch,
  createSongMatcher,
  matchKey,
  parseIsoDuration,
  parseVideoTitle,
  rankVideos,
  stripVideoNoise,
  type VideoSummary,
} from './youtubeText.ts';

describe('parseIsoDuration', () => {
  test('liest Minuten, Stunden und Tage', () => {
    assert.equal(parseIsoDuration('PT4M55S'), 295);
    assert.equal(parseIsoDuration('PT45S'), 45);
    assert.equal(parseIsoDuration('PT1H2M5S'), 3725);
    assert.equal(parseIsoDuration('PT10M'), 600);
    assert.equal(parseIsoDuration('PT3M33.6S'), 214);
  });

  test('unbekannte, leere und zu lange Angaben ergeben null', () => {
    for (const value of [null, undefined, '', 'P0D', 'PT0S', 'P1D', 'P1DT2H', '4:55', 'PTXM']) {
      assert.equal(parseIsoDuration(value), null, String(value));
    }
  });
});

describe('parseVideoTitle', () => {
  const cases: Array<[string, string | null, string, string]> = [
    ['Rick Astley - Never Gonna Give You Up (Official Music Video)', 'Rick Astley', 'Rick Astley', 'Never Gonna Give You Up'],
    ['Queen – Bohemian Rhapsody (Official Video Remastered)', 'Queen Official', 'Queen', 'Bohemian Rhapsody'],
    ['Adele - Hello (Official Music Video)', 'AdeleVEVO', 'Adele', 'Hello'],
    ['Hello', 'Adele - Topic', 'Adele', 'Hello'],
    ['Survivor - Eye Of The Tiger (Official HD Video)', 'Survivor', 'Survivor', 'Eye Of The Tiger'],
    ['a-ha - Take On Me (Official Video) [Remastered in 4K]', 'a-ha', 'a-ha', 'Take On Me'],
    ['PSY - GANGNAM STYLE(강남스타일) M/V', 'officialpsy', 'PSY', 'GANGNAM STYLE(강남스타일)'],
    ['Mark Ronson - Uptown Funk (Official Video) ft. Bruno Mars', 'Mark Ronson', 'Mark Ronson', 'Uptown Funk ft. Bruno Mars'],
    ['Simon & Garfunkel - The Sound of Silence (Audio)', 'Simon & Garfunkel', 'Simon & Garfunkel', 'The Sound of Silence'],
    ['Ed Sheeran - "Shape of You" | Official Video', 'Ed Sheeran', 'Ed Sheeran', 'Shape of You'],
    ['Never Gonna Give You Up - Rick Astley', 'Rick Astley', 'Rick Astley', 'Never Gonna Give You Up'],
    ['Lustige Katzen 2026', 'Katzenkanal', 'Katzenkanal', 'Lustige Katzen 2026'],
    ['Somebody That I Used To Know (Live)', 'Gotye', 'Gotye', 'Somebody That I Used To Know (Live)'],
    ['Deleted video', null, 'Unbekannt', 'Deleted video'],
  ];

  for (const [videoTitle, channel, artist, title] of cases) {
    test(`„${videoTitle}“ → ${artist} / ${title}`, () => {
      assert.deepEqual(parseVideoTitle(videoTitle, channel), { artist, title });
    });
  }

  test('kürzt sehr lange Titel auf das erlaubte Maß', () => {
    const parsed = parseVideoTitle(`Band - ${'x'.repeat(400)}`, 'Band');
    assert.equal(parsed.title.length, 300);
  });
});

describe('stripVideoNoise', () => {
  test('behält Zusätze, die zum Song gehören', () => {
    assert.equal(stripVideoNoise('Song (Acoustic Version) [Official Audio]'), 'Song (Acoustic Version)');
    assert.equal(stripVideoNoise('Song (feat. Someone) (Lyrics)'), 'Song (feat. Someone)');
    assert.equal(stripVideoNoise('Song 【MV】'), 'Song');
  });
});

describe('Abgleich mit der Bibliothek', () => {
  test('matchKey ignoriert Akzente, Klammern, Gastinterpreten und Satzzeichen', () => {
    assert.equal(matchKey('Apologize (feat. OneRepublic)'), 'apologize');
    assert.equal(matchKey('Apologize ft. OneRepublic'), 'apologize');
    assert.equal(matchKey('Für Elise!'), 'fur elise');
    assert.equal(matchKey('Simon & Garfunkel'), 'simon and garfunkel');
  });

  test('artistsMatch ist großzügig, aber nicht beliebig', () => {
    assert.ok(artistsMatch('Axwell Λ Ingrosso', 'Axwell /\\ Ingrosso'));
    assert.ok(artistsMatch('Timbaland', 'Timbaland feat. OneRepublic'));
    assert.ok(artistsMatch('BUNT. & The Temper Trap', 'The Temper Trap'));
    assert.ok(!artistsMatch('Adele', 'Ed Sheeran'));
    assert.ok(!artistsMatch('The Beatles', 'The Rolling Stones'));
    assert.ok(!artistsMatch('', 'Adele'));
  });

  const songs = [
    { id: 1, title: 'Hello', artist: 'Adele', youtubeUrl: null, youtubeMusicUrl: null },
    { id: 2, title: 'Never Gonna Give You Up', artist: 'Rick Astley', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', youtubeMusicUrl: null },
    { id: 3, title: 'Hello', artist: 'Lionel Richie', youtubeUrl: null, youtubeMusicUrl: null },
  ];
  const match = createSongMatcher(songs);

  test('findet Songs über das verlinkte Video', () => {
    assert.deepEqual(match('dQw4w9WgXcQ', { title: 'Irgendwas', artist: 'Jemand' }), { song: songs[1], reason: 'video' });
  });

  test('findet Songs über Titel und Interpret', () => {
    assert.deepEqual(match('YQHsXMglC9A', { title: 'Hello', artist: 'Adele' }), { song: songs[0], reason: 'title' });
    assert.deepEqual(match('abcdefghijk', { title: 'Hello', artist: 'Lionel Richie' })?.song.id, 3);
    assert.equal(match('abcdefghijk', { title: 'Hello', artist: 'Nirvana' }), null);
    assert.equal(match('abcdefghijk', { title: 'Hallo', artist: 'Adele' }), null);
  });
});

describe('rankVideos', () => {
  const videos: VideoSummary[] = [
    { videoId: 'shapeCover1', title: 'Shape of You (Acoustic Cover) | Ed Sheeran', channelTitle: 'Coverband', durationSeconds: 230, thumbnailUrl: null },
    { videoId: 'JGwWNGJdvx8', title: 'Ed Sheeran - Shape of You (Official Music Video)', channelTitle: 'Ed Sheeran', durationSeconds: 264, thumbnailUrl: null },
    { videoId: 'unrelated01', title: 'Ed Sheeran - Perfect', channelTitle: 'Ed Sheeran', durationSeconds: 263, thumbnailUrl: null },
  ];

  test('das Original schlägt Cover und andere Songs', () => {
    const ranked = rankVideos(videos, { title: 'Shape of You', artist: 'Ed Sheeran', durationSeconds: 263 });
    assert.deepEqual(ranked.map((video) => video.videoId), ['JGwWNGJdvx8', 'unrelated01', 'shapeCover1']);
    assert.equal(ranked[0]!.recommended, true);
    assert.ok(ranked.slice(1).every((video) => !video.recommended));
  });

  test('ein Cover wird nicht abgewertet, wenn ausdrücklich danach gesucht wird', () => {
    const ranked = rankVideos(videos, { title: 'Shape of You (Acoustic Cover)', artist: 'Ed Sheeran' });
    assert.equal(ranked[0]!.videoId, 'shapeCover1');
  });

  test('bei stark abweichender Dauer gibt es keine Empfehlung', () => {
    const ranked = rankVideos(videos.slice(1, 2), { title: 'Shape of You', artist: 'Ed Sheeran', durationSeconds: 400 });
    assert.equal(ranked[0]!.recommended, false);
  });

  test('ohne Angaben zum Song bleibt die Reihenfolge von YouTube, nur Cover rutschen nach hinten', () => {
    const ranked = rankVideos(videos, {});
    assert.deepEqual(ranked.map((video) => video.videoId), ['JGwWNGJdvx8', 'unrelated01', 'shapeCover1']);
    assert.ok(ranked.every((video) => !video.recommended));
  });
});

describe('youtubeIds', () => {
  test('liest Video-IDs aus den üblichen Links', () => {
    assert.equal(extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), 'dQw4w9WgXcQ');
    assert.equal(extractYoutubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.equal(extractYoutubeId('https://music.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.equal(extractYoutubeId('https://example.org/watch?v=dQw4w9WgXcQ'), null);
    assert.equal(extractYoutubeId('kein Link'), null);
    assert.equal(songVideoId({ youtubeUrl: null, youtubeMusicUrl: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ' }), 'dQw4w9WgXcQ');
  });

  test('baut Playlist-Links für YouTube und YouTube Music', () => {
    assert.deepEqual(playlistLinks('PL123'), {
      url: 'https://www.youtube.com/playlist?list=PL123',
      musicUrl: 'https://music.youtube.com/playlist?list=PL123',
    });
  });
});

describe('Tageskontingent', () => {
  test('rechnet in Tagen pazifischer Zeit', () => {
    // 16.11.2026, 07:30 UTC ist in Kalifornien noch der 15.11. (23:30 Uhr).
    assert.equal(quotaDay(new Date('2026-11-16T07:30:00Z')), '2026-11-15');
    assert.equal(quotaDay(new Date('2026-11-16T08:30:00Z')), '2026-11-16');
  });

  test('setzt sich um Mitternacht pazifischer Zeit zurück, auch über die Zeitumstellung', () => {
    // Winterzeit (UTC−8): Mitternacht = 08:00 UTC
    assert.equal(nextQuotaReset(new Date('2026-11-16T12:00:00Z')).toISOString(), '2026-11-17T08:00:00.000Z');
    // Sommerzeit (UTC−7): Mitternacht = 07:00 UTC
    assert.equal(nextQuotaReset(new Date('2026-07-01T12:00:00Z')).toISOString(), '2026-07-02T07:00:00.000Z');
    // Tag der Umstellung auf Sommerzeit (8. März 2026): die nächste Mitternacht liegt schon in der Sommerzeit.
    assert.equal(nextQuotaReset(new Date('2026-03-08T12:00:00Z')).toISOString(), '2026-03-09T07:00:00.000Z');
    // Tag der Umstellung auf Winterzeit (1. November 2026)
    assert.equal(nextQuotaReset(new Date('2026-11-01T12:00:00Z')).toISOString(), '2026-11-02T08:00:00.000Z');
  });
});

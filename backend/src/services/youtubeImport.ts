// Videos von YouTube in die Bibliothek übernehmen und Songs mit Videos verknüpfen.
// Läuft in einer Transaktion: Entweder kommt alles an oder nichts.

import type { Queryable } from '../db.ts';
import { HttpError } from '../errors.ts';
import type { YoutubeImportInput } from '../schemas.ts';
import type { YoutubeImportResult } from '../types.ts';
import { createPlaylist } from './playlistStore.ts';
import { createSong } from './songStore.ts';
import { songVideoId, videoUrl } from './youtubeIds.ts';

interface SongLinkRow {
  id: number;
  youtube_url: string | null;
  youtube_music_url: string | null;
}

/** Setzt den YouTube-Link, falls der Song noch keinen hat. Gibt true zurück, wenn er gesetzt wurde. */
async function linkIfMissing(db: Queryable, song: SongLinkRow, videoId: string): Promise<boolean> {
  if (songVideoId({ youtubeUrl: song.youtube_url, youtubeMusicUrl: song.youtube_music_url })) return false;
  await db.query('UPDATE songs SET youtube_url = $1, updated_at = now() WHERE id = $2', [videoUrl(videoId), song.id]);
  return true;
}

/** Ergebnis für die Oberfläche, dazu die IDs der neu angelegten Songs für die weitere Verarbeitung. */
export async function importFromYoutube(
  db: Queryable,
  input: YoutubeImportInput,
): Promise<YoutubeImportResult & { createdSongIds: number[] }> {
  const songIds: number[] = [];
  // Mehrere Videos können zum selben Song gehören (Musikvideo und Audio-Version):
  // Gezählt wird jeder Song nur einmal, und zwar nach dem, was mit ihm zuerst passiert ist.
  const created = new Set<number>();
  const linked = new Set<number>();
  const existing = new Set<number>();

  const useExisting = async (song: SongLinkRow, videoId: string) => {
    songIds.push(song.id);
    if (created.has(song.id) || linked.has(song.id) || existing.has(song.id)) return;
    if (await linkIfMissing(db, song, videoId)) linked.add(song.id);
    else existing.add(song.id);
  };

  for (const item of input.items) {
    if (item.action === 'link') {
      const { rows } = await db.query<SongLinkRow>(
        'SELECT id, youtube_url, youtube_music_url FROM songs WHERE id = $1',
        [item.songId],
      );
      if (!rows[0]) throw new HttpError(400, 'Einen der Songs, mit denen verknüpft werden soll, gibt es nicht mehr.');
      await useExisting(rows[0], item.videoId);
      continue;
    }

    // Gleicher Titel und Interpret ohne Album: Den Song gibt es schon (auch aus diesem Import),
    // er wird verwendet statt doppelt angelegt.
    const sameSong = await db.query<SongLinkRow>(
      `SELECT id, youtube_url, youtube_music_url FROM songs
        WHERE lower(title) = lower($1) AND lower(artist) = lower($2) AND coalesce(album, '') = ''
        LIMIT 1`,
      [item.title, item.artist],
    );
    if (sameSong.rows[0]) {
      await useExisting(sameSong.rows[0], item.videoId);
      continue;
    }

    const song = await createSong(db, {
      title: item.title,
      artist: item.artist,
      album: null,
      durationSeconds: item.durationSeconds,
      releaseYear: null,
      genres: [],
      bpm: null,
      energy: null,
      singAlong: null,
      rating: null,
      notes: null,
      appleMusicUrl: null,
      youtubeUrl: videoUrl(item.videoId),
      youtubeMusicUrl: null,
      artworkUrl: item.thumbnailUrl,
      categoryIds: input.categoryIds,
    });
    created.add(song.id);
    songIds.push(song.id);
  }

  const result: YoutubeImportResult = {
    createdSongs: created.size,
    linkedSongs: linked.size,
    existingSongs: existing.size,
    playlistId: null,
  };

  if (input.playlist) {
    const playlist = await createPlaylist(db, {
      name: input.playlist.name,
      description: input.playlist.description,
      songIds: [...new Set(songIds)],
      criteria: null,
    });
    result.playlistId = playlist.id;
  }
  return { ...result, createdSongIds: [...created] };
}

/** Speichert gefundene Videos als YouTube-Link der Songs. Gibt die Zahl der geänderten Songs zurück. */
export async function setYoutubeLinks(
  db: Queryable,
  links: ReadonlyArray<{ songId: number; videoId: string }>,
): Promise<number> {
  let updated = 0;
  for (const link of links) {
    const result = await db.query('UPDATE songs SET youtube_url = $1, updated_at = now() WHERE id = $2', [
      videoUrl(link.videoId),
      link.songId,
    ]);
    updated += result.rowCount ?? 0;
  }
  return updated;
}

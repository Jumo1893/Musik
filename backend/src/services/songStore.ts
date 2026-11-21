import type { Queryable } from '../db.ts';
import type { SongInput } from '../schemas.ts';
import type { Song } from '../types.ts';
import { prepareSongGenres } from './genreCatalog.ts';

interface SongRow {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  duration_seconds: number | null;
  release_year: number | null;
  genres: string[];
  main_genres: string[];
  bpm: number | null;
  musical_key: string | null;
  explicit: boolean | null;
  energy: number | null;
  sing_along: number | null;
  rating: number | null;
  notes: string | null;
  apple_music_url: string | null;
  youtube_url: string | null;
  youtube_music_url: string | null;
  artwork_url: string | null;
  category_ids: number[];
  created_at: Date;
  updated_at: Date;
}

const SELECT_SONGS = `
  SELECT s.id, s.title, s.artist, s.album, s.duration_seconds, s.release_year, s.genres,
         song_main_genres(s.genres) AS main_genres, s.bpm, s.musical_key, s.explicit,
         s.energy, s.sing_along, s.rating, s.notes, s.apple_music_url, s.youtube_url, s.youtube_music_url,
         s.artwork_url, s.created_at, s.updated_at,
         COALESCE(
           (SELECT array_agg(sc.category_id ORDER BY sc.category_id)
              FROM song_categories sc
             WHERE sc.song_id = s.id),
           '{}'::integer[]
         ) AS category_ids
    FROM songs s`;

function toSong(row: SongRow): Song {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    durationSeconds: row.duration_seconds,
    releaseYear: row.release_year,
    genres: row.genres,
    mainGenres: row.main_genres,
    bpm: row.bpm,
    musicalKey: row.musical_key,
    explicit: row.explicit,
    energy: row.energy,
    singAlong: row.sing_along,
    rating: row.rating,
    notes: row.notes,
    appleMusicUrl: row.apple_music_url,
    youtubeUrl: row.youtube_url,
    youtubeMusicUrl: row.youtube_music_url,
    artworkUrl: row.artwork_url,
    categoryIds: row.category_ids,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Reihenfolge entspricht den Platzhaltern $1 bis $17 in INSERT und UPDATE. */
function columnValues(input: SongInput, genres: string[]): unknown[] {
  return [
    input.title,
    input.artist,
    input.album,
    input.durationSeconds,
    input.releaseYear,
    genres,
    input.bpm,
    input.energy,
    input.singAlong,
    input.rating,
    input.notes,
    input.appleMusicUrl,
    input.youtubeUrl,
    input.youtubeMusicUrl,
    input.artworkUrl,
    input.musicalKey,
    input.explicit,
  ];
}

async function addCategories(db: Queryable, songId: number, categoryIds: number[]): Promise<void> {
  if (categoryIds.length === 0) return;
  await db.query(
    `INSERT INTO song_categories (song_id, category_id)
     SELECT $1, category_id FROM unnest($2::integer[]) AS t(category_id)`,
    [songId, categoryIds],
  );
}

export async function listSongs(db: Queryable): Promise<Song[]> {
  const { rows } = await db.query<SongRow>(`${SELECT_SONGS} ORDER BY lower(s.artist), lower(s.title), s.id`);
  return rows.map(toSong);
}

export async function getSong(db: Queryable, id: number): Promise<Song | null> {
  const { rows } = await db.query<SongRow>(`${SELECT_SONGS} WHERE s.id = $1`, [id]);
  const row = rows[0];
  return row ? toSong(row) : null;
}

/** Muss in einer Transaktion laufen: Song, Kategorie-Zuordnungen und neue Genres gehören zusammen. */
export async function createSong(db: Queryable, input: SongInput): Promise<Song> {
  const genres = await prepareSongGenres(db, input.genres);
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO songs (title, artist, album, duration_seconds, release_year, genres, bpm, energy,
                        sing_along, rating, notes, apple_music_url, youtube_url, youtube_music_url, artwork_url,
                        musical_key, explicit)
     VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING id`,
    columnValues(input, genres),
  );
  const id = rows[0]!.id;
  await addCategories(db, id, input.categoryIds);
  return (await getSong(db, id))!;
}

/** Muss in einer Transaktion laufen. Gibt null zurück, wenn es den Song nicht gibt. */
export async function updateSong(db: Queryable, id: number, input: SongInput): Promise<Song | null> {
  const genres = await prepareSongGenres(db, input.genres);
  const result = await db.query(
    `UPDATE songs
        SET title = $1, artist = $2, album = $3, duration_seconds = $4, release_year = $5,
            genres = $6::text[], bpm = $7, energy = $8, sing_along = $9, rating = $10, notes = $11,
            apple_music_url = $12, youtube_url = $13, youtube_music_url = $14, artwork_url = $15,
            musical_key = $16, explicit = $17, updated_at = now()
      WHERE id = $18`,
    [...columnValues(input, genres), id],
  );
  if (result.rowCount === 0) return null;
  await db.query('DELETE FROM song_categories WHERE song_id = $1', [id]);
  await addCategories(db, id, input.categoryIds);
  return getSong(db, id);
}

/**
 * Der Song, an dem ein Speichern mit diesen Angaben scheitern würde: gleicher Titel, Interpret
 * und Album ohne Rücksicht auf Groß- und Kleinschreibung (wie der Index songs_unique_track).
 */
export async function findSameTrack(
  db: Queryable,
  track: Pick<SongInput, 'title' | 'artist' | 'album'>,
  excludeId: number | null,
): Promise<Pick<Song, 'id' | 'title' | 'artist' | 'album'> | null> {
  const { rows } = await db.query<{ id: number; title: string; artist: string; album: string | null }>(
    `SELECT id, title, artist, album FROM songs
      WHERE lower(title) = lower($1) AND lower(artist) = lower($2) AND lower(coalesce(album, '')) = lower(coalesce($3, ''))
        AND ($4::integer IS NULL OR id <> $4)
      LIMIT 1`,
    [track.title, track.artist, track.album, excludeId],
  );
  return rows[0] ?? null;
}

export async function deleteSong(db: Queryable, id: number): Promise<boolean> {
  const result = await db.query('DELETE FROM songs WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

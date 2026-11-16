import type { Queryable } from '../db.ts';
import type { SongInput } from '../schemas.ts';
import type { Song } from '../types.ts';

interface SongRow {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  duration_seconds: number | null;
  release_year: number | null;
  genres: string[];
  bpm: number | null;
  energy: number | null;
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
  SELECT s.id, s.title, s.artist, s.album, s.duration_seconds, s.release_year, s.genres, s.bpm,
         s.energy, s.rating, s.notes, s.apple_music_url, s.youtube_url, s.youtube_music_url,
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
    bpm: row.bpm,
    energy: row.energy,
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

/** Reihenfolge entspricht den Platzhaltern $1 bis $14 in INSERT und UPDATE. */
function columnValues(input: SongInput): unknown[] {
  return [
    input.title,
    input.artist,
    input.album,
    input.durationSeconds,
    input.releaseYear,
    input.genres,
    input.bpm,
    input.energy,
    input.rating,
    input.notes,
    input.appleMusicUrl,
    input.youtubeUrl,
    input.youtubeMusicUrl,
    input.artworkUrl,
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

/** Muss in einer Transaktion laufen: Song und Kategorie-Zuordnungen gehören zusammen. */
export async function createSong(db: Queryable, input: SongInput): Promise<Song> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO songs (title, artist, album, duration_seconds, release_year, genres, bpm, energy,
                        rating, notes, apple_music_url, youtube_url, youtube_music_url, artwork_url)
     VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id`,
    columnValues(input),
  );
  const id = rows[0]!.id;
  await addCategories(db, id, input.categoryIds);
  return (await getSong(db, id))!;
}

/** Muss in einer Transaktion laufen. Gibt null zurück, wenn es den Song nicht gibt. */
export async function updateSong(db: Queryable, id: number, input: SongInput): Promise<Song | null> {
  const result = await db.query(
    `UPDATE songs
        SET title = $1, artist = $2, album = $3, duration_seconds = $4, release_year = $5,
            genres = $6::text[], bpm = $7, energy = $8, rating = $9, notes = $10, apple_music_url = $11,
            youtube_url = $12, youtube_music_url = $13, artwork_url = $14, updated_at = now()
      WHERE id = $15`,
    [...columnValues(input), id],
  );
  if (result.rowCount === 0) return null;
  await db.query('DELETE FROM song_categories WHERE song_id = $1', [id]);
  await addCategories(db, id, input.categoryIds);
  return getSong(db, id);
}

export async function deleteSong(db: Queryable, id: number): Promise<boolean> {
  const result = await db.query('DELETE FROM songs WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

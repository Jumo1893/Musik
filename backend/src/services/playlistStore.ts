import type { Queryable } from '../db.ts';
import type { PlaylistInput } from '../schemas.ts';
import type { Playlist } from '../types.ts';

interface PlaylistRow {
  id: number;
  name: string;
  description: string | null;
  criteria: unknown;
  youtube_playlist_id: string | null;
  youtube_synced_at: Date | null;
  song_ids: number[];
  total_duration_seconds: number;
  created_at: Date;
  updated_at: Date;
}

const SELECT_PLAYLISTS = `
  SELECT p.id, p.name, p.description, p.criteria, p.created_at, p.updated_at,
         p.youtube_playlist_id, p.youtube_synced_at,
         COALESCE(agg.song_ids, '{}'::integer[]) AS song_ids,
         COALESCE(agg.total_duration_seconds, 0)::integer AS total_duration_seconds
    FROM playlists p
    LEFT JOIN LATERAL (
           SELECT array_agg(ps.song_id ORDER BY ps.position) AS song_ids,
                  sum(s.duration_seconds) AS total_duration_seconds
             FROM playlist_songs ps
             JOIN songs s ON s.id = ps.song_id
            WHERE ps.playlist_id = p.id
         ) agg ON true`;

function toPlaylist(row: PlaylistRow): Playlist {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    criteria: row.criteria,
    youtubePlaylistId: row.youtube_playlist_id,
    youtubeSyncedAt: row.youtube_synced_at,
    songIds: row.song_ids,
    totalDurationSeconds: row.total_duration_seconds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Schreibt die Songs in der übergebenen Reihenfolge (Position 1, 2, 3 …). */
async function addSongs(db: Queryable, playlistId: number, songIds: number[]): Promise<void> {
  if (songIds.length === 0) return;
  await db.query(
    `INSERT INTO playlist_songs (playlist_id, song_id, position)
     SELECT $1, t.song_id, t.position
       FROM unnest($2::integer[]) WITH ORDINALITY AS t(song_id, position)`,
    [playlistId, songIds],
  );
}

export async function listPlaylists(db: Queryable): Promise<Playlist[]> {
  const { rows } = await db.query<PlaylistRow>(`${SELECT_PLAYLISTS} ORDER BY p.updated_at DESC, p.id DESC`);
  return rows.map(toPlaylist);
}

export async function getPlaylist(db: Queryable, id: number): Promise<Playlist | null> {
  const { rows } = await db.query<PlaylistRow>(`${SELECT_PLAYLISTS} WHERE p.id = $1`, [id]);
  const row = rows[0];
  return row ? toPlaylist(row) : null;
}

/** Muss in einer Transaktion laufen. */
export async function createPlaylist(db: Queryable, input: PlaylistInput): Promise<Playlist> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO playlists (name, description, criteria) VALUES ($1, $2, $3::jsonb) RETURNING id`,
    [input.name, input.description, input.criteria === null ? null : JSON.stringify(input.criteria)],
  );
  const id = rows[0]!.id;
  await addSongs(db, id, input.songIds);
  return (await getPlaylist(db, id))!;
}

/**
 * Muss in einer Transaktion laufen. Die Kriterien bleiben unverändert, wenn die
 * Eingabe keine enthält – so gehen sie beim Umsortieren von Hand nicht verloren.
 */
export async function updatePlaylist(db: Queryable, id: number, input: PlaylistInput): Promise<Playlist | null> {
  const result = await db.query(
    `UPDATE playlists
        SET name = $1, description = $2, criteria = COALESCE($3::jsonb, criteria), updated_at = now()
      WHERE id = $4`,
    [input.name, input.description, input.criteria === null ? null : JSON.stringify(input.criteria), id],
  );
  if (result.rowCount === 0) return null;
  await db.query('DELETE FROM playlist_songs WHERE playlist_id = $1', [id]);
  await addSongs(db, id, input.songIds);
  return getPlaylist(db, id);
}

export async function deletePlaylist(db: Queryable, id: number): Promise<boolean> {
  const result = await db.query('DELETE FROM playlists WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

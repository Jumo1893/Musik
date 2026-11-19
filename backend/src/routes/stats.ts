import { Router } from 'express';
import type { Pool } from '../db.ts';
import type { Stats } from '../types.ts';

// count() und sum() liefern in PostgreSQL bigint, das der Treiber als Text übergibt –
// deshalb werden alle Kennzahlen ausdrücklich nach integer bzw. float8 gewandelt.

const TOTALS = `
  SELECT count(*)::integer                                  AS song_count,
         count(DISTINCT lower(artist))::integer             AS artist_count,
         (SELECT count(*) FROM categories)::integer         AS category_count,
         (SELECT count(*) FROM playlists)::integer          AS playlist_count,
         COALESCE(sum(duration_seconds), 0)::integer        AS total_duration_seconds,
         round(avg(duration_seconds))::integer              AS average_duration_seconds,
         round(avg(rating), 2)::float8                      AS average_rating,
         (count(*) FILTER (WHERE NOT EXISTS (
            SELECT 1 FROM song_categories sc WHERE sc.song_id = songs.id)))::integer AS without_category,
         (count(*) FILTER (WHERE duration_seconds IS NULL))::integer AS without_duration,
         (count(*) FILTER (WHERE rating IS NULL))::integer   AS without_rating,
         (count(*) FILTER (WHERE energy IS NULL))::integer   AS without_energy,
         (count(*) FILTER (WHERE sing_along IS NULL))::integer AS without_sing_along,
         (count(*) FILTER (WHERE apple_music_url IS NULL
                             AND youtube_url IS NULL
                             AND youtube_music_url IS NULL))::integer AS without_links
    FROM songs`;

const BY_CATEGORY = `
  SELECT c.id, c.name, c.color,
         count(s.id)::integer                         AS song_count,
         COALESCE(sum(s.duration_seconds), 0)::integer AS total_duration_seconds,
         round(avg(s.rating), 1)::float8              AS average_rating,
         round(avg(s.energy), 1)::float8              AS average_energy,
         round(avg(s.sing_along), 1)::float8          AS average_sing_along,
         round(avg(s.bpm))::integer                   AS average_bpm
    FROM categories c
    LEFT JOIN song_categories sc ON sc.category_id = c.id
    LEFT JOIN songs s ON s.id = sc.song_id
   GROUP BY c.id
   ORDER BY song_count DESC, lower(c.name)`;

// Schreibweisen, die sich nur in Groß-/Kleinschreibung unterscheiden, zählen als ein Interpret.
const TOP_ARTISTS = `
  SELECT min(artist) AS artist,
         count(*)::integer AS song_count,
         COALESCE(sum(duration_seconds), 0)::integer AS total_duration_seconds
    FROM songs
   GROUP BY lower(artist)
   ORDER BY song_count DESC, lower(artist)
   LIMIT 15`;

// Ein Song zählt bei jedem seiner Hauptgenres mit (Pop Rock bei Pop und Rock); Songs ohne
// Hauptgenre bilden die Zeile NULL.
const BY_MAIN_GENRE = `
  SELECT m.genre, count(*)::integer AS song_count
    FROM songs s
    LEFT JOIN LATERAL unnest(song_main_genres(s.genres)) AS m(genre) ON true
   GROUP BY m.genre
   ORDER BY song_count DESC, m.genre NULLS LAST`;

// Untergenres und eigene Genres; Hauptgenres, die direkt am Song stehen, zählen hier nicht.
// Songs ohne Untergenre bilden die Zeile NULL.
const BY_SUBGENRE = `
  SELECT min(g.genre) AS genre, count(DISTINCT s.id)::integer AS song_count
    FROM songs s
    LEFT JOIN LATERAL (
         SELECT t.genre
           FROM unnest(s.genres) AS t(genre)
          WHERE NOT EXISTS (SELECT 1 FROM genres m WHERE m.is_main AND lower(m.name) = lower(t.genre))
         ) AS g ON true
   GROUP BY lower(g.genre)
   ORDER BY song_count DESC, lower(g.genre) NULLS LAST`;

const BY_DECADE = `
  SELECT ((release_year / 10) * 10)::integer AS decade, count(*)::integer AS song_count
    FROM songs
   WHERE release_year IS NOT NULL
   GROUP BY 1
   ORDER BY 1`;

const BY_RATING = `
  SELECT rating, count(*)::integer AS song_count FROM songs GROUP BY rating ORDER BY rating NULLS LAST`;

const BY_ENERGY = `
  SELECT energy, count(*)::integer AS song_count FROM songs GROUP BY energy ORDER BY energy NULLS LAST`;

const BY_SING_ALONG = `
  SELECT sing_along, count(*)::integer AS song_count FROM songs GROUP BY sing_along ORDER BY sing_along NULLS LAST`;

const BY_DURATION_MINUTE = `
  SELECT LEAST(duration_seconds / 60, 7)::integer AS minute, count(*)::integer AS song_count
    FROM songs
   WHERE duration_seconds IS NOT NULL
   GROUP BY 1
   ORDER BY 1`;

const CATEGORY_PAIRS = `
  SELECT a.category_id AS first_id, b.category_id AS second_id, count(*)::integer AS song_count
    FROM song_categories a
    JOIN song_categories b ON b.song_id = a.song_id AND a.category_id < b.category_id
   GROUP BY 1, 2
   ORDER BY song_count DESC, 1, 2
   LIMIT 8`;

export function statsRouter(pool: Pool): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    // Nacheinander statt parallel: die Abfragen sind winzig und sollen den Pool nicht belegen.
    const totals = (await pool.query(TOTALS)).rows[0];
    const byCategory = (await pool.query(BY_CATEGORY)).rows;
    const topArtists = (await pool.query(TOP_ARTISTS)).rows;
    const byMainGenre = (await pool.query(BY_MAIN_GENRE)).rows;
    const bySubgenre = (await pool.query(BY_SUBGENRE)).rows;
    const byDecade = (await pool.query(BY_DECADE)).rows;
    const byRating = (await pool.query(BY_RATING)).rows;
    const byEnergy = (await pool.query(BY_ENERGY)).rows;
    const bySingAlong = (await pool.query(BY_SING_ALONG)).rows;
    const byDurationMinute = (await pool.query(BY_DURATION_MINUTE)).rows;
    const categoryPairs = (await pool.query(CATEGORY_PAIRS)).rows;

    const stats: Stats = {
      totals: {
        songCount: totals.song_count,
        artistCount: totals.artist_count,
        categoryCount: totals.category_count,
        playlistCount: totals.playlist_count,
        totalDurationSeconds: totals.total_duration_seconds,
        averageDurationSeconds: totals.average_duration_seconds,
        averageRating: totals.average_rating,
        withoutCategory: totals.without_category,
        withoutDuration: totals.without_duration,
        withoutRating: totals.without_rating,
        withoutEnergy: totals.without_energy,
        withoutSingAlong: totals.without_sing_along,
        withoutLinks: totals.without_links,
      },
      byCategory: byCategory.map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        songCount: row.song_count,
        totalDurationSeconds: row.total_duration_seconds,
        averageRating: row.average_rating,
        averageEnergy: row.average_energy,
        averageSingAlong: row.average_sing_along,
        averageBpm: row.average_bpm,
      })),
      topArtists: topArtists.map((row) => ({
        artist: row.artist,
        songCount: row.song_count,
        totalDurationSeconds: row.total_duration_seconds,
      })),
      byMainGenre: byMainGenre.map((row) => ({ genre: row.genre, songCount: row.song_count })),
      bySubgenre: bySubgenre.map((row) => ({ genre: row.genre, songCount: row.song_count })),
      byDecade: byDecade.map((row) => ({ decade: row.decade, songCount: row.song_count })),
      byRating: byRating.map((row) => ({ rating: row.rating, songCount: row.song_count })),
      byEnergy: byEnergy.map((row) => ({ energy: row.energy, songCount: row.song_count })),
      bySingAlong: bySingAlong.map((row) => ({ singAlong: row.sing_along, songCount: row.song_count })),
      byDurationMinute: byDurationMinute.map((row) => ({ minute: row.minute, songCount: row.song_count })),
      categoryPairs: categoryPairs.map((row) => ({
        firstId: row.first_id,
        secondId: row.second_id,
        songCount: row.song_count,
      })),
    };
    res.json(stats);
  });

  return router;
}

import { Router } from 'express';
import type { Pool } from '../db.ts';
import { notFound } from '../errors.ts';
import { jobKindSchema, jobStartSchema } from '../schemas.ts';
import type { LibraryJobs } from '../services/libraryJobs.ts';
import { songVideoId } from '../services/youtubeIds.ts';
import type { YoutubeLinkService } from '../services/youtubeLinks.ts';
import type { YoutubeLinkFinding } from '../types.ts';

const JOB = 'Der Auftrag';
/** Pause zwischen zwei Songs, damit die Quellen nicht überrannt werden */
const DELAY_MS = 1000;
const MAX_FAILURES = 5;

export interface JobServices {
  jobs: LibraryJobs;
  youtubeLinks: YoutubeLinkService;
}

interface SongRow {
  id: number;
  title: string;
  artist: string;
  duration_seconds: number | null;
  youtube_url: string | null;
  youtube_music_url: string | null;
}

async function loadSong(pool: Pool, id: number): Promise<SongRow | undefined> {
  const { rows } = await pool.query<SongRow>(
    'SELECT id, title, artist, duration_seconds, youtube_url, youtube_music_url FROM songs WHERE id = $1',
    [id],
  );
  return rows[0];
}

export function jobsRouter(pool: Pool, { jobs, youtubeLinks }: JobServices): Router {
  const router = Router();

  // POST /api/jobs { kind } – startet einen Auftrag über die Bibliothek.
  router.post('/', async (req, res) => {
    const { kind } = jobStartSchema.parse(req.body);
    // Fehlende YouTube-Links: alle Songs ohne Video, nach Interpret und Titel.
    const { rows } = await pool.query<SongRow>(
      'SELECT id, title, artist, duration_seconds, youtube_url, youtube_music_url FROM songs ORDER BY lower(artist), lower(title), id',
    );
    const songIds = rows
      .filter((row) => songVideoId({ youtubeUrl: row.youtube_url, youtubeMusicUrl: row.youtube_music_url }) === null)
      .map((row) => row.id);
    const job = jobs.start<YoutubeLinkFinding>({
      kind,
      songIds,
      delayMs: DELAY_MS,
      maxFailures: MAX_FAILURES,
      work: async (songId) => {
        const song = await loadSong(pool, songId);
        // Inzwischen gelöscht oder schon verlinkt: nichts zu tun.
        if (!song || songVideoId({ youtubeUrl: song.youtube_url, youtubeMusicUrl: song.youtube_music_url })) {
          return { result: null, online: false };
        }
        const match = await youtubeLinks.lookup(pool, {
          title: song.title,
          artist: song.artist,
          durationSeconds: song.duration_seconds,
        });
        return { result: match ? { songId, ...match } : null, online: true };
      },
    });
    res.status(202).json(job);
  });

  // GET /api/jobs/latest?kind=… – der zuletzt gestartete Auftrag dieser Art (null, wenn keiner).
  router.get('/latest', (req, res) => {
    const { kind } = jobKindSchema.parse(req.query);
    res.json({ job: jobs.latest(kind) ?? null });
  });

  router.get('/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) throw notFound(JOB);
    res.json(job);
  });

  // DELETE /api/jobs/:id – bricht einen laufenden Auftrag ab bzw. vergisst einen fertigen.
  router.delete('/:id', (req, res) => {
    if (!jobs.remove(req.params.id)) throw notFound(JOB);
    res.status(204).end();
  });

  return router;
}

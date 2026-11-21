import { Router } from 'express';
import type { Pool } from '../db.ts';
import { notFound } from '../errors.ts';
import { jobKindSchema, jobStartSchema } from '../schemas.ts';
import type { GenreLookupService } from '../services/genreLookup.ts';
import type { JobOptions, LibraryJobs } from '../services/libraryJobs.ts';
import { songVideoId } from '../services/youtubeIds.ts';
import type { YoutubeLinkService } from '../services/youtubeLinks.ts';
import type { LibraryJob, ReleaseYearFinding, YoutubeLinkFinding } from '../types.ts';

const JOB = 'Der Auftrag';
/** Nach so vielen Fehlschlägen in Folge bricht ein Auftrag ab. */
const MAX_FAILURES = 5;

export interface JobServices {
  jobs: LibraryJobs;
  youtubeLinks: YoutubeLinkService;
  genreLookup: GenreLookupService;
}

interface SongRow {
  id: number;
  title: string;
  artist: string;
  duration_seconds: number | null;
  release_year: number | null;
  youtube_url: string | null;
  youtube_music_url: string | null;
}

const SELECT_SONG = 'SELECT id, title, artist, duration_seconds, release_year, youtube_url, youtube_music_url FROM songs';

function hasVideo(song: SongRow): boolean {
  return songVideoId({ youtubeUrl: song.youtube_url, youtubeMusicUrl: song.youtube_music_url }) !== null;
}

export function jobsRouter(pool: Pool, { jobs, youtubeLinks, genreLookup }: JobServices): Router {
  const router = Router();

  async function loadSong(id: number): Promise<SongRow | undefined> {
    return (await pool.query<SongRow>(`${SELECT_SONG} WHERE id = $1`, [id])).rows[0];
  }

  /** Fehlende YouTube-Links: alle Songs ohne Video, über Wikidata und MusicBrainz. */
  function youtubeLinksJob(songs: SongRow[]): JobOptions<YoutubeLinkFinding> {
    return {
      kind: 'youtube-links',
      songIds: songs.filter((song) => !hasVideo(song)).map((song) => song.id),
      // Pause zwischen zwei Songs, damit Wikidata nicht überrannt wird; MusicBrainz regelt sich selbst.
      delayMs: 1000,
      maxFailures: MAX_FAILURES,
      work: async (songId) => {
        const song = await loadSong(songId);
        // Inzwischen gelöscht oder schon verlinkt: nichts zu tun.
        if (!song || hasVideo(song)) return { result: null, online: false };
        const match = await youtubeLinks.lookup(pool, { title: song.title, artist: song.artist, durationSeconds: song.duration_seconds });
        return { result: match ? { songId, ...match } : null, online: true };
      },
    };
  }

  /** Erscheinungsjahre: alle Songs, bei denen MusicBrainz ein früheres Jahr kennt oder das Jahr fehlt. */
  function releaseYearsJob(songs: SongRow[]): JobOptions<ReleaseYearFinding> {
    return {
      kind: 'release-years',
      songIds: songs.map((song) => song.id),
      // MusicBrainz erlaubt eine Anfrage pro Sekunde; daran hält sich der Zugriff schon selbst.
      delayMs: 0,
      maxFailures: MAX_FAILURES,
      work: async (songId) => {
        const song = await loadSong(songId);
        if (!song) return { result: null, online: false };
        const first = await genreLookup.firstReleaseYear(pool, {
          title: song.title,
          artist: song.artist,
          durationSeconds: song.duration_seconds,
        });
        if (!first || (song.release_year !== null && first.year >= song.release_year)) return { result: null, online: true };
        return {
          result: { songId, currentYear: song.release_year, firstReleaseYear: first.year, sourceUrl: first.url },
          online: true,
        };
      },
    };
  }

  // POST /api/jobs { kind } – startet einen Auftrag über die Bibliothek (Songs nach Interpret und Titel).
  router.post('/', async (req, res) => {
    const { kind } = jobStartSchema.parse(req.body);
    const { rows } = await pool.query<SongRow>(`${SELECT_SONG} ORDER BY lower(artist), lower(title), id`);
    const job: LibraryJob =
      kind === 'youtube-links' ? jobs.start(youtubeLinksJob(rows)) : jobs.start(releaseYearsJob(rows));
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

  // DELETE /api/jobs/:id – hält einen laufenden Auftrag an (die Funde bleiben) bzw. vergisst einen beendeten.
  router.delete('/:id', (req, res) => {
    if (!jobs.remove(req.params.id)) throw notFound(JOB);
    res.status(204).end();
  });

  return router;
}

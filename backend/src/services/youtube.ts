// Anbindung an das YouTube-Konto des Nutzers: Anmeldung über OAuth 2.0 bei Google,
// Aufrufe der YouTube Data API v3 und das Übertragen von Playlists.
//
// Kosten bei YouTube (Tageskontingent je Google-Cloud-Projekt): Lesen 1 Einheit,
// Anlegen/Ändern/Löschen 50 Einheiten, 10.000 Einheiten pro Tag; Suchen zählen
// getrennt, 100 pro Tag. Die App zählt mit (youtubeQuota.ts).

import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Pool } from '../db.ts';
import { HttpError } from '../errors.ts';
import type {
  YoutubeChannel,
  YoutubeImportPreview,
  YoutubePlaylistSummary,
  YoutubeSearchResult,
  YoutubeStatus,
  YoutubeSyncJob,
  YoutubeSyncResult,
} from '../types.ts';
import { getPlaylist } from './playlistStore.ts';
import { listSongs } from './songStore.ts';
import { playlistLinks, songVideoId, VIDEO_ID_PATTERN } from './youtubeIds.ts';
import { addQuotaUsage, DAILY_SEARCHES, DAILY_UNITS, nextQuotaReset, readQuotaUsage } from './youtubeQuota.ts';
import { executeSync, ManualSortRequiredError, planSync, type RemoteItem, type SyncExecutor } from './youtubeSync.ts';
import {
  createSongMatcher,
  parseIsoDuration,
  parseVideoTitle,
  rankVideos,
  type SearchHints,
  type VideoSummary,
} from './youtubeText.ts';

/** Berechtigung „YouTube-Konto verwalten“ – nötig, um Playlists anzulegen. */
export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube';
/** Pseudo-ID für die als „Mag ich“ markierten Videos */
export const LIKED_VIDEOS = 'mag-ich';

const STATE_LIFETIME_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 20_000;
/** Höchstens 20 Seiten à 50 Einträge werden gelesen. */
const MAX_PAGES = 20;
const COST_READ = 1;
const COST_WRITE = 50;

export interface GoogleEndpoints {
  authUrl: string;
  tokenUrl: string;
  revokeUrl: string;
  apiUrl: string;
}

export interface YoutubeServiceOptions {
  pool: Pool;
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string;
  endpoints: GoogleEndpoints;
  /** Land für die Suche, z. B. „DE“ */
  regionCode: string;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

/** Fehler bei der Anmeldung; `code` landet als ?fehler=… in der Adresse der YouTube-Seite. */
export class OAuthFlowError extends Error {
  readonly code: 'anmeldung' | 'berechtigung' | 'kein-token';

  constructor(code: OAuthFlowError['code'], message: string) {
    super(message);
    this.name = 'OAuthFlowError';
    this.code = code;
  }
}

/** Fehlerantwort der YouTube-API, übersetzt für die Oberfläche. */
export class YoutubeApiError extends HttpError {
  readonly reason: string | null;
  readonly upstreamStatus: number;

  constructor(status: number, message: string, code: string | undefined, upstreamStatus: number, reason: string | null) {
    super(status, message, code);
    this.name = 'YoutubeApiError';
    this.upstreamStatus = upstreamStatus;
    this.reason = reason;
  }
}

interface AccountRow {
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: Date | null;
  scope: string;
  channel_id: string | null;
  channel_title: string | null;
  channel_thumbnail_url: string | null;
  connected_at: Date;
  expired_at: Date | null;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

// Ausschnitte der API-Antworten, soweit die App sie liest.
interface Thumbnails {
  default?: { url?: string };
  medium?: { url?: string };
  high?: { url?: string };
}
interface PageResponse<T> {
  items?: T[];
  nextPageToken?: string;
}
interface ChannelResource {
  id: string;
  snippet?: { title?: string; thumbnails?: Thumbnails };
}
interface PlaylistResource {
  id: string;
  snippet?: { title?: string; description?: string; thumbnails?: Thumbnails };
  contentDetails?: { itemCount?: number };
  status?: { privacyStatus?: string };
}
interface PlaylistItemResource {
  id: string;
  snippet?: { title?: string; videoOwnerChannelTitle?: string; resourceId?: { videoId?: string } };
  contentDetails?: { videoId?: string };
}
interface VideoResource {
  id: string;
  snippet?: { title?: string; channelTitle?: string; categoryId?: string; thumbnails?: Thumbnails };
  contentDetails?: { duration?: string };
}
interface SearchResource {
  id?: { videoId?: string };
}

interface VideoInfo extends VideoSummary {
  categoryId: string | null;
}

type QueryValue = string | number | boolean | null | undefined;

interface ApiRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Einheiten aus dem allgemeinen Kontingent */
  units?: number;
  /** Suchanfragen aus dem Suchkontingent */
  searches?: number;
}

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; reason: string | null; message: string };

function pickThumbnail(thumbnails: Thumbnails | undefined): string | null {
  const url = thumbnails?.medium?.url ?? thumbnails?.high?.url ?? thumbnails?.default?.url ?? null;
  return url && url.startsWith('https://') ? url : null;
}

const resetTimeFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  hour: '2-digit',
  minute: '2-digit',
});

function reconnectError(): HttpError {
  return new HttpError(
    401,
    'Die Verbindung zu YouTube ist abgelaufen oder wurde widerrufen. Bitte auf der Seite „YouTube“ neu verbinden.',
    'youtube_reconnect',
  );
}

function notConnectedError(): HttpError {
  return new HttpError(
    409,
    'Die App ist nicht mit YouTube verbunden. Verbinde sie auf der Seite „YouTube“.',
    'youtube_not_connected',
  );
}

function notConfiguredError(): HttpError {
  return new HttpError(
    409,
    'Die YouTube-Anbindung ist noch nicht eingerichtet. Die Anleitung steht auf der Seite „YouTube“.',
    'youtube_not_configured',
  );
}

export class YoutubeService {
  private readonly options: YoutubeServiceOptions;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;
  /** Offene Anmeldungen: state → Ablaufzeit */
  private readonly states = new Map<string, number>();
  private readonly jobs = new Map<string, YoutubeSyncJob>();
  private refreshing: Promise<string> | null = null;

  constructor(options: YoutubeServiceOptions) {
    this.options = options;
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  get configured(): boolean {
    return Boolean(this.options.clientId && this.options.clientSecret);
  }

  get redirectUri(): string {
    return this.options.redirectUri;
  }

  // --- Anmeldung -------------------------------------------------------------

  /** Adresse der Google-Anmeldung. Der state schützt den Rücksprung vor untergeschobenen Anmeldungen. */
  createAuthorizationUrl(): string {
    if (!this.configured) throw notConfiguredError();
    const nowMs = this.now().getTime();
    for (const [state, expiresAt] of this.states) if (expiresAt <= nowMs) this.states.delete(state);

    const state = randomBytes(24).toString('base64url');
    this.states.set(state, nowMs + STATE_LIFETIME_MS);
    const url = new URL(this.options.endpoints.authUrl);
    url.search = new URLSearchParams({
      client_id: this.options.clientId!,
      redirect_uri: this.options.redirectUri,
      response_type: 'code',
      scope: YOUTUBE_SCOPE,
      // offline: Google stellt ein Refresh-Token aus, die Verbindung hält also über die Stunde hinaus.
      access_type: 'offline',
      // consent: Refresh-Token auch beim erneuten Verbinden; select_account: Konto wählen lassen.
      prompt: 'consent select_account',
      state,
    }).toString();
    return url.toString();
  }

  /** Prüft den state aus dem Rücksprung; jeder state gilt nur einmal. */
  consumeState(state: string): boolean {
    const expiresAt = this.states.get(state);
    this.states.delete(state);
    return expiresAt !== undefined && expiresAt > this.now().getTime();
  }

  async completeAuthorization(code: string): Promise<void> {
    if (!this.configured) throw notConfiguredError();
    const tokens = await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.options.redirectUri,
    });
    if (!tokens.access_token) {
      throw new OAuthFlowError('anmeldung', `Google hat den Code nicht angenommen (${tokens.error ?? 'unbekannt'}).`);
    }
    if (!(tokens.scope ?? '').split(' ').includes(YOUTUBE_SCOPE)) {
      throw new OAuthFlowError('berechtigung', 'Der Zugriff auf YouTube wurde nicht erlaubt.');
    }
    if (!tokens.refresh_token) {
      throw new OAuthFlowError('kein-token', 'Google hat kein Refresh-Token ausgestellt.');
    }

    const channel = await this.fetchChannel(tokens.access_token);
    // Ein früherer Zugang wird bewusst nicht widerrufen: Das würde bei Google alle Freigaben
    // der App entziehen – auch die gerade erteilte.
    await this.options.pool.query(
      `INSERT INTO youtube_account (id, refresh_token, access_token, access_token_expires_at, scope,
                                    channel_id, channel_title, channel_thumbnail_url, connected_at, expired_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, now(), NULL)
       ON CONFLICT (id) DO UPDATE
          SET refresh_token = EXCLUDED.refresh_token,
              access_token = EXCLUDED.access_token,
              access_token_expires_at = EXCLUDED.access_token_expires_at,
              scope = EXCLUDED.scope,
              channel_id = EXCLUDED.channel_id,
              channel_title = EXCLUDED.channel_title,
              channel_thumbnail_url = EXCLUDED.channel_thumbnail_url,
              connected_at = now(),
              expired_at = NULL`,
      [
        tokens.refresh_token,
        tokens.access_token,
        this.expiry(tokens.expires_in),
        tokens.scope ?? YOUTUBE_SCOPE,
        channel?.id ?? null,
        channel?.title ?? null,
        channel?.thumbnailUrl ?? null,
      ],
    );
  }

  /** Trennt die Verbindung und widerruft den Zugang bei Google. */
  async disconnect(): Promise<void> {
    const { rows } = await this.options.pool.query<{ refresh_token: string }>(
      'DELETE FROM youtube_account RETURNING refresh_token',
    );
    const token = rows[0]?.refresh_token;
    if (!token) return;
    try {
      await this.fetchFn(this.options.endpoints.revokeUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // Lokal ist die Verbindung getrennt; im Google-Konto lässt sich der Zugang auch von Hand entfernen.
      console.warn('Widerruf bei Google fehlgeschlagen:', err instanceof Error ? err.message : err);
    }
  }

  async status(): Promise<YoutubeStatus> {
    const account = await this.loadAccount();
    const now = this.now();
    const usage = await readQuotaUsage(this.options.pool, now);
    const channel: YoutubeChannel | null =
      account?.channel_id && account.channel_title
        ? { id: account.channel_id, title: account.channel_title, thumbnailUrl: account.channel_thumbnail_url }
        : null;
    return {
      configured: this.configured,
      redirectUri: this.options.redirectUri,
      connected: account !== null,
      expired: account?.expired_at != null,
      channel,
      connectedAt: account?.connected_at ?? null,
      quota: {
        unitsUsed: usage.units,
        unitsLimit: DAILY_UNITS,
        searchesUsed: usage.searches,
        searchesLimit: DAILY_SEARCHES,
        resetsAt: nextQuotaReset(now),
      },
    };
  }

  // --- Lesen und Suchen ------------------------------------------------------

  async search(query: string, hints: SearchHints): Promise<YoutubeSearchResult[]> {
    const found = await this.api<PageResponse<SearchResource>>({
      path: '/search',
      query: {
        part: 'snippet',
        q: query,
        type: 'video',
        videoCategoryId: '10', // Musik
        maxResults: 8,
        regionCode: this.options.regionCode,
      },
      searches: 1,
    });
    const ids = (found.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => typeof id === 'string' && VIDEO_ID_PATTERN.test(id));
    // Titel und Dauer kommen aus videos.list: Die Suche liefert keine Dauer und HTML-kodierte Titel.
    const details = await this.videoDetails(ids);
    const videos = ids.map((id) => details.get(id)).filter((video): video is VideoInfo => video !== undefined);
    return rankVideos(
      videos.map(({ categoryId: _categoryId, ...video }) => video),
      hints,
    );
  }

  async listPlaylists(): Promise<YoutubePlaylistSummary[]> {
    const playlists: YoutubePlaylistSummary[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await this.api<PageResponse<PlaylistResource>>({
        path: '/playlists',
        query: { part: 'snippet,contentDetails,status', mine: true, maxResults: 50, pageToken },
        units: COST_READ,
      });
      for (const item of data.items ?? []) playlists.push(this.toPlaylistSummary(item));
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return playlists;
  }

  /** Liest eine YouTube-Playlist (oder die „Mag ich“-Videos) und ordnet die Videos der Bibliothek zu. */
  async previewImport(id: string): Promise<YoutubeImportPreview> {
    let playlist: YoutubePlaylistSummary;
    let entries: Array<{ videoId: string; title: string; ownerChannel: string | null }>;

    if (id === LIKED_VIDEOS) {
      const liked = await this.likedVideos();
      playlist = {
        id: LIKED_VIDEOS,
        title: 'Mag ich',
        description: 'Videos, die du auf YouTube mit „Mag ich“ markiert hast',
        itemCount: liked.length,
        thumbnailUrl: liked[0]?.thumbnailUrl ?? null,
        privacyStatus: 'private',
        url: 'https://www.youtube.com/playlist?list=LL',
        musicUrl: null,
      };
      entries = liked.map((video) => ({ videoId: video.videoId, title: video.title, ownerChannel: video.channelTitle }));
    } else {
      const found = await this.api<PageResponse<PlaylistResource>>({
        path: '/playlists',
        query: { part: 'snippet,contentDetails,status', id, maxResults: 1 },
        units: COST_READ,
      });
      const resource = found.items?.[0];
      if (!resource) throw new HttpError(404, 'Diese Playlist gibt es auf YouTube nicht (mehr).');
      playlist = this.toPlaylistSummary(resource);
      entries = (await this.playlistItems(id)).map((item) => ({
        videoId: item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? '',
        title: item.snippet?.title ?? '',
        ownerChannel: item.snippet?.videoOwnerChannelTitle ?? null,
      }));
    }

    const valid = entries.filter((entry) => VIDEO_ID_PATTERN.test(entry.videoId));
    const details = await this.videoDetails([...new Set(valid.map((entry) => entry.videoId))]);
    const matchSong = createSongMatcher(await listSongs(this.options.pool));
    const firstPosition = new Map<string, number>();

    const items = valid.map((entry, position) => {
      const info = details.get(entry.videoId);
      const videoTitle = info?.title ?? entry.title;
      const channelTitle = info?.channelTitle ?? entry.ownerChannel;
      const parsed = parseVideoTitle(videoTitle, channelTitle);
      const duplicateOf = firstPosition.get(entry.videoId) ?? null;
      if (duplicateOf === null) firstPosition.set(entry.videoId, position);
      const match = info ? matchSong(entry.videoId, parsed) : null;
      return {
        position,
        videoId: entry.videoId,
        available: info !== undefined,
        videoTitle,
        channelTitle,
        title: parsed.title,
        artist: parsed.artist,
        durationSeconds: info?.durationSeconds ?? null,
        thumbnailUrl: info?.thumbnailUrl ?? null,
        isMusic: info ? info.categoryId === '10' : null,
        duplicateOf,
        match: match
          ? { songId: match.song.id, title: match.song.title, artist: match.song.artist, reason: match.reason }
          : null,
      };
    });

    return { playlist, items };
  }

  // --- Playlists übertragen --------------------------------------------------

  /** Startet die Übertragung im Hintergrund; der Fortschritt lässt sich über getJob abfragen. */
  async startExport(playlistId: number, privacyStatus: 'private' | 'unlisted' | 'public'): Promise<YoutubeSyncJob> {
    if (!this.configured) throw notConfiguredError();
    const account = await this.loadAccount();
    if (!account) throw notConnectedError();
    if (account.expired_at) throw reconnectError();

    const running = [...this.jobs.values()].find((job) => job.status === 'running');
    if (running) {
      if (running.playlistId === playlistId) return running;
      throw new HttpError(409, 'Gerade läuft schon eine Übertragung zu YouTube. Bitte warte, bis sie fertig ist.');
    }

    const hourAgo = this.now().getTime() - 60 * 60_000;
    for (const [id, job] of this.jobs) if (job.startedAt.getTime() < hourAgo) this.jobs.delete(id);

    const job: YoutubeSyncJob = {
      id: randomBytes(9).toString('base64url'),
      playlistId,
      status: 'running',
      done: 0,
      total: 0,
      result: null,
      error: null,
      startedAt: this.now(),
    };
    this.jobs.set(job.id, job);
    void this.runExport(job, privacyStatus);
    return job;
  }

  getJob(id: string): YoutubeSyncJob | undefined {
    return this.jobs.get(id);
  }

  private async runExport(job: YoutubeSyncJob, privacyStatus: 'private' | 'unlisted' | 'public'): Promise<void> {
    const pool = this.options.pool;
    try {
      const playlist = await getPlaylist(pool, job.playlistId);
      if (!playlist) throw new HttpError(404, 'Die Playlist wurde nicht gefunden.');

      const songsById = new Map((await listSongs(pool)).map((song) => [song.id, song]));
      const entries = playlist.songIds.map((id) => songsById.get(id)).filter((song) => song !== undefined);
      const desired: string[] = [];
      const songForVideo = new Map<string, { songId: number; title: string; artist: string }>();
      const withoutVideo: YoutubeSyncResult['withoutVideo'] = [];
      for (const song of entries) {
        const summary = { songId: song.id, title: song.title, artist: song.artist };
        const videoId = songVideoId(song);
        if (!videoId) {
          withoutVideo.push(summary);
          continue;
        }
        desired.push(videoId);
        if (!songForVideo.has(videoId)) songForVideo.set(videoId, summary);
      }

      let remoteId = playlist.youtubePlaylistId;
      let remote: RemoteItem[] = [];
      let recreated = false;
      if (remoteId) {
        const details = await this.remotePlaylist(remoteId);
        if (!details) {
          recreated = true;
          remoteId = null;
        } else {
          remote = await this.remoteItems(remoteId);
          const description = playlist.description ?? '';
          if (details.snippet?.title !== playlist.name || (details.snippet?.description ?? '') !== description) {
            await this.api({
              method: 'PUT',
              path: '/playlists',
              query: { part: 'snippet' },
              body: { id: remoteId, snippet: { title: playlist.name, description } },
              units: COST_WRITE,
            });
          }
        }
      }

      const plan = planSync(remote, desired);
      const created = remoteId === null;
      job.total = plan.operationCount + (created ? 1 : 0);

      if (remoteId === null) {
        const resource = await this.api<PlaylistResource>({
          method: 'POST',
          path: '/playlists',
          query: { part: 'snippet,status' },
          body: {
            snippet: { title: playlist.name, description: playlist.description ?? '' },
            status: { privacyStatus },
          },
          units: COST_WRITE,
        });
        remoteId = resource.id;
        // Sofort merken: Bricht die Übertragung ab, setzt der nächste Versuch hier fort.
        await pool.query('UPDATE playlists SET youtube_playlist_id = $1, youtube_synced_at = NULL WHERE id = $2', [
          remoteId,
          playlist.id,
        ]);
        job.done = 1;
      }

      const offset = job.done;
      const outcome = await executeSync(plan, this.remoteExecutor(remoteId), (done) => {
        job.done = offset + done;
      });
      await pool.query('UPDATE playlists SET youtube_synced_at = now() WHERE id = $1', [playlist.id]);

      job.result = {
        youtubePlaylistId: remoteId,
        ...playlistLinks(remoteId),
        created,
        recreated,
        added: outcome.added,
        removed: outcome.removed,
        moved: outcome.moved,
        orderSkipped: outcome.orderSkipped,
        unavailable: outcome.unavailable
          .map((videoId) => songForVideo.get(videoId))
          .filter((song) => song !== undefined),
        withoutVideo,
      };
      job.status = 'done';
    } catch (err) {
      if (!(err instanceof HttpError)) console.error('Übertragung zu YouTube fehlgeschlagen:', err);
      job.error =
        err instanceof HttpError
          ? { message: err.message, code: err.code ?? null }
          : { message: 'Die Übertragung zu YouTube ist fehlgeschlagen.', code: null };
      job.status = 'failed';
    }
  }

  private remoteExecutor(playlistId: string): SyncExecutor {
    return {
      remove: async (item) => {
        try {
          await this.api({ method: 'DELETE', path: '/playlistItems', query: { id: item.itemId }, units: COST_WRITE });
        } catch (err) {
          // Schon weg – das ist das gewünschte Ergebnis.
          if (!(err instanceof YoutubeApiError && err.upstreamStatus === 404)) throw err;
        }
      },
      insert: async (videoId, position) => {
        try {
          const resource = await this.api<PlaylistItemResource>({
            method: 'POST',
            path: '/playlistItems',
            query: { part: 'snippet' },
            body: {
              snippet: {
                playlistId,
                resourceId: { kind: 'youtube#video', videoId },
                ...(position === null ? {} : { position }),
              },
            },
            units: COST_WRITE,
          });
          return { itemId: resource.id, videoId };
        } catch (err) {
          if (err instanceof YoutubeApiError && err.reason === 'videoNotFound') return null;
          if (err instanceof YoutubeApiError && err.reason === 'manualSortRequired') throw new ManualSortRequiredError();
          throw err;
        }
      },
      move: async (item, position) => {
        try {
          await this.api({
            method: 'PUT',
            path: '/playlistItems',
            query: { part: 'snippet' },
            body: {
              id: item.itemId,
              snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId: item.videoId }, position },
            },
            units: COST_WRITE,
          });
        } catch (err) {
          if (err instanceof YoutubeApiError && err.reason === 'manualSortRequired') throw new ManualSortRequiredError();
          throw err;
        }
      },
    };
  }

  /** null, wenn es die Playlist auf YouTube nicht mehr gibt. */
  private async remotePlaylist(id: string): Promise<PlaylistResource | null> {
    const data = await this.api<PageResponse<PlaylistResource>>({
      path: '/playlists',
      query: { part: 'snippet', id, maxResults: 1 },
      units: COST_READ,
    });
    return data.items?.[0] ?? null;
  }

  private async remoteItems(playlistId: string): Promise<RemoteItem[]> {
    return (await this.playlistItems(playlistId))
      .map((item) => ({ itemId: item.id, videoId: item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? '' }))
      .filter((item) => item.videoId !== '');
  }

  private async playlistItems(playlistId: string): Promise<PlaylistItemResource[]> {
    const items: PlaylistItemResource[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await this.api<PageResponse<PlaylistItemResource>>({
        path: '/playlistItems',
        query: { part: 'snippet,contentDetails', playlistId, maxResults: 50, pageToken },
        units: COST_READ,
      });
      items.push(...(data.items ?? []));
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return items;
  }

  private async likedVideos(): Promise<VideoInfo[]> {
    const videos: VideoInfo[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await this.api<PageResponse<VideoResource>>({
        path: '/videos',
        query: { part: 'snippet,contentDetails', myRating: 'like', maxResults: 50, pageToken },
        units: COST_READ,
      });
      videos.push(...(data.items ?? []).map((item) => this.toVideoInfo(item)));
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return videos;
  }

  /** Titel, Kanal, Dauer und Bild zu Videos – je 50 IDs ein Aufruf. Fehlende Videos sind nicht verfügbar. */
  private async videoDetails(ids: readonly string[]): Promise<Map<string, VideoInfo>> {
    const details = new Map<string, VideoInfo>();
    for (let start = 0; start < ids.length; start += 50) {
      const batch = ids.slice(start, start + 50);
      const data = await this.api<PageResponse<VideoResource>>({
        path: '/videos',
        query: { part: 'snippet,contentDetails', id: batch.join(','), maxResults: 50 },
        units: COST_READ,
      });
      for (const item of data.items ?? []) details.set(item.id, this.toVideoInfo(item));
    }
    return details;
  }

  private toVideoInfo(item: VideoResource): VideoInfo {
    return {
      videoId: item.id,
      title: item.snippet?.title ?? '',
      channelTitle: item.snippet?.channelTitle ?? null,
      durationSeconds: parseIsoDuration(item.contentDetails?.duration),
      thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
      categoryId: item.snippet?.categoryId ?? null,
    };
  }

  private toPlaylistSummary(item: PlaylistResource): YoutubePlaylistSummary {
    return {
      id: item.id,
      title: item.snippet?.title || 'Ohne Titel',
      description: item.snippet?.description || null,
      itemCount: item.contentDetails?.itemCount ?? null,
      thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
      privacyStatus: item.status?.privacyStatus ?? null,
      ...playlistLinks(item.id),
    };
  }

  // --- Zugang und Aufrufe ----------------------------------------------------

  private async loadAccount(): Promise<AccountRow | null> {
    const { rows } = await this.options.pool.query<AccountRow>('SELECT * FROM youtube_account WHERE id = 1');
    return rows[0] ?? null;
  }

  private expiry(expiresIn: number | undefined): Date {
    return new Date(this.now().getTime() + (expiresIn ?? 3600) * 1000);
  }

  private async markExpired(): Promise<void> {
    await this.options.pool.query(
      'UPDATE youtube_account SET expired_at = now(), access_token = NULL, access_token_expires_at = NULL',
    );
  }

  /** Gültiges Access-Token; läuft es in der nächsten Minute ab, wird es vorher erneuert. */
  private async accessToken(forceRefresh: boolean): Promise<string> {
    if (!this.configured) throw notConfiguredError();
    const account = await this.loadAccount();
    if (!account) throw notConnectedError();
    if (account.expired_at) throw reconnectError();
    const stillValid =
      account.access_token !== null &&
      account.access_token_expires_at !== null &&
      account.access_token_expires_at.getTime() - this.now().getTime() > 60_000;
    if (!forceRefresh && stillValid) return account.access_token!;
    // Laufen mehrere Anfragen gleichzeitig ab, wird nur einmal erneuert.
    this.refreshing ??= this.refreshAccessToken(account.refresh_token).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async refreshAccessToken(refreshToken: string): Promise<string> {
    const tokens = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
    if (!tokens.access_token) {
      if (tokens.error === 'invalid_grant') {
        await this.markExpired();
        throw reconnectError();
      }
      if (tokens.error === 'invalid_client' || tokens.error === 'unauthorized_client') {
        throw new HttpError(
          502,
          'Google hat die Zugangsdaten der App abgelehnt. Stimmen YOUTUBE_CLIENT_ID und YOUTUBE_CLIENT_SECRET in der .env?',
          'youtube_client',
        );
      }
      throw new HttpError(502, `Google hat keinen neuen Zugang ausgestellt (${tokens.error ?? 'unbekannt'}).`);
    }
    await this.options.pool.query(
      `UPDATE youtube_account
          SET access_token = $1, access_token_expires_at = $2, refresh_token = COALESCE($3, refresh_token)`,
      [tokens.access_token, this.expiry(tokens.expires_in), tokens.refresh_token ?? null],
    );
    return tokens.access_token;
  }

  private async tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
    const body = new URLSearchParams({
      ...params,
      client_id: this.options.clientId ?? '',
      client_secret: this.options.clientSecret ?? '',
    });
    let response: Response;
    try {
      response = await this.fetchFn(this.options.endpoints.tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new HttpError(502, 'Google ist gerade nicht erreichbar. Bitte später noch einmal versuchen.', 'youtube_unreachable');
    }
    const data = ((await response.json().catch(() => null)) ?? {}) as TokenResponse;
    if (response.ok) return data;
    const { access_token: _ignored, ...rest } = data;
    return { ...rest, error: data.error ?? `http_${response.status}` };
  }

  private async fetchChannel(accessToken: string): Promise<YoutubeChannel | null> {
    const result = await this.send<PageResponse<ChannelResource>>(accessToken, {
      path: '/channels',
      query: { part: 'snippet', mine: true },
      units: COST_READ,
    });
    if (!result.ok) return null;
    const channel = result.data.items?.[0];
    if (!channel) return null;
    return {
      id: channel.id,
      title: channel.snippet?.title || 'Dein YouTube-Kanal',
      thumbnailUrl: pickThumbnail(channel.snippet?.thumbnails),
    };
  }

  /** Ein einzelner Aufruf mit einem bestimmten Token, ohne Wiederholung. */
  private async send<T>(accessToken: string, request: ApiRequest): Promise<ApiResult<T>> {
    const url = new URL(this.options.endpoints.apiUrl + request.path);
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    // Google berechnet auch abgelehnte Aufrufe, deshalb wird vorher gezählt.
    await addQuotaUsage(this.options.pool, this.now(), { units: request.units, searches: request.searches });

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: request.method ?? 'GET',
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
          ...(request.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: request.body === undefined ? null : JSON.stringify(request.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new HttpError(502, 'YouTube ist gerade nicht erreichbar. Bitte später noch einmal versuchen.', 'youtube_unreachable');
    }

    if (response.status === 204) return { ok: true, data: undefined as T };
    const data: unknown = await response.json().catch(() => null);
    if (response.ok) return { ok: true, data: data as T };
    const error = (data as { error?: { message?: string; errors?: Array<{ reason?: string }> } } | null)?.error;
    return {
      ok: false,
      status: response.status,
      reason: error?.errors?.[0]?.reason ?? null,
      message: error?.message ?? '',
    };
  }

  /** Aufruf mit dem gespeicherten Zugang: erneuert abgelaufene Tokens und wiederholt bei Störungen. */
  private async api<T = unknown>(request: ApiRequest): Promise<T> {
    let token = await this.accessToken(false);
    for (let attempt = 1; ; attempt++) {
      const result = await this.send<T>(token, request);
      if (result.ok) return result.data;

      const signupRequired = result.reason === 'youtubeSignupRequired';
      if (result.status === 401 && !signupRequired && attempt === 1) {
        token = await this.accessToken(true);
        continue;
      }
      if ((result.status >= 500 || result.status === 409) && attempt < 3) {
        await sleep(400 * attempt);
        continue;
      }
      if (result.status === 401 && !signupRequired) await this.markExpired();
      throw this.translateError(result, request);
    }
  }

  private translateError(result: { status: number; reason: string | null; message: string }, request: ApiRequest): YoutubeApiError {
    const { status, reason } = result;
    const fail = (httpStatus: number, message: string, code?: string) =>
      new YoutubeApiError(httpStatus, message, code, status, reason);
    const resetAt = resetTimeFormat.format(nextQuotaReset(this.now()));

    switch (reason) {
      case 'quotaExceeded':
      case 'dailyLimitExceeded':
        return request.searches
          ? fail(429, `Die ${DAILY_SEARCHES} YouTube-Suchen für heute sind aufgebraucht. Ab ${resetAt} Uhr geht es wieder.`, 'youtube_quota')
          : fail(429, `Das Tageskontingent der YouTube-API ist aufgebraucht. Ab ${resetAt} Uhr geht es wieder.`, 'youtube_quota');
      case 'insufficientPermissions':
        return fail(
          403,
          'Der App fehlt die Berechtigung für dein YouTube-Konto. Bitte auf der Seite „YouTube“ neu verbinden und den Zugriff auf YouTube erlauben.',
          'youtube_reconnect',
        );
      case 'youtubeSignupRequired':
        return fail(
          409,
          'Zu deinem Google-Konto gibt es noch keinen YouTube-Kanal. Leg auf youtube.com einen an (Profilbild → „Kanal erstellen“), dann klappt es.',
          'youtube_no_channel',
        );
      case 'playlistNotFound':
        return fail(404, 'Die Playlist gibt es auf YouTube nicht (mehr).');
      case 'videoNotFound':
        return fail(404, 'Das Video gibt es auf YouTube nicht (mehr).');
      case 'playlistContainsMaximumNumberOfVideos':
        return fail(409, 'Die YouTube-Playlist hat die Höchstzahl an Videos erreicht.');
      case 'maxPlaylistExceeded':
        return fail(409, 'Dein YouTube-Kanal hat die Höchstzahl an Playlists erreicht.');
      default:
        if (status === 401) return fail(401, reconnectError().message, 'youtube_reconnect');
        return fail(
          502,
          `YouTube hat die Anfrage abgelehnt (${status}${reason ? `, ${reason}` : ''})${result.message ? `: ${result.message}` : '.'}`,
        );
    }
  }
}

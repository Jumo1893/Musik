// Zugriff auf die REST-API des Backends.

import type {
  AppConfig,
  BpmMatch,
  YoutubeImportInput,
  YoutubeImportPreview,
  YoutubeImportResult,
  YoutubePlaylistSummary,
  YoutubePrivacy,
  YoutubeSearchResult,
  YoutubeStatus,
  YoutubeSyncJob,
  Category,
  CategoryInput,
  GeneratorCriteria,
  GeneratorResult,
  LookupResult,
  Playlist,
  PlaylistInput,
  Song,
  SongInput,
  Stats,
} from './types.ts';

export class ApiError extends Error {
  readonly status: number;
  /** Meldungen je Eingabefeld, falls der Server die Eingabe abgelehnt hat. */
  readonly fields: Record<string, string>;
  /** Grund für die Oberfläche, z. B. „youtube_reconnect“ */
  readonly code: string | null;

  constructor(status: number, message: string, fields: Record<string, string> = {}, code: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
    this.code = code;
  }
}

/** Fehlermeldung für die Anzeige, egal was geworfen wurde. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Da ist etwas schiefgegangen.';
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const init: RequestInit = { method, signal: signal ?? null };
  // POST immer als JSON: Die API lehnt andere Formate ab (Schutz vor fremden Formularen).
  const payload = body === undefined && method === 'POST' ? {} : body;
  if (payload !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(payload);
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'Der Server ist nicht erreichbar. Läuft die App noch?');
  }

  if (response.status === 204) return undefined as T;

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const info = (typeof data === 'object' && data !== null ? data : {}) as {
      error?: unknown;
      fields?: unknown;
      code?: unknown;
    };
    const message =
      typeof info.error === 'string'
        ? info.error
        : response.status >= 502 && response.status <= 504
          ? 'Die API ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.'
          : `Unerwartete Antwort des Servers (${response.status}).`;
    throw new ApiError(
      response.status,
      message,
      isStringRecord(info.fields) ? info.fields : {},
      typeof info.code === 'string' ? info.code : null,
    );
  }
  return data as T;
}

export const api = {
  songs: {
    list: () => request<Song[]>('GET', '/songs'),
    create: (input: SongInput) => request<Song>('POST', '/songs', input),
    update: (id: number, input: SongInput) => request<Song>('PUT', `/songs/${id}`, input),
    remove: (id: number) => request<void>('DELETE', `/songs/${id}`),
  },
  categories: {
    list: () => request<Category[]>('GET', '/categories'),
    create: (input: CategoryInput) => request<Category>('POST', '/categories', input),
    update: (id: number, input: CategoryInput) => request<Category>('PUT', `/categories/${id}`, input),
    remove: (id: number) => request<void>('DELETE', `/categories/${id}`),
  },
  playlists: {
    list: () => request<Playlist[]>('GET', '/playlists'),
    create: (input: PlaylistInput) => request<Playlist>('POST', '/playlists', input),
    update: (id: number, input: PlaylistInput) => request<Playlist>('PUT', `/playlists/${id}`, input),
    remove: (id: number) => request<void>('DELETE', `/playlists/${id}`),
    generate: (criteria: GeneratorCriteria, signal?: AbortSignal) =>
      request<GeneratorResult>('POST', '/playlists/generate', criteria, signal),
  },
  stats: () => request<Stats>('GET', '/stats'),
  config: () => request<AppConfig>('GET', '/config'),
  youtube: {
    status: () => request<YoutubeStatus>('GET', '/youtube/status'),
    disconnect: () => request<void>('POST', '/youtube/disconnect'),
    search: (
      hints: { q: string; title?: string | undefined; artist?: string | undefined; duration?: number | null | undefined },
      signal?: AbortSignal,
    ) => {
      const params = new URLSearchParams({ q: hints.q });
      if (hints.title) params.set('title', hints.title);
      if (hints.artist) params.set('artist', hints.artist);
      if (hints.duration) params.set('duration', String(hints.duration));
      return request<YoutubeSearchResult[]>('GET', `/youtube/search?${params}`, undefined, signal);
    },
    playlists: () => request<YoutubePlaylistSummary[]>('GET', '/youtube/playlists'),
    preview: (id: string) => request<YoutubeImportPreview>('GET', `/youtube/playlists/${encodeURIComponent(id)}`),
    import: (input: YoutubeImportInput) => request<YoutubeImportResult>('POST', '/youtube/import', input),
    saveLinks: (links: Array<{ songId: number; videoId: string }>) =>
      request<{ updated: number }>('POST', '/youtube/links', { links }),
    startExport: (playlistId: number, privacyStatus: YoutubePrivacy) =>
      request<YoutubeSyncJob>('POST', `/playlists/${playlistId}/youtube`, { privacyStatus }),
    job: (id: string) => request<YoutubeSyncJob>('GET', `/youtube/jobs/${encodeURIComponent(id)}`),
    unlink: (playlistId: number) => request<void>('DELETE', `/playlists/${playlistId}/youtube`),
  },
  lookup: (term: string, signal?: AbortSignal) =>
    request<LookupResult[]>('GET', `/lookup/itunes?term=${encodeURIComponent(term)}`, undefined, signal),
  /** Tempo auf songbpm.com; match ist null, wenn der Song dort unbekannt ist. */
  lookupBpm: (song: { title: string; artist: string; durationSeconds: number | null }, signal?: AbortSignal) => {
    const params = new URLSearchParams({ title: song.title, artist: song.artist });
    if (song.durationSeconds) params.set('duration', String(song.durationSeconds));
    return request<{ match: BpmMatch | null }>('GET', `/lookup/bpm?${params}`, undefined, signal);
  },
};

// Formen der API-Antworten. Das Frontend spiegelt sie in frontend/src/types.ts.

export interface Song {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number | null;
  releaseYear: number | null;
  /** Kann leer sein; jede Schreibweise kommt höchstens einmal vor. */
  genres: string[];
  bpm: number | null;
  /** 1 (ruhig) bis 5 (sehr energiegeladen) */
  energy: number | null;
  /** 1 bis 5 Sterne */
  rating: number | null;
  notes: string | null;
  appleMusicUrl: string | null;
  youtubeUrl: string | null;
  youtubeMusicUrl: string | null;
  artworkUrl: string | null;
  categoryIds: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  description: string | null;
  songCount: number;
}

export interface Playlist {
  id: number;
  name: string;
  description: string | null;
  /** Kriterien des Generators, falls die Playlist daraus entstanden ist. */
  criteria: unknown;
  /** Gegenstück im YouTube-Konto, falls die Playlist dorthin übertragen wurde. */
  youtubePlaylistId: string | null;
  youtubeSyncedAt: Date | null;
  /** Song-IDs in Abspielreihenfolge */
  songIds: number[];
  totalDurationSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Treffer der Online-Suche, mit dem sich das Song-Formular vorbelegen lässt. */
export interface LookupResult {
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number | null;
  releaseYear: number | null;
  genre: string | null;
  appleMusicUrl: string | null;
  artworkUrl: string | null;
}

export interface Stats {
  totals: {
    songCount: number;
    artistCount: number;
    categoryCount: number;
    playlistCount: number;
    totalDurationSeconds: number;
    averageDurationSeconds: number | null;
    averageRating: number | null;
    withoutCategory: number;
    withoutDuration: number;
    withoutRating: number;
    withoutEnergy: number;
    withoutLinks: number;
  };
  byCategory: Array<{
    id: number;
    name: string;
    color: string;
    songCount: number;
    totalDurationSeconds: number;
    averageRating: number | null;
    averageEnergy: number | null;
    averageBpm: number | null;
  }>;
  topArtists: Array<{ artist: string; songCount: number; totalDurationSeconds: number }>;
  byGenre: Array<{ genre: string | null; songCount: number }>;
  byDecade: Array<{ decade: number; songCount: number }>;
  byRating: Array<{ rating: number | null; songCount: number }>;
  byEnergy: Array<{ energy: number | null; songCount: number }>;
  /** Dauer in ganzen Minuten abgerundet; 7 steht für „7 Minuten und länger“. */
  byDurationMinute: Array<{ minute: number; songCount: number }>;
  categoryPairs: Array<{ firstId: number; secondId: number; songCount: number }>;
}

export interface YoutubeChannel {
  id: string;
  title: string;
  thumbnailUrl: string | null;
}

export interface YoutubeStatus {
  /** Client-ID und Client-Secret sind eingetragen. */
  configured: boolean;
  /** Diese Adresse muss beim OAuth-Client in der Google Cloud Console eingetragen sein. */
  redirectUri: string;
  connected: boolean;
  /** Google nimmt den gespeicherten Zugang nicht mehr an – neu verbinden. */
  expired: boolean;
  /** null: Zum Google-Konto gibt es keinen YouTube-Kanal (oder er war nicht abrufbar). */
  channel: YoutubeChannel | null;
  connectedAt: Date | null;
  quota: {
    unitsUsed: number;
    unitsLimit: number;
    searchesUsed: number;
    searchesLimit: number;
    resetsAt: Date;
  };
}

export interface YoutubeVideo {
  videoId: string;
  title: string;
  channelTitle: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
}

export interface YoutubeSearchResult extends YoutubeVideo {
  score: number;
  recommended: boolean;
}

export interface YoutubePlaylistSummary {
  /** ID bei YouTube oder „mag-ich“ für die als „Mag ich“ markierten Videos */
  id: string;
  title: string;
  description: string | null;
  itemCount: number | null;
  thumbnailUrl: string | null;
  privacyStatus: string | null;
  url: string;
  musicUrl: string | null;
}

export interface YoutubeImportCandidate {
  position: number;
  videoId: string;
  /** false: gelöscht, privat oder gesperrt – lässt sich nicht übernehmen */
  available: boolean;
  videoTitle: string;
  channelTitle: string | null;
  /** Aus dem Videotitel gelesen */
  title: string;
  artist: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  /** Kategorie „Musik“ bei YouTube; null, wenn unbekannt */
  isMusic: boolean | null;
  /** Position eines früheren Eintrags mit demselben Video */
  duplicateOf: number | null;
  /** Passender Song in der Bibliothek */
  match: { songId: number; title: string; artist: string; reason: 'video' | 'title' } | null;
}

export interface YoutubeImportPreview {
  playlist: YoutubePlaylistSummary;
  items: YoutubeImportCandidate[];
}

export interface YoutubeImportResult {
  createdSongs: number;
  /** Vorhandene Songs, die dabei einen YouTube-Link bekommen haben */
  linkedSongs: number;
  /** Vorhandene Songs, die schon verlinkt waren und unverändert übernommen wurden */
  existingSongs: number;
  playlistId: number | null;
}

export interface YoutubeSyncResult {
  youtubePlaylistId: string;
  url: string;
  musicUrl: string;
  /** Die Playlist wurde bei YouTube neu angelegt. */
  created: boolean;
  /** Die verknüpfte Playlist gab es auf YouTube nicht mehr; sie wurde neu angelegt. */
  recreated: boolean;
  added: number;
  removed: number;
  moved: number;
  /** Die Reihenfolge ließ sich nicht übernehmen (Playlist auf YouTube automatisch sortiert). */
  orderSkipped: boolean;
  /** Songs, deren Video YouTube nicht (mehr) kennt */
  unavailable: Array<{ songId: number; title: string; artist: string }>;
  /** Songs ohne YouTube-Link – sie fehlen in der YouTube-Playlist */
  withoutVideo: Array<{ songId: number; title: string; artist: string }>;
}

export interface YoutubeSyncJob {
  id: string;
  playlistId: number;
  status: 'running' | 'done' | 'failed';
  done: number;
  total: number;
  result: YoutubeSyncResult | null;
  error: { message: string; code: string | null } | null;
  startedAt: Date;
}

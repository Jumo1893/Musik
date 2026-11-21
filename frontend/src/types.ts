// Formen der API-Antworten; Gegenstück zu backend/src/types.ts.

export interface Song {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number | null;
  releaseYear: number | null;
  /** Kann leer sein; jede Schreibweise kommt höchstens einmal vor. */
  genres: string[];
  /** Hauptgenres der Genres (Rock für Alternative Rock), in der Reihenfolge der Genre-Liste */
  mainGenres: string[];
  bpm: number | null;
  /** Tonart, z. B. „A“ oder „C♯/D♭“ */
  musicalKey: string | null;
  /** Text gilt als explizit; null: unbekannt */
  explicit: boolean | null;
  /** „Deutsch“, „Englisch“, „Instrumental“ oder eine andere Sprache; null: keine Angabe */
  language: string | null;
  /** 1 (ruhig) bis 5 (sehr energiegeladen) */
  energy: number | null;
  /** 1 (lieber zuhören) bis 5 (lauthals mitsingen) */
  singAlong: number | null;
  /** 1 bis 5 Sterne */
  rating: number | null;
  notes: string | null;
  appleMusicUrl: string | null;
  youtubeUrl: string | null;
  youtubeMusicUrl: string | null;
  artworkUrl: string | null;
  categoryIds: number[];
  createdAt: string;
  updatedAt: string;
}

/** Was beim Anlegen und Ändern eines Songs gesendet wird. */
export type SongInput = Omit<Song, 'id' | 'mainGenres' | 'createdAt' | 'updatedAt'>;

/** Eintrag der Merkliste: ein Song, der später erfasst werden soll. */
export interface NotedSong {
  id: number;
  /** „Interpret – Titel“ oder ein Link, so wie eingegeben */
  text: string;
  createdAt: string;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  description: string | null;
  songCount: number;
}

export type CategoryInput = Pick<Category, 'name' | 'color' | 'description'>;

export type PlaylistOrder = 'shuffle' | 'best-first' | 'energy-up' | 'energy-down' | 'energy-arc';

export interface GeneratorCriteria {
  includeCategoryIds: number[];
  matchMode: 'any' | 'all';
  excludeCategoryIds: number[];
  /** Einzelne Songs, die nicht vorgeschlagen werden sollen. */
  excludeSongIds: number[];
  genres: string[];
  minRating: number | null;
  energyMin: number | null;
  energyMax: number | null;
  singAlongMin: number | null;
  singAlongMax: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  /** Songs mit explizitem Text weglassen (unbekannte bleiben dabei) */
  excludeExplicit: boolean;
  /** Erlaubte Sprachen (auch „Instrumental“); leer heißt „egal“ */
  languages: string[];
  targetMinutes: number | null;
  maxSongs: number | null;
  maxPerArtist: number | null;
  order: PlaylistOrder;
  seed: number | null;
}

export interface GeneratorResult {
  songIds: number[];
  candidateCount: number;
  seed: number;
}

export interface Playlist {
  id: number;
  name: string;
  description: string | null;
  criteria: GeneratorCriteria | null;
  /** Gegenstück im YouTube-Konto, falls die Playlist dorthin übertragen wurde */
  youtubePlaylistId: string | null;
  youtubeSyncedAt: string | null;
  /** Song-IDs in Abspielreihenfolge */
  songIds: number[];
  totalDurationSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistInput {
  name: string;
  description: string | null;
  songIds: number[];
  criteria?: GeneratorCriteria | null;
}

/** Einstellungen des Servers, die die Oberfläche braucht. */
export interface AppConfig {
  /** Zweistelliger Ländercode des Apple-Music-Katalogs, z. B. „de“ */
  appleMusicStorefront: string;
}

export interface LookupResult {
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number | null;
  releaseYear: number | null;
  genre: string | null;
  appleMusicUrl: string | null;
  artworkUrl: string | null;
  /** Hörprobe von Apple (30 Sekunden), nur zum Abspielen im Browser */
  previewUrl: string | null;
  /** Text gilt laut Apple als explizit; null: unbekannt */
  explicit: boolean | null;
}

/** Ergebnis für einen eingefügten Link zu einem Song. */
export type LinkLookupResult =
  | { kind: 'apple'; result: LookupResult }
  | {
      kind: 'youtube';
      videoId: string;
      /** Bereinigter Link ohne Playlist- und Zeitangabe */
      youtubeUrl: string;
      /** null: YouTube kennt das Video nicht (gelöscht, privat) oder war nicht erreichbar */
      video: { title: string; channel: string | null; thumbnailUrl: string | null } | null;
      /** Aus dem Videotitel gelesen */
      parsed: { title: string; artist: string } | null;
      /** Katalog-Treffer, der zum Video passt */
      best: LookupResult | null;
      /** Weitere Treffer der Katalogsuche */
      results: LookupResult[];
    };

/** YouTube-Video zu einem Song, gefunden ohne Konto und ohne Kontingent. */
export interface YoutubeLinkMatch {
  videoId: string;
  url: string;
  source: 'wikidata' | 'musicbrainz';
  /** Eintrag bei der Quelle (Wikidata-Seite oder MusicBrainz-Aufnahme) */
  sourceUrl: string;
  videoTitle: string;
  channel: string | null;
  thumbnailUrl: string | null;
}

export interface YoutubeLinkFinding extends YoutubeLinkMatch {
  songId: number;
}

/** Fund von „Erscheinungsjahre prüfen“: MusicBrainz kennt ein früheres Jahr (oder das Jahr fehlt). */
export interface ReleaseYearFinding {
  songId: number;
  currentYear: number | null;
  firstReleaseYear: number;
  /** Aufnahme bei MusicBrainz */
  sourceUrl: string;
}

/** Auftrag, der die Bibliothek im Hintergrund durchgeht. */
export interface LibraryJob<T = unknown> {
  id: string;
  kind: 'youtube-links' | 'release-years';
  status: 'running' | 'done' | 'failed' | 'cancelled';
  done: number;
  total: number;
  results: T[];
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** Eintrag der Genre-Liste: Hauptgenre wie Rock oder Untergenre wie Alternative Rock. */
export interface GenreInfo {
  name: string;
  isMain: boolean;
  /** Hauptgenres eines Untergenres (bei Hauptgenres leer) */
  mainGenres: string[];
  /** Hauptgenres, in deren kurzer Liste das Untergenre steht (ohne „Mehr anzeigen“ sichtbar) */
  featuredIn: string[];
  /** Selbst eingetragen, nicht aus der Genre-Liste */
  custom: boolean;
  /** Andere Schreibweisen, z. B. „rap“ für Hip-Hop */
  aliases: string[];
}

/** Genres eines Songs laut MusicBrainz. */
export interface GenreMatch {
  /** Zum Übernehmen, das wichtigste zuerst (höchstens drei) */
  genres: string[];
  /** Weitere Genres, die MusicBrainz für den Song nennt */
  suggestions: string[];
  /** Jahr der frühesten Single, EP oder des frühesten Albums (ohne Sampler, Live- und Remix-Alben) */
  firstReleaseYear: number | null;
  /** Gefundene Aufnahme */
  title: string;
  artist: string;
  /** Seite der Aufnahme auf musicbrainz.org */
  url: string;
}

/** Tempo eines Songs laut songbpm.com, samt dem Eintrag, von dem es stammt. */
export interface BpmMatch {
  bpm: number;
  /** Tonart, z. B. „A“ oder „C♯/D♭“ */
  key: string | null;
  title: string;
  artist: string;
  durationSeconds: number | null;
  /** Seite des Songs auf songbpm.com */
  url: string;
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
    withoutSingAlong: number;
    withoutLanguage: number;
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
    averageSingAlong: number | null;
    averageBpm: number | null;
  }>;
  topArtists: Array<{ artist: string; songCount: number; totalDurationSeconds: number }>;
  /** Songs je Hauptgenre; genre null: Songs ohne Hauptgenre */
  byMainGenre: Array<{ genre: string | null; songCount: number }>;
  /** Songs je Untergenre (und eigenem Genre); genre null: Songs ohne Untergenre */
  bySubgenre: Array<{ genre: string | null; songCount: number }>;
  byDecade: Array<{ decade: number; songCount: number }>;
  byRating: Array<{ rating: number | null; songCount: number }>;
  byEnergy: Array<{ energy: number | null; songCount: number }>;
  bySingAlong: Array<{ singAlong: number | null; songCount: number }>;
  /** Songs je Sprache; language null: ohne Angabe */
  byLanguage: Array<{ language: string | null; songCount: number }>;
  /** Dauer in ganzen Minuten abgerundet; 7 steht für „7 Minuten und länger“. */
  byDurationMinute: Array<{ minute: number; songCount: number }>;
  categoryPairs: Array<{ firstId: number; secondId: number; songCount: number }>;
}

// --- YouTube (Gegenstück zu backend/src/types.ts) ---------------------------

export interface YoutubeChannel {
  id: string;
  title: string;
  thumbnailUrl: string | null;
}

export interface YoutubeStatus {
  configured: boolean;
  /** Diese Adresse muss beim OAuth-Client in der Google Cloud Console eingetragen sein. */
  redirectUri: string;
  connected: boolean;
  expired: boolean;
  channel: YoutubeChannel | null;
  connectedAt: string | null;
  quota: {
    unitsUsed: number;
    unitsLimit: number;
    searchesUsed: number;
    searchesLimit: number;
    resetsAt: string;
  };
}

export interface YoutubeSearchResult {
  videoId: string;
  title: string;
  channelTitle: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  score: number;
  /** Bester Treffer, der gut genug passt, um ihn ohne Nachsehen zu übernehmen */
  recommended: boolean;
}

export interface YoutubePlaylistSummary {
  /** ID bei YouTube oder „mag-ich“ */
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
  available: boolean;
  videoTitle: string;
  channelTitle: string | null;
  title: string;
  artist: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  isMusic: boolean | null;
  duplicateOf: number | null;
  match: { songId: number; title: string; artist: string; reason: 'video' | 'title' } | null;
}

export interface YoutubeImportPreview {
  playlist: YoutubePlaylistSummary;
  items: YoutubeImportCandidate[];
}

export type YoutubeImportItem =
  | { action: 'link'; videoId: string; songId: number }
  | {
      action: 'create';
      videoId: string;
      title: string;
      artist: string;
      durationSeconds: number | null;
      thumbnailUrl: string | null;
    };

export interface YoutubeImportInput {
  playlist: { name: string; description: string | null } | null;
  categoryIds: number[];
  items: YoutubeImportItem[];
}

export interface YoutubeImportResult {
  createdSongs: number;
  linkedSongs: number;
  existingSongs: number;
  playlistId: number | null;
}

export type YoutubePrivacy = 'private' | 'unlisted' | 'public';

export interface YoutubeSyncResult {
  youtubePlaylistId: string;
  url: string;
  musicUrl: string;
  created: boolean;
  recreated: boolean;
  added: number;
  removed: number;
  moved: number;
  orderSkipped: boolean;
  unavailable: Array<{ songId: number; title: string; artist: string }>;
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
  startedAt: string;
}

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
  /** Hauptgenres der Genres (Rock für Alternative Rock), in der Reihenfolge der Genre-Liste */
  mainGenres: string[];
  bpm: number | null;
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

/** Ergebnis für einen eingefügten Link zu einem Song. */
export type LinkLookupResult =
  | {
      /** Apple-Music-Link: der Song aus dem Katalog, mit bereinigtem Link */
      kind: 'apple';
      result: LookupResult;
    }
  | {
      /** YouTube- oder YouTube-Music-Link */
      kind: 'youtube';
      videoId: string;
      /** Bereinigter Link ohne Playlist- und Zeitangabe */
      youtubeUrl: string;
      /** null: YouTube kennt das Video nicht (gelöscht, privat) oder war nicht erreichbar */
      video: { title: string; channel: string | null; thumbnailUrl: string | null } | null;
      /** Aus dem Videotitel gelesen */
      parsed: { title: string; artist: string } | null;
      /** Katalog-Treffer, der zum Video passt („Ist es dieser?“) */
      best: LookupResult | null;
      /** Weitere Treffer der Katalogsuche */
      results: LookupResult[];
    };

/** YouTube-Video zu einem Song, gefunden ohne Konto und ohne Kontingent. */
export interface YoutubeLinkMatch {
  videoId: string;
  /** https://www.youtube.com/watch?v=… */
  url: string;
  /** Woher der Link stammt */
  source: 'wikidata' | 'musicbrainz';
  /** Eintrag bei der Quelle (Wikidata-Seite oder MusicBrainz-Aufnahme) */
  sourceUrl: string;
  /** Titel, Kanal und Vorschaubild laut YouTube (geprüft über oEmbed) */
  videoTitle: string;
  channel: string | null;
  thumbnailUrl: string | null;
}

/** Fund eines Hintergrundauftrags „Fehlende YouTube-Links ergänzen“. */
export interface YoutubeLinkFinding extends YoutubeLinkMatch {
  songId: number;
}

/** Auftrag, der die ganze Bibliothek im Hintergrund durchgeht. */
export interface LibraryJob<T = unknown> {
  id: string;
  kind: 'youtube-links';
  status: 'running' | 'done' | 'failed' | 'cancelled';
  /** So viele Songs sind schon durch … */
  done: number;
  /** … von so vielen */
  total: number;
  /** Funde, laufend ergänzt */
  results: T[];
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

/** Eintrag der Genre-Liste für Auswahllisten. */
export interface GenreInfo {
  name: string;
  /** Hauptgenre wie Rock; sonst Untergenre wie Alternative Rock */
  isMain: boolean;
  /** Hauptgenres eines Untergenres (bei Hauptgenres leer) */
  mainGenres: string[];
  /** Hauptgenres, in deren kurzer Liste das Untergenre steht (Auswahl zeigt es ohne „Mehr anzeigen“) */
  featuredIn: string[];
  /** Selbst eingetragen, nicht aus der Genre-Liste */
  custom: boolean;
  /** Andere Schreibweisen, z. B. „hip hop“ */
  aliases: string[];
}

/** Genres eines Songs laut MusicBrainz. */
export interface GenreMatch {
  /** Zum Übernehmen, das wichtigste zuerst (höchstens drei) */
  genres: string[];
  /** Weitere Genres, die MusicBrainz für den Song nennt */
  suggestions: string[];
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

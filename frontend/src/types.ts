// Formen der API-Antworten; Gegenstück zu backend/src/types.ts.

export interface Song {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number | null;
  releaseYear: number | null;
  genre: string | null;
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
  createdAt: string;
  updatedAt: string;
}

/** Was beim Anlegen und Ändern eines Songs gesendet wird. */
export type SongInput = Omit<Song, 'id' | 'createdAt' | 'updatedAt'>;

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
  yearFrom: number | null;
  yearTo: number | null;
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

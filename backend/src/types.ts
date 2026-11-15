// Formen der API-Antworten. Das Frontend spiegelt sie in frontend/src/types.ts.

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

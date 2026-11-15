// Validierung aller Eingaben der API. Leere Texte und fehlende Felder werden
// einheitlich zu NULL, damit in der Datenbank nie leere Zeichenketten landen.

import * as z from 'zod';

z.config(z.locales.de());

const idSchema = z.number().int().positive().max(2_147_483_647);

function unique(ids: number[]): number[] {
  return [...new Set(ids)];
}

const idList = (maxLength: number) => z.array(idSchema).max(maxLength).default([]).transform(unique);

const requiredText = (maxLength: number, messageWhenEmpty: string) =>
  z.string({ error: messageWhenEmpty }).trim().min(1, messageWhenEmpty).max(maxLength);

const optionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .nullish()
    .transform((value) => (value ? value : null));

const optionalInt = (min: number, max: number) =>
  z
    .number()
    .int()
    .min(min)
    .max(max)
    .nullish()
    .transform((value) => value ?? null);

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function hostMatches(hostname: string, allowedDomains: readonly string[]): boolean {
  const host = hostname.toLowerCase();
  return allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * Optionaler Link. Nur http(s) ist erlaubt – so kann nie ein „javascript:“-Link
 * gespeichert und später im Frontend als anklickbarer Link ausgegeben werden.
 */
const optionalUrl = (label: string, allowedDomains?: readonly string[]) =>
  z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((value) => (value ? value : null))
    .refine(
      (value) => value === null || parseHttpUrl(value) !== null,
      `${label}: Bitte einen vollständigen Link angeben, der mit https:// beginnt.`,
    )
    .refine(
      (value) => {
        if (value === null || !allowedDomains) return true;
        const url = parseHttpUrl(value);
        return url === null || hostMatches(url.hostname, allowedDomains);
      },
      `${label}: Der Link gehört nicht zu ${(allowedDomains ?? []).join(' oder ')}.`,
    );

export const APPLE_MUSIC_DOMAINS = ['music.apple.com', 'itunes.apple.com', 'apple.co'] as const;
export const YOUTUBE_DOMAINS = ['youtube.com', 'youtu.be'] as const;
export const YOUTUBE_MUSIC_DOMAINS = ['music.youtube.com'] as const;

export const songInputSchema = z.object({
  title: requiredText(300, 'Bitte einen Titel angeben.'),
  artist: requiredText(300, 'Bitte einen Interpreten angeben.'),
  album: optionalText(300),
  durationSeconds: optionalInt(1, 86_399),
  releaseYear: optionalInt(1000, 2200),
  genre: optionalText(100),
  bpm: optionalInt(20, 400),
  energy: optionalInt(1, 5),
  rating: optionalInt(1, 5),
  notes: optionalText(5000),
  appleMusicUrl: optionalUrl('Apple Music', APPLE_MUSIC_DOMAINS),
  youtubeUrl: optionalUrl('YouTube', YOUTUBE_DOMAINS),
  youtubeMusicUrl: optionalUrl('YouTube Music', YOUTUBE_MUSIC_DOMAINS),
  artworkUrl: optionalUrl('Cover'),
  categoryIds: idList(200),
});
export type SongInput = z.infer<typeof songInputSchema>;

export const categoryInputSchema = z.object({
  name: requiredText(60, 'Bitte einen Namen angeben.'),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Die Farbe muss ein Hex-Wert wie #2a78d6 sein.')
    .transform((value) => value.toLowerCase())
    .default('#2a78d6'),
  description: optionalText(500),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const PLAYLIST_ORDERS = ['shuffle', 'best-first', 'energy-up', 'energy-down', 'energy-arc'] as const;

export const generatorCriteriaSchema = z.object({
  /** Gewünschte Kategorien; leer bedeutet „egal“. */
  includeCategoryIds: idList(200),
  /** any: mindestens eine der gewünschten Kategorien, all: alle. */
  matchMode: z.enum(['any', 'all']).default('any'),
  /** Songs mit einer dieser Kategorien kommen nie in die Playlist. */
  excludeCategoryIds: idList(200),
  /** Einzelne Songs, die nicht vorgeschlagen werden sollen. */
  excludeSongIds: idList(5000),
  /** Erlaubte Genres; leer bedeutet „egal“. */
  genres: z.array(z.string().trim().min(1).max(100)).max(200).default([]),
  minRating: optionalInt(1, 5),
  energyMin: optionalInt(1, 5),
  energyMax: optionalInt(1, 5),
  yearFrom: optionalInt(1000, 2200),
  yearTo: optionalInt(1000, 2200),
  targetMinutes: optionalInt(1, 1440),
  maxSongs: optionalInt(1, 1000),
  maxPerArtist: optionalInt(1, 100),
  order: z.enum(PLAYLIST_ORDERS).default('shuffle'),
  /** Startwert des Zufallsgenerators; derselbe Wert liefert bei gleichem Bestand dieselbe Playlist. */
  seed: optionalInt(0, 4_294_967_295),
});
export type GeneratorCriteria = z.infer<typeof generatorCriteriaSchema>;

export const playlistInputSchema = z.object({
  name: requiredText(200, 'Bitte einen Namen angeben.'),
  description: optionalText(2000),
  songIds: idList(5000),
  criteria: generatorCriteriaSchema.nullish().transform((value) => value ?? null),
});
export type PlaylistInput = z.infer<typeof playlistInputSchema>;

export const lookupQuerySchema = z.object({
  term: z
    .string({ error: 'Bitte einen Suchbegriff angeben.' })
    .trim()
    .min(2, 'Der Suchbegriff ist zu kurz.')
    .max(200),
});

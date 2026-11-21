// Zugriff auf die Web-API von MusicBrainz (https://musicbrainz.org/doc/MusicBrainz_API).
// Sie braucht keinen Schlüssel, verlangt aber einen aussagekräftigen User-Agent und
// höchstens eine Anfrage pro Sekunde. Ist der Server ausgelastet, antwortet er mit 503 –
// dann kurz warten und noch einmal fragen. Gesendet werden nur Titel, Interpret und IDs.

import * as z from 'zod';
import { HttpError } from '../errors.ts';

const BASE_URL = 'https://musicbrainz.org';
const USER_AGENT = 'MusikBibliothek/0.1 (selbst gehostete Musik-Bibliothek)';
const TIMEOUT_MS = 10_000;
/** Abstand zwischen zwei Anfragen; MusicBrainz erlaubt eine pro Sekunde. */
const MIN_INTERVAL_MS = 1100;
/** So oft wird eine Anfrage wiederholt, die an der Auslastung scheitert (503). */
const RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const tagSchema = z.object({ name: z.string(), count: z.number() });

const releaseGroupRefSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  'primary-type': z.string().nullish(),
  'secondary-types': z.array(z.string()).nullish(),
});

const artistCreditSchema = z
  .array(
    z.object({
      name: z.string(),
      joinphrase: z.string().nullish(),
      artist: z.object({ id: z.string(), name: z.string() }),
    }),
  )
  .nullish();

const recordingSchema = z.object({
  id: z.string(),
  score: z.number().nullish(),
  title: z.string(),
  /** Unterscheidet Aufnahmen gleichen Titels, etwa „live, 1964-07-24: …“ */
  disambiguation: z.string().nullish(),
  length: z.number().nullish(),
  /** Datum der ersten Veröffentlichung dieser Aufnahme */
  'first-release-date': z.string().nullish(),
  'artist-credit': artistCreditSchema,
  releases: z
    .array(
      z.object({
        id: z.string(),
        date: z.string().nullish(),
        'release-group': releaseGroupRefSchema.nullish(),
      }),
    )
    .nullish(),
  tags: z.array(tagSchema).nullish(),
});

const releaseGroupSchema = z.object({ id: z.string(), title: z.string().nullish(), tags: z.array(tagSchema).nullish() });
/** Treffer der Suche nach Veröffentlichungen (Single, EP …) */
const releaseGroupHitSchema = z.object({
  id: z.string(),
  title: z.string().nullish(),
  'first-release-date': z.string().nullish(),
  'primary-type': z.string().nullish(),
  'secondary-types': z.array(z.string()).nullish(),
  'artist-credit': artistCreditSchema,
});
const relationsSchema = z.object({
  relations: z
    .array(z.object({ type: z.string().nullish(), url: z.object({ resource: z.string() }).nullish() }))
    .nullish(),
});
const artistSchema = z.object({ id: z.string(), name: z.string(), tags: z.array(tagSchema).nullish() });

export type MbTag = z.infer<typeof tagSchema>;
export type MbRecording = z.infer<typeof recordingSchema>;
export type MbReleaseGroup = z.infer<typeof releaseGroupSchema>;
export type MbReleaseGroupHit = z.infer<typeof releaseGroupHitSchema>;
export type MbArtist = z.infer<typeof artistSchema>;

/** Text für eine Lucene-Phrase: Anführungszeichen und Backslash maskieren. */
function phrase(text: string): string {
  return `"${text.replace(/[\\"]/g, '\\$&')}"`;
}

/** IDs von MusicBrainz sind UUIDs; anderes gehört nicht in eine Suche. */
const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface MusicBrainzOptions {
  fetchFn?: typeof fetch;
  baseUrl?: string;
  minIntervalMs?: number;
  retryDelayMs?: number;
}

export class MusicBrainzClient {
  readonly #fetch: typeof fetch;
  readonly #baseUrl: string;
  readonly #minIntervalMs: number;
  readonly #retryDelayMs: number;
  /** Frühester Zeitpunkt für die nächste Anfrage */
  #nextSlot = 0;

  constructor(options: MusicBrainzOptions = {}) {
    this.#fetch = options.fetchFn ?? fetch;
    this.#baseUrl = options.baseUrl ?? BASE_URL;
    this.#minIntervalMs = options.minIntervalMs ?? MIN_INTERVAL_MS;
    this.#retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  }

  recordingUrl(id: string): string {
    return new URL(`/recording/${id}`, this.#baseUrl).toString();
  }

  /** Aufnahmen mit diesem Titel von diesem Interpreten, samt Veröffentlichungen und Tags. */
  async searchRecordings(title: string, artist: string, limit = 25): Promise<MbRecording[]> {
    const body = await this.#get('recording', `recording:${phrase(title)} AND artist:${phrase(artist)}`, limit);
    return parse(z.object({ recordings: z.array(recordingSchema) }), body).recordings;
  }

  /** Singles und EPs mit diesem Titel von diesem Interpreten, samt Datum der ersten Veröffentlichung. */
  async searchSingles(title: string, artist: string, limit = 25): Promise<MbReleaseGroupHit[]> {
    const body = await this.#get(
      'release-group',
      `releasegroup:${phrase(title)} AND artist:${phrase(artist)} AND (primarytype:single OR primarytype:ep)`,
      limit,
    );
    return parse(z.object({ 'release-groups': z.array(releaseGroupHitSchema) }), body)['release-groups'];
  }

  /** Veröffentlichungen (Album, Single …) mit ihren Tags. */
  async releaseGroups(ids: readonly string[]): Promise<MbReleaseGroup[]> {
    const valid = ids.filter((id) => MBID.test(id));
    if (valid.length === 0) return [];
    const body = await this.#get('release-group', valid.map((id) => `rgid:${id}`).join(' OR '), valid.length);
    return parse(z.object({ 'release-groups': z.array(releaseGroupSchema) }), body)['release-groups'];
  }

  /** Interpreten mit ihren Tags. */
  async artists(ids: readonly string[]): Promise<MbArtist[]> {
    const valid = ids.filter((id) => MBID.test(id));
    if (valid.length === 0) return [];
    const body = await this.#get('artist', valid.map((id) => `arid:${id}`).join(' OR '), valid.length);
    return parse(z.object({ artists: z.array(artistSchema) }), body).artists;
  }

  /** Links einer Aufnahme zum kostenlosen Anhören („free streaming“, „streaming“), etwa bei YouTube. */
  async recordingStreamingUrls(id: string): Promise<string[]> {
    if (!MBID.test(id)) return [];
    const url = new URL(`/ws/2/recording/${id}`, this.#baseUrl);
    url.searchParams.set('inc', 'url-rels');
    url.searchParams.set('fmt', 'json');
    const { relations } = parse(relationsSchema, await this.#request(url, 'recording'));
    return (relations ?? [])
      .filter((relation) => relation.type === 'free streaming' || relation.type === 'streaming')
      .map((relation) => relation.url?.resource)
      .filter((resource) => typeof resource === 'string');
  }

  async #get(entity: string, query: string, limit: number): Promise<unknown> {
    const url = new URL(`/ws/2/${entity}`, this.#baseUrl);
    url.searchParams.set('query', query);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('fmt', 'json');
    return this.#request(url, entity);
  }

  async #request(url: URL, entity: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      await this.#waitForSlot();
      let response: Response;
      try {
        response = await this.#fetch(url, {
          headers: { accept: 'application/json', 'user-agent': USER_AGENT },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        console.warn('MusicBrainz nicht erreichbar:', err instanceof Error ? err.message : err);
        throw unreachable();
      }
      if (response.status === 503 && attempt < RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, this.#retryDelayMs));
        continue;
      }
      if (!response.ok) {
        console.warn(`MusicBrainz antwortet mit HTTP ${response.status} auf ${entity}-Suche`);
        throw unreachable();
      }
      return response.json().catch(() => {
        throw new HttpError(502, 'MusicBrainz hat eine unerwartete Antwort geliefert.');
      });
    }
  }

  /** Reiht die Anfrage ein, sodass zwischen zwei Anfragen mindestens der Mindestabstand liegt. */
  async #waitForSlot(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.#nextSlot);
    this.#nextSlot = slot + this.#minIntervalMs;
    if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
  }
}

/** Prüft eine Antwort; passt sie nicht, ist das ein Problem von MusicBrainz, nicht der Eingabe. */
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(502, 'MusicBrainz hat eine unerwartete Antwort geliefert.');
  return result.data;
}

function unreachable(): HttpError {
  return new HttpError(502, 'MusicBrainz ist gerade nicht erreichbar. Die Genres lassen sich auch von Hand eintragen.');
}

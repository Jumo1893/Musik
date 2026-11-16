// Nachbau der Google-Dienste, die die App verwendet: OAuth-Anmeldung und die benötigten
// Teile der YouTube Data API v3. Für die API-Tests (als Ersatz für fetch) und zum
// Ausprobieren der YouTube-Funktionen ohne Google-Konto (fakeGoogleServer.ts).
// Bildet nur ab, was die App braucht – keine vollständige Simulation.

export interface FakeVideo {
  id: string;
  title: string;
  channelTitle: string;
  /** ISO-8601-Dauer, z. B. PT3M33S */
  duration: string;
  categoryId: string;
}

export interface FakePlaylistItem {
  id: string;
  videoId: string;
}

export interface FakePlaylist {
  id: string;
  title: string;
  description: string;
  privacyStatus: string;
  items: FakePlaylistItem[];
}

export const FAKE_SCOPE = 'https://www.googleapis.com/auth/youtube';

/** Was die App an die API schickt (nur die Felder, die der Nachbau auswertet). */
interface RequestBody {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    playlistId?: string;
    position?: number;
    resourceId?: { videoId?: string };
  };
  status?: { privacyStatus?: string };
}

/** Videokatalog: einige bekannte Musikvideos, ein paar Ablenkungen für die Suche. */
export const FAKE_VIDEOS: FakeVideo[] = [
  { id: 'dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)', channelTitle: 'Rick Astley', duration: 'PT3M33S', categoryId: '10' },
  { id: 'fJ9rUzIMcZQ', title: 'Queen – Bohemian Rhapsody (Official Video Remastered)', channelTitle: 'Queen Official', duration: 'PT5M59S', categoryId: '10' },
  { id: 'hTWKbfoikeg', title: 'Nirvana - Smells Like Teen Spirit (Official Music Video)', channelTitle: 'Nirvana', duration: 'PT5M1S', categoryId: '10' },
  { id: 'YQHsXMglC9A', title: 'Adele - Hello (Official Music Video)', channelTitle: 'AdeleVEVO', duration: 'PT6M7S', categoryId: '10' },
  { id: 'adeleHello1', title: 'Hello', channelTitle: 'Adele - Topic', duration: 'PT4M56S', categoryId: '10' },
  { id: 'helloCover1', title: 'Hello - Adele (Piano Cover)', channelTitle: 'Klavierkanal', duration: 'PT4M40S', categoryId: '10' },
  { id: 'JGwWNGJdvx8', title: 'Ed Sheeran - Shape of You (Official Music Video)', channelTitle: 'Ed Sheeran', duration: 'PT4M24S', categoryId: '10' },
  { id: 'shapeCover1', title: 'Shape of You (Acoustic Cover) | Ed Sheeran', channelTitle: 'Coverband', duration: 'PT3M50S', categoryId: '10' },
  { id: 'OPf0YbXqDm0', title: 'Mark Ronson - Uptown Funk (Official Video) ft. Bruno Mars', channelTitle: 'Mark Ronson', duration: 'PT4M31S', categoryId: '10' },
  { id: '9bZkp7q19f0', title: 'PSY - GANGNAM STYLE(강남스타일) M/V', channelTitle: 'officialpsy', duration: 'PT4M13S', categoryId: '10' },
  { id: 'kJQP7kiw5Fk', title: 'Luis Fonsi - Despacito ft. Daddy Yankee', channelTitle: 'LuisFonsiVEVO', duration: 'PT4M42S', categoryId: '10' },
  { id: 'RgKAFK5djSk', title: 'Wiz Khalifa - See You Again ft. Charlie Puth [Official Video] Furious 7 Soundtrack', channelTitle: 'Wiz Khalifa', duration: 'PT3M58S', categoryId: '10' },
  { id: '09R8_2nJtjg', title: 'Maroon 5 - Sugar (Official Music Video)', channelTitle: 'Maroon 5', duration: 'PT5M2S', categoryId: '10' },
  { id: 'CevxZvSJLk8', title: 'Katy Perry - Roar (Official)', channelTitle: 'Katy Perry', duration: 'PT4M30S', categoryId: '10' },
  { id: 'eyeTiger001', title: 'Survivor - Eye Of The Tiger (Official HD Video)', channelTitle: 'Survivor', duration: 'PT4M5S', categoryId: '10' },
  { id: 'loseYrself1', title: 'Lose Yourself', channelTitle: 'Eminem - Topic', duration: 'PT5M26S', categoryId: '10' },
  { id: 'madWorld001', title: 'Gary Jules - Mad World', channelTitle: 'Gary Jules', duration: 'PT3M10S', categoryId: '10' },
  { id: 'soundSilenc', title: 'Simon & Garfunkel - The Sound of Silence (Audio)', channelTitle: 'Simon & Garfunkel', duration: 'PT3M6S', categoryId: '10' },
  { id: 'africaToto1', title: 'Toto - Africa (Official HD Video)', channelTitle: 'TotoVEVO', duration: 'PT4M55S', categoryId: '10' },
  { id: 'takeOnMe001', title: 'a-ha - Take On Me (Official Video) [Remastered in 4K]', channelTitle: 'a-ha', duration: 'PT4M4S', categoryId: '10' },
  { id: 'takeOnMeKar', title: 'Take On Me - Karaoke Version', channelTitle: 'Karaoke Hits', duration: 'PT3M50S', categoryId: '10' },
  { id: 'catVideo123', title: 'Lustige Katzen 2026', channelTitle: 'Katzenkanal', duration: 'PT10M2S', categoryId: '15' },
];

function seedPlaylists(): FakePlaylist[] {
  return [
    {
      id: 'PLfakeFavorites',
      title: 'Lieblingssongs',
      description: 'Was ich immer hören kann',
      privacyStatus: 'private',
      items: [
        { id: 'PLIfav1', videoId: 'dQw4w9WgXcQ' },
        { id: 'PLIfav2', videoId: 'YQHsXMglC9A' },
        { id: 'PLIfav3', videoId: 'deletedVid1' },
        { id: 'PLIfav4', videoId: 'JGwWNGJdvx8' },
        { id: 'PLIfav5', videoId: 'adeleHello1' },
        { id: 'PLIfav6', videoId: 'dQw4w9WgXcQ' },
      ],
    },
    {
      id: 'PLfakeWorkout',
      title: 'Workout',
      description: '',
      privacyStatus: 'public',
      items: [
        { id: 'PLIwork1', videoId: 'hTWKbfoikeg' },
        { id: 'PLIwork2', videoId: 'OPf0YbXqDm0' },
        { id: 'PLIwork3', videoId: '9bZkp7q19f0' },
        { id: 'PLIwork4', videoId: 'kJQP7kiw5Fk' },
        { id: 'PLIwork5', videoId: 'CevxZvSJLk8' },
        { id: 'PLIwork6', videoId: 'eyeTiger001' },
      ],
    },
  ];
}

export interface FakeGoogleOptions {
  /** Basisadresse für fetch-Aufrufe in Tests */
  baseUrl?: string;
  /** Höchstens so viele Einträge pro Seite (zum Testen des Blätterns) */
  pageSize?: number;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function apiError(status: number, reason: string, message = reason): Response {
  return json(status, { error: { code: status, message, errors: [{ reason, message }] } });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function thumbnails(videoId: string | undefined) {
  if (!videoId) return {};
  return {
    default: { url: `https://i.ytimg.com/vi/${videoId}/default.jpg` },
    medium: { url: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` },
  };
}

export class FakeGoogle {
  readonly baseUrl: string;
  readonly pageSize: number;

  videos = new Map(FAKE_VIDEOS.map((video) => [video.id, video]));
  playlists: FakePlaylist[] = seedPlaylists();
  liked: string[] = ['dQw4w9WgXcQ', 'catVideo123', 'RgKAFK5djSk'];
  hasChannel = true;
  /** Diese Berechtigungen bestätigt der Token-Endpunkt. */
  grantedScope = FAKE_SCOPE;
  /** false: Playlists sind „automatisch sortiert“, Positionsangaben werden abgelehnt. */
  manualSort = true;

  readonly validCodes = new Set<string>();
  readonly accessTokens = new Set<string>();
  readonly refreshTokens = new Set<string>();
  readonly revoked: string[] = [];
  /** Erzwungene Fehler für die nächsten API-Aufrufe */
  readonly failNext: Array<{ status: number; reason: string }> = [];
  readonly calls: Array<{ method: string; path: string; grantType?: string }> = [];
  lastAuthorization: Record<string, string> | null = null;
  private counter = 0;

  constructor(options: FakeGoogleOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://fake-google.test').replace(/\/+$/, '');
    this.pageSize = options.pageSize ?? 50;
  }

  get endpoints() {
    return {
      authUrl: `${this.baseUrl}/o/oauth2/v2/auth`,
      tokenUrl: `${this.baseUrl}/token`,
      revokeUrl: `${this.baseUrl}/revoke`,
      apiUrl: `${this.baseUrl}/youtube/v3`,
    };
  }

  /** Ersatz für fetch: beantwortet Anfragen an die nachgebauten Adressen. */
  readonly fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
    this.handle(new Request(input, init));

  /** Gültiger Code, als hätte jemand auf der Anmeldeseite „Zulassen“ gewählt. */
  issueCode(): string {
    const code = `code-${++this.counter}`;
    this.validCodes.add(code);
    return code;
  }

  /** Alle Access-Tokens ungültig machen (die App muss sie erneuern). */
  expireAccessTokens(): void {
    this.accessTokens.clear();
  }

  /** Auch die Refresh-Tokens ungültig machen (die App muss neu verbunden werden). */
  revokeAll(): void {
    this.accessTokens.clear();
    this.refreshTokens.clear();
  }

  playlistVideos(id: string): string[] | null {
    return this.playlists.find((playlist) => playlist.id === id)?.items.map((item) => item.videoId) ?? null;
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/o/oauth2/v2/auth') return this.authorizePage(url);

    if (path === '/token' && request.method === 'POST') {
      const params = new URLSearchParams(await request.text());
      this.calls.push({ method: 'POST', path, grantType: params.get('grant_type') ?? '' });
      return this.token(params);
    }
    if (path === '/revoke' && request.method === 'POST') {
      const token = new URLSearchParams(await request.text()).get('token') ?? '';
      this.calls.push({ method: 'POST', path });
      this.revoked.push(token);
      this.refreshTokens.delete(token);
      this.accessTokens.delete(token);
      return new Response(null, { status: 200 });
    }
    if (path.startsWith('/youtube/v3/')) {
      this.calls.push({ method: request.method, path });
      return this.youtube(request, url, path.slice('/youtube/v3'.length));
    }
    return json(404, { error: 'not_found' });
  }

  private authorizePage(url: URL): Response {
    this.lastAuthorization = Object.fromEntries(url.searchParams);
    const redirect = url.searchParams.get('redirect_uri') ?? '';
    const state = url.searchParams.get('state') ?? '';
    if (!/^https?:\/\//.test(redirect)) return new Response('redirect_uri fehlt', { status: 400 });
    const target = new URL(redirect);
    const allow = new URL(target);
    allow.search = new URLSearchParams({ code: this.issueCode(), state, scope: FAKE_SCOPE }).toString();
    const deny = new URL(target);
    deny.search = new URLSearchParams({ error: 'access_denied', state }).toString();
    const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Fake-Google</title>
<style>body{font-family:system-ui,sans-serif;max-width:520px;margin:64px auto;padding:0 16px;line-height:1.5}
a{display:inline-block;margin-right:12px;padding:8px 16px;border-radius:8px;text-decoration:none;border:1px solid #888;color:inherit}
#allow{background:#256abf;border-color:#256abf;color:#fff}</style></head>
<body><h1>Fake-Google</h1>
<p>Nachgebaute Anmeldeseite für Tests. Die App „Musik“ möchte das (ebenfalls nachgebaute) YouTube-Konto verwalten.</p>
<p><a id="allow" href="${escapeHtml(allow.toString())}">Zulassen</a><a id="deny" href="${escapeHtml(deny.toString())}">Ablehnen</a></p>
</body></html>`;
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  private token(params: URLSearchParams): Response {
    if (!params.get('client_id') || !params.get('client_secret')) return json(401, { error: 'invalid_client' });
    const grantType = params.get('grant_type');
    if (grantType === 'authorization_code') {
      const code = params.get('code') ?? '';
      if (!this.validCodes.delete(code)) return json(400, { error: 'invalid_grant' });
      if (!params.get('redirect_uri')) return json(400, { error: 'redirect_uri_mismatch' });
      const n = ++this.counter;
      this.accessTokens.add(`access-${n}`);
      this.refreshTokens.add(`refresh-${n}`);
      return json(200, {
        access_token: `access-${n}`,
        expires_in: 3599,
        refresh_token: `refresh-${n}`,
        scope: this.grantedScope,
        token_type: 'Bearer',
      });
    }
    if (grantType === 'refresh_token') {
      if (!this.refreshTokens.has(params.get('refresh_token') ?? '')) {
        return json(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
      }
      const access = `access-${++this.counter}`;
      this.accessTokens.add(access);
      return json(200, { access_token: access, expires_in: 3599, scope: this.grantedScope, token_type: 'Bearer' });
    }
    return json(400, { error: 'unsupported_grant_type' });
  }

  private page<T>(query: URLSearchParams, all: T[]): Response {
    const size = Math.min(Number(query.get('maxResults') ?? 5), this.pageSize);
    const offset = Number(query.get('pageToken') ?? 0);
    const items = all.slice(offset, offset + size);
    const next = offset + size < all.length ? String(offset + size) : undefined;
    return json(200, { items, ...(next ? { nextPageToken: next } : {}), pageInfo: { totalResults: all.length } });
  }

  private videoResource(video: FakeVideo) {
    return {
      id: video.id,
      snippet: { title: video.title, channelTitle: video.channelTitle, categoryId: video.categoryId, thumbnails: thumbnails(video.id) },
      contentDetails: { duration: video.duration },
    };
  }

  private playlistResource(playlist: FakePlaylist) {
    return {
      id: playlist.id,
      snippet: { title: playlist.title, description: playlist.description, thumbnails: thumbnails(playlist.items[0]?.videoId) },
      contentDetails: { itemCount: playlist.items.length },
      status: { privacyStatus: playlist.privacyStatus },
    };
  }

  private itemResource(playlist: FakePlaylist, item: FakePlaylistItem, position: number) {
    const video = this.videos.get(item.videoId);
    return {
      id: item.id,
      snippet: {
        playlistId: playlist.id,
        position,
        // Gelöschte Videos stehen weiter in der Playlist, aber ohne Angaben.
        title: video?.title ?? 'Deleted video',
        ...(video ? { videoOwnerChannelTitle: video.channelTitle } : {}),
        resourceId: { kind: 'youtube#video', videoId: item.videoId },
      },
      contentDetails: { videoId: item.videoId },
    };
  }

  private findPlaylist(id: string | null | undefined): FakePlaylist | undefined {
    return this.playlists.find((playlist) => playlist.id === id);
  }

  private async youtube(request: Request, url: URL, resource: string): Promise<Response> {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (!this.accessTokens.has(token)) return apiError(401, 'authError', 'Invalid Credentials');
    const forced = this.failNext.shift();
    if (forced) return apiError(forced.status, forced.reason);

    const query = url.searchParams;
    const body = (request.method === 'POST' || request.method === 'PUT' ? await request.json() : {}) as RequestBody;

    switch (`${request.method} ${resource}`) {
      case 'GET /channels':
        return json(200, {
          items: this.hasChannel
            ? [{ id: 'UCfakechannel', snippet: { title: 'Mein Testkanal', thumbnails: thumbnails('dQw4w9WgXcQ') } }]
            : [],
        });

      case 'GET /playlists': {
        if (!this.hasChannel) return apiError(401, 'youtubeSignupRequired');
        const ids = query.get('id')?.split(',');
        const list = ids ? this.playlists.filter((playlist) => ids.includes(playlist.id)) : this.playlists;
        return this.page(query, list.map((playlist) => this.playlistResource(playlist)));
      }

      case 'POST /playlists': {
        if (!this.hasChannel) return apiError(401, 'youtubeSignupRequired');
        const playlist: FakePlaylist = {
          id: `PLnew${String(++this.counter).padStart(4, '0')}`,
          title: body.snippet?.title ?? '',
          description: body.snippet?.description ?? '',
          privacyStatus: body.status?.privacyStatus ?? 'public',
          items: [],
        };
        this.playlists.push(playlist);
        return json(200, this.playlistResource(playlist));
      }

      case 'PUT /playlists': {
        const playlist = this.findPlaylist(body.id);
        if (!playlist) return apiError(404, 'playlistNotFound');
        playlist.title = body.snippet?.title ?? playlist.title;
        playlist.description = body.snippet?.description ?? '';
        return json(200, this.playlistResource(playlist));
      }

      case 'GET /playlistItems': {
        const playlist = this.findPlaylist(query.get('playlistId'));
        if (!playlist) return apiError(404, 'playlistNotFound');
        return this.page(query, playlist.items.map((item, index) => this.itemResource(playlist, item, index)));
      }

      case 'POST /playlistItems': {
        const playlist = this.findPlaylist(body.snippet?.playlistId);
        if (!playlist) return apiError(404, 'playlistNotFound');
        const videoId = body.snippet?.resourceId?.videoId ?? '';
        if (!this.videos.has(videoId)) return apiError(404, 'videoNotFound');
        const position = body.snippet?.position;
        if (position !== undefined && !this.manualSort) return apiError(400, 'manualSortRequired');
        const item = { id: `PLI${++this.counter}`, videoId };
        if (position === undefined || position >= playlist.items.length) playlist.items.push(item);
        else playlist.items.splice(position, 0, item);
        return json(200, this.itemResource(playlist, item, playlist.items.indexOf(item)));
      }

      case 'PUT /playlistItems': {
        const playlist = this.findPlaylist(body.snippet?.playlistId);
        if (!playlist) return apiError(404, 'playlistNotFound');
        const index = playlist.items.findIndex((item) => item.id === body.id);
        if (index === -1) return apiError(404, 'playlistItemNotFound');
        if (!this.manualSort) return apiError(400, 'manualSortRequired');
        const [item] = playlist.items.splice(index, 1);
        const position = body.snippet?.position ?? playlist.items.length;
        playlist.items.splice(position, 0, item!);
        return json(200, this.itemResource(playlist, item!, position));
      }

      case 'DELETE /playlistItems': {
        for (const playlist of this.playlists) {
          const index = playlist.items.findIndex((item) => item.id === query.get('id'));
          if (index !== -1) {
            playlist.items.splice(index, 1);
            return new Response(null, { status: 204 });
          }
        }
        return apiError(404, 'playlistItemNotFound');
      }

      case 'GET /videos': {
        if (query.get('myRating') === 'like') {
          const liked = this.liked.map((id) => this.videos.get(id)).filter((video) => video !== undefined);
          return this.page(query, liked.map((video) => this.videoResource(video)));
        }
        const ids = (query.get('id') ?? '').split(',').filter(Boolean);
        const found = ids.map((id) => this.videos.get(id)).filter((video) => video !== undefined);
        return json(200, { items: found.map((video) => this.videoResource(video)) });
      }

      case 'GET /search': {
        const words = (query.get('q') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
        if (words.includes('kontingent')) {
          return apiError(403, 'quotaExceeded', 'The request cannot be completed because you have exceeded your quota.');
        }
        const category = query.get('videoCategoryId');
        const scored = [...this.videos.values()]
          .filter((video) => !category || video.categoryId === category)
          .map((video) => {
            const text = `${video.title} ${video.channelTitle}`.toLowerCase();
            return { video, hits: words.filter((word) => text.includes(word)).length };
          })
          .filter((entry) => entry.hits > 0)
          .sort((a, b) => b.hits - a.hits);
        const max = Number(query.get('maxResults') ?? 5);
        return json(200, {
          items: scored.slice(0, max).map(({ video }) => ({
            id: { kind: 'youtube#video', videoId: video.id },
            // Wie bei YouTube: Titel in der Suche sind HTML-kodiert.
            snippet: { title: escapeHtml(video.title), channelTitle: video.channelTitle },
          })),
        });
      }

      default:
        return apiError(404, 'notFound', `${request.method} ${resource} gibt es im Nachbau nicht.`);
    }
  }
}

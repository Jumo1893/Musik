// Konfiguration aus Umgebungsvariablen. Die Standardwerte passen zur lokalen
// Entwicklung (Datenbank aus docker-compose.dev.yml auf Port 5433); im Container
// setzt docker-compose.yml die Werte.

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`Umgebungsvariable ${name} muss eine ganze Zahl sein (ist: "${raw}").`);
  }
  return value;
}

function countryFromEnv(name: string, fallback: string): string {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  if (raw === '') return fallback;
  if (!/^[a-z]{2}$/.test(raw)) {
    throw new Error(`Umgebungsvariable ${name} muss ein zweistelliger Ländercode sein (ist: "${raw}").`);
  }
  return raw;
}

function optionalTextFromEnv(name: string): string | null {
  const raw = (process.env[name] ?? '').trim();
  return raw === '' ? null : raw;
}

/** Vollständige http(s)-Adresse ohne abschließenden Schrägstrich. */
function urlFromEnv(name: string, fallback: string): string {
  const raw = (process.env[name] ?? '').trim();
  const value = raw === '' ? fallback : raw;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Umgebungsvariable ${name} muss eine vollständige Adresse sein, z. B. http://localhost:8090 (ist: "${value}").`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Umgebungsvariable ${name} muss mit http:// oder https:// beginnen (ist: "${value}").`);
  }
  return url.toString().replace(/\/+$/, '');
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

const appUrl = urlFromEnv('APP_URL', 'http://localhost:5173');
const webBind = (process.env.WEB_BIND ?? '127.0.0.1').trim();

export const config = {
  port: intFromEnv('PORT', 3001),
  db: {
    host: process.env.PGHOST ?? 'localhost',
    port: intFromEnv('PGPORT', 5433),
    user: process.env.PGUSER ?? 'musik',
    password: process.env.PGPASSWORD ?? 'musik',
    database: process.env.PGDATABASE ?? 'musik',
  },
  /** Land des iTunes-Katalogs für die Online-Suche (bestimmt auch die Apple-Music-Links). */
  itunesCountry: countryFromEnv('ITUNES_COUNTRY', 'de'),
  /** Adresse, unter der der Browser die App erreicht; daraus ergibt sich die Rücksprungadresse für Google. */
  appUrl,
  /**
   * Host-Namen, unter denen die API antwortet. Ist die App nur auf diesem Rechner erreichbar
   * (WEB_BIND=127.0.0.1), wehrt das DNS-Rebinding fremder Webseiten ab. null: keine Prüfung –
   * wer die App bewusst im Netz freigibt, ruft sie unter wechselnden Adressen auf.
   */
  allowedHosts: LOOPBACK.has(webBind) ? [...LOOPBACK, new URL(appUrl).hostname] : null,
  youtube: {
    clientId: optionalTextFromEnv('YOUTUBE_CLIENT_ID'),
    clientSecret: optionalTextFromEnv('YOUTUBE_CLIENT_SECRET'),
  },
  /** Adressen der Google-Dienste. Nur zum Testen gegen den nachgebauten Server ändern. */
  googleEndpoints: {
    authUrl: urlFromEnv('GOOGLE_AUTH_URL', 'https://accounts.google.com/o/oauth2/v2/auth'),
    tokenUrl: urlFromEnv('GOOGLE_TOKEN_URL', 'https://oauth2.googleapis.com/token'),
    revokeUrl: urlFromEnv('GOOGLE_REVOKE_URL', 'https://oauth2.googleapis.com/revoke'),
    apiUrl: urlFromEnv('YOUTUBE_API_URL', 'https://www.googleapis.com/youtube/v3'),
  },
};

export type Config = typeof config;

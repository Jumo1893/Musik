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
};

export type Config = typeof config;

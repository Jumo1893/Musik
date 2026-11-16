// Mitzählen des YouTube-Tageskontingents. Google zählt selbst nur in der Cloud Console mit;
// die App führt eine eigene Schätzung, damit sie vor großen Aktionen warnen kann.

import type { Queryable } from '../db.ts';

/** Einheiten pro Tag für alle Aufrufe außer der Suche (Lesen 1, Schreiben 50). */
export const DAILY_UNITS = 10_000;
/** Suchanfragen pro Tag – ein eigenes Kontingent. */
export const DAILY_SEARCHES = 100;

const pacificDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const pacificHour = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  hour: 'numeric',
  hourCycle: 'h23',
});

/** Kalendertag in pazifischer Zeit (JJJJ-MM-TT) – danach richtet Google das Kontingent aus. */
export function quotaDay(now: Date): string {
  return pacificDate.format(now);
}

/** Nächste Mitternacht pazifischer Zeit: 07:00 UTC in der Sommerzeit, sonst 08:00 UTC. */
export function nextQuotaReset(now: Date): Date {
  const [year, month, day] = quotaDay(now).split('-').map(Number) as [number, number, number];
  for (const utcHour of [7, 8]) {
    const candidate = new Date(Date.UTC(year, month - 1, day + 1, utcHour));
    if (Number(pacificHour.format(candidate)) === 0) return candidate;
  }
  return new Date(Date.UTC(year, month - 1, day + 1, 8));
}

export interface QuotaUsage {
  day: string;
  units: number;
  searches: number;
}

export async function addQuotaUsage(
  db: Queryable,
  now: Date,
  usage: { units?: number | undefined; searches?: number | undefined },
): Promise<void> {
  const units = usage.units ?? 0;
  const searches = usage.searches ?? 0;
  if (units === 0 && searches === 0) return;
  await db.query(
    `INSERT INTO youtube_quota_usage (day, units, searches) VALUES ($1, $2, $3)
     ON CONFLICT (day) DO UPDATE
        SET units = youtube_quota_usage.units + EXCLUDED.units,
            searches = youtube_quota_usage.searches + EXCLUDED.searches`,
    [quotaDay(now), units, searches],
  );
}

export async function readQuotaUsage(db: Queryable, now: Date): Promise<QuotaUsage> {
  const day = quotaDay(now);
  const { rows } = await db.query<{ units: number; searches: number }>(
    'SELECT units, searches FROM youtube_quota_usage WHERE day = $1',
    [day],
  );
  return { day, units: rows[0]?.units ?? 0, searches: rows[0]?.searches ?? 0 };
}

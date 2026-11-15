// Anzeige- und Eingabeformate für Dauern, Mengen und Datumsangaben.

export const DASH = '–';

/** 217 → „3:37“, 3725 → „1:02:05“, keine Angabe → „–“ */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return DASH;
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** Gesamtdauer in Worten: 9060 → „2 Std. 31 Min.“ */
export function formatTotalDuration(seconds: number): string {
  const totalMinutes = Math.round(Math.max(0, seconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} Min.`;
  return minutes === 0 ? `${hours} Std.` : `${hours} Std. ${minutes} Min.`;
}

export type ParsedDuration = { ok: true; seconds: number | null } | { ok: false };

/**
 * Liest eine Dauer aus einem Eingabefeld: „3:37“, „1:02:05“ oder nur Minuten („4“).
 * Ein leeres Feld ist gültig und bedeutet „keine Angabe“.
 */
export function parseDuration(text: string): ParsedDuration {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, seconds: null };

  const parts = trimmed.split(':');
  if (parts.length > 3 || parts.some((part) => !/^\d{1,3}$/.test(part))) return { ok: false };
  const numbers = parts.map(Number);

  // Hinter einem Doppelpunkt stehen Minuten bzw. Sekunden, also höchstens 59.
  if (numbers.slice(1).some((value) => value > 59)) return { ok: false };

  const seconds = numbers.reduce((total, value) => total * 60 + value, 0) * (numbers.length === 1 ? 60 : 1);
  if (seconds < 1 || seconds > 86_399) return { ok: false };
  return { ok: true, seconds };
}

/** „1 Song“, „5 Songs“ */
export function formatCount(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString('de-DE')} ${count === 1 ? singular : plural}`;
}

export function formatSongCount(count: number): string {
  return formatCount(count, 'Song', 'Songs');
}

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? DASH : dateFormat.format(date);
}

/** Dezimalzahl mit Komma, z. B. 4.5 → „4,5“ */
export function formatDecimal(value: number, digits = 1): string {
  return value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

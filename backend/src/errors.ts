import type { ErrorRequestHandler } from 'express';
import pg from 'pg';
import * as z from 'zod';

/** Fehler, der dem Client mit passendem Statuscode und deutscher Meldung gezeigt wird. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function notFound(what: string): HttpError {
  return new HttpError(404, `${what} wurde nicht gefunden.`);
}

/** Liest eine ID aus dem Pfad; alles andere als eine positive Ganzzahl gilt als „nicht gefunden“. */
export function parseId(value: unknown, what: string): number {
  if (typeof value !== 'string' || !/^[1-9]\d{0,8}$/.test(value)) throw notFound(what);
  return Number(value);
}

function fromDatabaseError(err: pg.DatabaseError): HttpError | null {
  switch (err.code) {
    case '23505': // unique_violation
      if (err.constraint === 'songs_unique_track') {
        return new HttpError(
          409,
          'Diesen Song gibt es schon in deiner Bibliothek (gleicher Titel, Interpret und Album).',
        );
      }
      if (err.constraint === 'categories_unique_name') {
        return new HttpError(409, 'Eine Kategorie mit diesem Namen gibt es schon.');
      }
      return new HttpError(409, 'Diesen Eintrag gibt es schon.');
    case '23503': // foreign_key_violation
      if (err.constraint === 'song_categories_category_id_fkey') {
        return new HttpError(400, 'Mindestens eine der gewählten Kategorien gibt es nicht mehr.');
      }
      if (err.constraint === 'playlist_songs_song_id_fkey') {
        return new HttpError(400, 'Mindestens einen der Songs gibt es nicht mehr.');
      }
      return new HttpError(400, 'Die Eingabe verweist auf einen Eintrag, den es nicht mehr gibt.');
    case '23514': // check_violation
    case '22003': // numeric_value_out_of_range
    case '22P02': // invalid_text_representation
      return new HttpError(400, 'Die Eingabe enthält ungültige Werte.');
    default:
      return null;
  }
}

/** Fasst Validierungsfehler je Feld zusammen (erste Meldung pro Feld). */
function fieldMessages(err: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const field = issue.path.length > 0 ? String(issue.path[0]) : '';
    fields[field] ??= issue.message;
  }
  return fields;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  if (err instanceof z.ZodError) {
    const fields = fieldMessages(err);
    const messages = [...new Set(Object.values(fields))];
    res.status(400).json({ error: messages.join(' ') || 'Bitte die Eingaben prüfen.', fields });
    return;
  }

  if (err instanceof pg.DatabaseError) {
    const mapped = fromDatabaseError(err);
    if (mapped) {
      res.status(mapped.status).json({ error: mapped.message });
      return;
    }
  }

  // Fehler des JSON-Body-Parsers (kaputtes JSON, zu großer Body) bringen ihren Status mit.
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    const message = status === 413 ? 'Die Anfrage ist zu groß.' : 'Die Anfrage ist ungültig.';
    res.status(status).json({ error: message });
    return;
  }

  console.error('Unerwarteter Fehler:', err);
  res.status(500).json({ error: 'Da ist auf dem Server etwas schiefgegangen.' });
};

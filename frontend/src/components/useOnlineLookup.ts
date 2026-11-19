import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, type SongLookupQuery } from '../api.ts';

export type OnlineLookupState<T> =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'found'; match: T }
  | { status: 'notFound' }
  | { status: 'error'; message: string };

/**
 * Schlägt etwas zu einem Song online nach (Tempo auf songbpm.com, Genres auf MusicBrainz).
 * Derselbe Song wird nur einmal gesucht (außer mit force); kommt eine neue Suche dazwischen,
 * verfällt die alte. fetchMatch sollte sich nicht ändern (etwa api.lookupBpm).
 */
export function useOnlineLookup<T>(fetchMatch: (query: SongLookupQuery, signal: AbortSignal) => Promise<{ match: T | null }>) {
  const [state, setState] = useState<OnlineLookupState<T>>({ status: 'idle' });
  const lastKey = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  /** Startet die Suche und gibt zurück, ob sie wirklich gestartet wurde. */
  const search = useCallback((query: SongLookupQuery, onFound: (match: T) => void, force = false): boolean => {
    const key = `${query.artist.trim().toLowerCase()}|${query.title.trim().toLowerCase()}`;
    if (!force && key === lastKey.current) return false;
    lastKey.current = key;

    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setState({ status: 'searching' });

    fetchMatch(query, current.signal).then(
      ({ match }) => {
        if (current.signal.aborted) return;
        if (match) {
          setState({ status: 'found', match });
          onFound(match);
        } else {
          setState({ status: 'notFound' });
        }
      },
      (err: unknown) => {
        if (current.signal.aborted) return;
        // Nach einem Fehler darf derselbe Song gleich noch einmal gesucht werden.
        lastKey.current = null;
        setState({ status: 'error', message: errorMessage(err) });
      },
    );
    return true;
  }, [fetchMatch]);

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    lastKey.current = null;
    setState({ status: 'idle' });
  }, []);

  return { state, search, reset };
}

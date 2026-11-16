import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api.ts';
import type { BpmMatch } from '../types.ts';

export type BpmLookupState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'found'; match: BpmMatch }
  | { status: 'notFound' }
  | { status: 'error'; message: string };

export interface BpmLookupQuery {
  title: string;
  artist: string;
  durationSeconds: number | null;
}

/**
 * Schlägt das Tempo eines Songs auf songbpm.com nach. Derselbe Song wird nur einmal gesucht
 * (außer mit force); kommt eine neue Suche dazwischen, verfällt die alte.
 */
export function useBpmLookup() {
  const [state, setState] = useState<BpmLookupState>({ status: 'idle' });
  const lastKey = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  /** Startet die Suche und gibt zurück, ob sie wirklich gestartet wurde. */
  const search = useCallback((query: BpmLookupQuery, onFound: (match: BpmMatch) => void, force = false): boolean => {
    const key = `${query.artist.trim().toLowerCase()}|${query.title.trim().toLowerCase()}`;
    if (!force && key === lastKey.current) return false;
    lastKey.current = key;

    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setState({ status: 'searching' });

    api.lookupBpm(query, current.signal).then(
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
  }, []);

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    lastKey.current = null;
    setState({ status: 'idle' });
  }, []);

  return { state, search, reset };
}

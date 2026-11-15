import { useEffect, useId, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api, errorMessage } from '../api.ts';
import { formatDuration } from '../lib/format.ts';
import type { LookupResult } from '../types.ts';
import { Artwork } from './ui.tsx';

interface OnlineSearchProps {
  onPick: (result: LookupResult) => void;
  autoFocus?: boolean;
}

/**
 * Sucht einen Song im iTunes-Katalog und übergibt den gewählten Treffer, damit das
 * Formular vorbelegt werden kann. Gesendet wird nur der eingetippte Suchbegriff.
 */
export function OnlineSearch({ onPick, autoFocus }: OnlineSearchProps) {
  const [term, setTerm] = useState('');
  const [picked, setPicked] = useState<LookupResult | null>(null);
  const search = useMutation({ mutationFn: (text: string) => api.lookup(text) });
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const canSearch = term.trim().length >= 2 && !search.isPending;

  // Beim Öffnen des Dialogs setzt Modal den Fokus (über data-autofocus). Wird die Suche
  // danach neu aufgebaut („Speichern & weiterer Song“), holt sie sich den Fokus selbst.
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function runSearch() {
    if (!canSearch) return;
    setPicked(null);
    search.mutate(term.trim());
  }

  function pick(result: LookupResult) {
    setPicked(result);
    search.reset();
    onPick(result);
  }

  return (
    <section className="online-search" aria-label="Online-Suche">
      <label className="field-label" htmlFor={inputId}>
        Song online suchen und Angaben übernehmen
      </label>
      <div className="input-with-action">
        <input
          id={inputId}
          ref={inputRef}
          className="input"
          type="search"
          value={term}
          data-autofocus={autoFocus || undefined}
          placeholder="Titel und Interpret, z. B. „Hurt Johnny Cash“"
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            // Enter soll suchen, nicht das Song-Formular absenden.
            if (event.key === 'Enter') {
              event.preventDefault();
              runSearch();
            }
          }}
        />
        <button type="button" className="button" onClick={runSearch} disabled={!canSearch}>
          <Search size={16} aria-hidden />
          {search.isPending ? 'Suche …' : 'Suchen'}
        </button>
      </div>

      {search.isError && (
        <p className="field-error" role="alert">
          {errorMessage(search.error)}
        </p>
      )}

      {picked && (
        <p className="field-hint" role="status">
          Übernommen: „{picked.title}“ von {picked.artist}. Die Angaben lassen sich unten noch anpassen.
        </p>
      )}

      {search.data &&
        (search.data.length === 0 ? (
          <p className="field-hint" role="status">
            Nichts gefunden. Du kannst den Song auch einfach von Hand eintragen.
          </p>
        ) : (
          <ul className="lookup-results" aria-label="Treffer">
            {search.data.map((result, index) => (
              <li key={`${result.appleMusicUrl ?? ''}-${index}`}>
                <button type="button" className="lookup-result" onClick={() => pick(result)}>
                  <Artwork url={result.artworkUrl} size={44} />
                  <span className="lookup-text">
                    <span className="lookup-title">{result.title}</span>
                    <span className="lookup-meta">
                      {[result.artist, result.album, result.releaseYear].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="lookup-duration">{formatDuration(result.durationSeconds)}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

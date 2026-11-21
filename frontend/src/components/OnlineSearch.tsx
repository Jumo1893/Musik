import { useEffect, useId, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link2, Search, X } from 'lucide-react';
import { api, errorMessage } from '../api.ts';
import { formatDuration } from '../lib/format.ts';
import { looksLikeLink } from '../lib/links.ts';
import type { Duplicate } from '../lib/songMatching.ts';
import type { LinkLookupResult, LookupResult } from '../types.ts';
import { Artwork } from './ui.tsx';

/** Was zu einem übernommenen Treffer noch dazugehört. */
export interface PickExtras {
  /** Link aus einem eingefügten YouTube-Link; kommt ins YouTube-Feld. */
  youtubeUrl?: string;
  /** Titel und Interpret stammen aus dem Videotitel und sollten geprüft werden. */
  fromVideo?: boolean;
}

interface OnlineSearchProps {
  onPick: (result: LookupResult, extras?: PickExtras) => void;
  /** Ein eingefügter YouTube-Link: Er kommt in jedem Fall ins YouTube-Feld. `video`: Titel und Interpret laut Video */
  onYoutubeLink?: (youtubeUrl: string, video: { title: string; artist: string } | null) => void;
  autoFocus?: boolean;
  /** Findet den passenden Song der Bibliothek, falls der Treffer schon drin ist. */
  findDuplicate?: (result: LookupResult) => Duplicate | null;
  /** Vorbelegter Suchbegriff oder Link (etwa aus der Merkliste); wird gleich nachgeschlagen. */
  initialTerm?: string;
}

type YoutubeLink = Extract<LinkLookupResult, { kind: 'youtube' }>;

/** Wartezeit nach dem Einfügen oder Tippen eines Links, bevor er nachgeschlagen wird. */
const LINK_DELAY_MS = 300;

/** Titel und Interpret aus dem Video als Treffer, dazu das Vorschaubild als Cover. */
function resultFromVideo(found: YoutubeLink): LookupResult | null {
  if (!found.parsed) return null;
  return {
    title: found.parsed.title,
    artist: found.parsed.artist,
    album: null,
    durationSeconds: null,
    releaseYear: null,
    genre: null,
    appleMusicUrl: null,
    artworkUrl: found.video?.thumbnailUrl ?? null,
  };
}

interface ResultButtonProps {
  result: LookupResult;
  duplicate: Duplicate | null;
  onPick: () => void;
  highlight?: boolean;
}

function ResultButton({ result, duplicate, onPick, highlight = false }: ResultButtonProps) {
  return (
    <button type="button" className={`lookup-result ${highlight ? 'lookup-result-best' : ''}`} onClick={onPick}>
      <Artwork url={result.artworkUrl} size={44} />
      <span className="lookup-text">
        <span className="lookup-title">{result.title}</span>
        <span className="lookup-meta">{[result.artist, result.album, result.releaseYear].filter(Boolean).join(' · ')}</span>
        {duplicate && (
          <span
            className="lookup-badge"
            title={`In der Bibliothek: „${duplicate.song.title}“ von ${duplicate.song.artist}${duplicate.song.album ? ` (${duplicate.song.album})` : ''}`}
          >
            Schon in deiner Bibliothek
          </span>
        )}
      </span>
      <span className="lookup-duration">{formatDuration(result.durationSeconds)}</span>
    </button>
  );
}

/**
 * Sucht einen Song im iTunes-Katalog oder erkennt ihn an einem eingefügten Link (Apple Music,
 * YouTube, YouTube Music) und übergibt den gewählten Treffer, damit das Formular vorbelegt
 * werden kann. Gesendet wird nur der Suchbegriff bzw. der Link.
 */
export function OnlineSearch({ onPick, onYoutubeLink, autoFocus, findDuplicate, initialTerm }: OnlineSearchProps) {
  const [term, setTerm] = useState(initialTerm ?? '');
  const [picked, setPicked] = useState<string | null>(null);
  /** Treffer zu einem YouTube-Link, unter denen der Nutzer wählt */
  const [youtubeChoice, setYoutubeChoice] = useState<YoutubeLink | null>(null);
  const search = useMutation({ mutationFn: (text: string) => api.lookup(text) });
  const linkLookup = useMutation({ mutationFn: (url: string) => api.lookupLink(url), onSuccess: handleLink });
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const linkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLink = useRef<string | null>(null);
  const isLink = looksLikeLink(term);
  const busy = search.isPending || linkLookup.isPending;
  const canSearch = term.trim().length >= 2 && !busy;

  // Beim Öffnen des Dialogs setzt Modal den Fokus (über data-autofocus). Wird die Suche
  // danach neu aufgebaut („Speichern & weiterer Song“), holt sie sich den Fokus selbst.
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Ein vorbelegter Begriff (Merkliste) wird gleich nachgeschlagen.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !initialTerm || initialTerm.trim().length < 2) return;
    started.current = true;
    if (looksLikeLink(initialTerm)) runLink(initialTerm.trim());
    else search.mutate(initialTerm.trim());
    // Absichtlich nur beim ersten Anzeigen.
  }, []);

  useEffect(() => () => {
    if (linkTimer.current) clearTimeout(linkTimer.current);
  }, []);

  function reset() {
    setPicked(null);
    setYoutubeChoice(null);
    search.reset();
    linkLookup.reset();
  }

  function runLink(url: string) {
    lastLink.current = url;
    reset();
    linkLookup.mutate(url);
  }

  function runSearch() {
    if (!canSearch) return;
    if (linkTimer.current) clearTimeout(linkTimer.current);
    if (isLink) {
      runLink(term.trim());
      return;
    }
    reset();
    search.mutate(term.trim());
  }

  function changeTerm(value: string) {
    setTerm(value);
    if (linkTimer.current) clearTimeout(linkTimer.current);
    // Ein eingefügter Link wird von selbst erkannt; ein eigener Knopf ist nicht nötig.
    if (looksLikeLink(value) && value.trim() !== lastLink.current) {
      linkTimer.current = setTimeout(() => runLink(value.trim()), LINK_DELAY_MS);
    }
  }

  function pick(result: LookupResult, note: string, extras?: PickExtras) {
    setPicked(note);
    search.reset();
    onPick(result, extras);
  }

  function handleLink(found: LinkLookupResult) {
    if (found.kind === 'apple') {
      pick(found.result, `Übernommen aus dem Apple-Music-Link: „${found.result.title}“ von ${found.result.artist}.`);
      return;
    }
    // Der YouTube-Link gehört in jedem Fall zum Song, egal welcher Treffer gewählt wird.
    onYoutubeLink?.(found.youtubeUrl, found.parsed);
    const fromVideo = resultFromVideo(found);
    if (!found.best && fromVideo) {
      // Der Katalog kennt nichts Passendes: Titel und Interpret aus dem Video, zum Prüfen markiert.
      pick(fromVideo, `Aus dem Videotitel übernommen: „${fromVideo.title}“ von ${fromVideo.artist} – bitte prüfen.`, {
        youtubeUrl: found.youtubeUrl,
        fromVideo: true,
      });
    }
    setYoutubeChoice(found.best || found.results.length > 0 || !found.parsed ? found : null);
  }

  function pickFromChoice(result: LookupResult, extras: PickExtras, note: string) {
    pick(result, note, extras);
    setYoutubeChoice(null);
  }

  const duplicateOf = (result: LookupResult) => findDuplicate?.(result) ?? null;

  return (
    <section className="online-search" aria-label="Online-Suche">
      <label className="field-label" htmlFor={inputId}>
        Song online suchen oder Link einfügen
      </label>
      <div className="input-with-action">
        <input
          id={inputId}
          ref={inputRef}
          className="input"
          type="search"
          value={term}
          data-autofocus={autoFocus || undefined}
          placeholder="Titel und Interpret oder ein Link von Apple Music oder YouTube"
          onChange={(event) => changeTerm(event.target.value)}
          onKeyDown={(event) => {
            // Enter soll suchen, nicht das Song-Formular absenden; Strg+Enter speichert (Dialog).
            if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
              event.preventDefault();
              runSearch();
            }
          }}
        />
        <button type="button" className="button" onClick={runSearch} disabled={!canSearch}>
          {isLink ? <Link2 size={16} aria-hidden /> : <Search size={16} aria-hidden />}
          {busy ? (isLink ? 'Lese Link …' : 'Suche …') : isLink ? 'Übernehmen' : 'Suchen'}
        </button>
      </div>

      {linkLookup.isPending && (
        <p className="field-hint" role="status">
          Lese den Link …
        </p>
      )}
      {(search.isError || linkLookup.isError) && (
        <p className="field-error" role="alert">
          {errorMessage(search.error ?? linkLookup.error)}
        </p>
      )}

      {picked && (
        <p className="field-hint" role="status">
          {picked} Die Angaben lassen sich unten noch anpassen.
        </p>
      )}

      {youtubeChoice && (
        <div className="link-choice">
          <div className="link-choice-head">
            <p className="field-hint">
              {youtubeChoice.video
                ? `YouTube-Video „${youtubeChoice.video.title}“${youtubeChoice.video.channel ? ` von ${youtubeChoice.video.channel}` : ''}. `
                : 'Zu diesem Video liefert YouTube keine Angaben (gelöscht, privat oder gerade nicht erreichbar). '}
              Der Link steht im YouTube-Feld.
              {!youtubeChoice.parsed && ' Titel und Interpret bitte selbst eintragen.'}
            </p>
            <button type="button" className="icon-button" aria-label="Auswahl schließen" onClick={() => setYoutubeChoice(null)}>
              <X size={16} aria-hidden />
            </button>
          </div>
          {youtubeChoice.best && (
            <>
              <p className="link-choice-question">Ist es dieser?</p>
              <ResultButton
                result={youtubeChoice.best}
                duplicate={duplicateOf(youtubeChoice.best)}
                highlight
                onPick={() =>
                  pickFromChoice(youtubeChoice.best!, { youtubeUrl: youtubeChoice.youtubeUrl }, `Übernommen: „${youtubeChoice.best!.title}“ von ${youtubeChoice.best!.artist}.`)
                }
              />
            </>
          )}
          {youtubeChoice.results.length > 0 && (
            <>
              <p className="field-hint">
                {youtubeChoice.best ? 'Oder einer von diesen:' : 'Im Katalog passt keiner genau. Vielleicht einer von diesen?'}
              </p>
              <ul className="lookup-results" aria-label="Weitere Treffer">
                {youtubeChoice.results.map((result, index) => (
                  <li key={`${result.appleMusicUrl ?? ''}-${index}`}>
                    <ResultButton
                      result={result}
                      duplicate={duplicateOf(result)}
                      onPick={() =>
                        pickFromChoice(result, { youtubeUrl: youtubeChoice.youtubeUrl }, `Übernommen: „${result.title}“ von ${result.artist}.`)
                      }
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
          {youtubeChoice.best && youtubeChoice.parsed && (
            <button
              type="button"
              className="link-button"
              onClick={() =>
                pickFromChoice(
                  resultFromVideo(youtubeChoice)!,
                  { youtubeUrl: youtubeChoice.youtubeUrl, fromVideo: true },
                  `Aus dem Videotitel übernommen: „${youtubeChoice.parsed!.title}“ von ${youtubeChoice.parsed!.artist} – bitte prüfen.`,
                )
              }
            >
              Keiner davon – „{youtubeChoice.parsed.title}“ von {youtubeChoice.parsed.artist} aus dem Video übernehmen
            </button>
          )}
        </div>
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
                <ResultButton
                  result={result}
                  duplicate={duplicateOf(result)}
                  onPick={() => pick(result, `Übernommen: „${result.title}“ von ${result.artist}.`)}
                />
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

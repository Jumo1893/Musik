import { useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { addGenre, genreKey, matchGenres, mergeGenres, removeGenre } from '../lib/songs.ts';

interface GenrePickerProps {
  /** id des Eingabefelds, damit die Beschriftung des Felds dazu gehört */
  id: string;
  /** Gewählte Genres in der Reihenfolge, in der sie gewählt wurden */
  value: string[];
  /** Schon vorhandene Genres der Bibliothek; sie stehen in der aufklappbaren Liste. */
  options: string[];
  onChange: (genres: string[]) => void;
}

interface Item {
  genre: string;
  /** Eingetipptes Genre, das es noch nicht gibt */
  isNew: boolean;
  selected: boolean;
}

/**
 * Mehrfachauswahl für Genres. Ein Klick ins Feld (oder Pfeil nach unten) klappt die Liste
 * der schon vorhandenen Genres auf; ein Klick auf einen Eintrag wählt ihn aus oder wieder ab.
 * Tippen filtert die Liste. Ein Genre, das es noch nicht gibt, wird mit Enter oder Komma
 * übernommen – oder beim Verlassen des Felds, damit nichts Eingetipptes verloren geht.
 */
export function GenrePicker({ id, value, options, onChange }: GenrePickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  /** Mit den Pfeiltasten markierter Eintrag; -1 heißt: keiner */
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  // Gewählte Genres stehen auch dann in der Liste, wenn sonst kein Song sie hat.
  const known = useMemo(() => mergeGenres(options, value), [options, value]);

  const items = useMemo<Item[]>(() => {
    const selected = new Set(value.map(genreKey));
    const matches = matchGenres(known, query).map((genre) => ({
      genre,
      isNew: false,
      selected: selected.has(genreKey(genre)),
    }));
    const typed = query.trim();
    if (typed === '' || known.some((genre) => genreKey(genre) === genreKey(typed))) return matches;
    return [...matches, { genre: typed, isNew: true, selected: false }];
  }, [known, value, query]);

  // Die markierte Zeile bleibt beim Blättern mit den Pfeiltasten sichtbar.
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${listId}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, listId]);

  /** Hängt ein eingetipptes Genre an; gibt es das Genre schon, gilt dessen Schreibweise. */
  function withTyped(genres: string[], typed: string): string[] {
    const existing = known.find((genre) => genreKey(genre) === genreKey(typed));
    return addGenre(genres, existing ?? typed);
  }

  /** Übernimmt den eingetippten Text als Genre. */
  function commitTyped() {
    setQuery('');
    if (query.trim() !== '') onChange(withTyped(value, query));
  }

  function handleInput(text: string) {
    // Ein Komma trennt Genres – beim Tippen genauso wie beim Einfügen von „Pop, Dance“.
    const parts = text.split(',');
    const rest = parts.pop() ?? '';
    if (parts.length > 0) {
      const next = parts.reduce(withTyped, value);
      if (next.length !== value.length) onChange(next);
    }
    setQuery(parts.length > 0 ? rest.trimStart() : rest);
    setOpen(true);
    setActive(rest.trim() === '' ? -1 : 0);
  }

  function choose(index: number) {
    const item = items[index];
    if (!item) return;
    const next = item.selected ? removeGenre(value, item.genre) : addGenre(value, item.genre);
    onChange(next);
    setQuery('');
    // Ohne Suchtext steht wieder die ganze Liste da; die Markierung bleibt beim gewählten Genre.
    setActive(mergeGenres(options, next).findIndex((genre) => genreKey(genre) === genreKey(item.genre)));
  }

  function remove(genre: string) {
    onChange(removeGenre(value, genre));
    inputRef.current?.focus();
  }

  function close() {
    setOpen(false);
    setActive(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) {
          setOpen(true);
          setActive(items.length > 0 ? 0 : -1);
        } else {
          setActive((current) => Math.min(current + 1, items.length - 1));
        }
        break;
      case 'ArrowUp':
        if (!open) break;
        event.preventDefault();
        setActive((current) => Math.max(current - 1, 0));
        break;
      case 'Enter':
        // Enter wählt aus bzw. übernimmt; das Song-Formular wird nur bei leerem, geschlossenem Feld abgeschickt.
        if (open && active >= 0 && active < items.length) {
          event.preventDefault();
          choose(active);
        } else if (query.trim() !== '') {
          event.preventDefault();
          commitTyped();
        } else if (open) {
          event.preventDefault();
          close();
        }
        break;
      case 'Backspace':
        if (query === '' && value.length > 0) onChange(value.slice(0, -1));
        break;
      case 'Escape':
        // Nur die Liste schließen, nicht den ganzen Dialog.
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        break;
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (rootRef.current?.contains(event.relatedTarget as Node | null)) return;
    commitTyped();
    close();
  }

  return (
    <div className="genre-picker" ref={rootRef} onBlur={handleBlur}>
      <div
        className="genre-picker-control"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('button')) return;
          inputRef.current?.focus();
          setOpen(true);
        }}
      >
        <div className="genre-picker-values">
          {value.map((genre) => (
            <span key={genreKey(genre)} className="chip genre-chip">
              {genre}
              <button
                type="button"
                className="genre-chip-remove"
                aria-label={`Genre „${genre}“ entfernen`}
                title="Entfernen"
                onClick={() => remove(genre)}
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          ))}
          <input
            id={id}
            ref={inputRef}
            className="genre-picker-input"
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
            autoComplete="off"
            value={query}
            maxLength={100}
            placeholder={value.length === 0 ? 'Auswählen oder eintippen …' : ''}
            onChange={(event) => handleInput(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          type="button"
          className="genre-picker-toggle"
          tabIndex={-1}
          aria-label={open ? 'Liste der Genres schließen' : 'Liste der Genres öffnen'}
          aria-expanded={open}
          // Der Fokus bleibt im Eingabefeld, sonst würde die Liste beim Klick gleich wieder zugehen.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            inputRef.current?.focus();
            if (open) close();
            else setOpen(true);
          }}
        >
          <ChevronDown size={16} aria-hidden />
        </button>
      </div>

      {open && (
        <div className="genre-picker-popup">
          {items.length > 0 ? (
            <ul id={listId} className="genre-picker-list" role="listbox" aria-multiselectable="true" aria-label="Genres">
              {items.map((item, index) => (
                <li
                  key={item.isNew ? `neu:${item.genre}` : genreKey(item.genre)}
                  id={optionId(index)}
                  role="option"
                  aria-selected={item.selected}
                  className={`genre-option${index === active ? ' genre-option-active' : ''}${item.isNew ? ' genre-option-new' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => {
                    if (index !== active) setActive(index);
                  }}
                  onClick={() => choose(index)}
                >
                  {item.isNew ? (
                    <Plus size={15} aria-hidden className="genre-option-icon" />
                  ) : (
                    <Check size={15} aria-hidden className="genre-option-icon genre-option-check" />
                  )}
                  <span>{item.isNew ? `„${item.genre}“ als neues Genre hinzufügen` : item.genre}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="genre-picker-empty">Noch keine Genres in der Bibliothek – einfach eintippen und mit Enter übernehmen.</p>
          )}
        </div>
      )}
    </div>
  );
}

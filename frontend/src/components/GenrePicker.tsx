import { useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import type { GenreIndex } from '../lib/genres.ts';
import { addGenre, genreKey, removeGenre } from '../lib/songs.ts';

interface GenrePickerProps {
  /** id des Eingabefelds, damit die Beschriftung des Felds dazu gehört */
  id: string;
  /** Gewählte Genres in der Reihenfolge, in der sie gewählt wurden */
  value: string[];
  /** Genre-Liste mit Haupt- und Untergenres */
  index: GenreIndex;
  /** Genres, die Songs der Bibliothek schon haben; sie stehen beim Aufklappen oben. */
  libraryGenres: string[];
  onChange: (genres: string[]) => void;
}

interface Item {
  genre: string;
  /** Hauptgenres des Eintrags, „Hauptgenre“ oder „eigenes Genre“ */
  detail: string;
  /** Eingetipptes Genre, das es noch nicht gibt */
  isNew: boolean;
  selected: boolean;
}

interface Group {
  label: string;
  items: Item[];
}

/** Höchstens so viele Treffer zeigt die Suche. */
const MAX_MATCHES = 50;

function detailOf(index: GenreIndex, name: string): string {
  const genre = index.find(name);
  if (!genre) return 'eigenes Genre';
  if (genre.isMain) return 'Hauptgenre';
  return genre.mainGenres.join(' · ') || 'eigenes Genre';
}

/**
 * Inhalt der aufgeklappten Liste. Ohne Eingabe: die Genres der Bibliothek und die
 * Hauptgenres. Mit Eingabe: passende Genres der ganzen Liste und, falls es den Namen noch
 * nicht gibt, ein Eintrag zum Anlegen.
 */
function buildGroups(index: GenreIndex, libraryGenres: readonly string[], value: readonly string[], query: string): Group[] {
  const selected = new Set(value.map(genreKey));
  const item = (genre: string): Item => ({
    genre,
    detail: detailOf(index, genre),
    isNew: false,
    selected: selected.has(genreKey(genre)),
  });

  const typed = query.trim();
  if (typed === '') {
    // Gewählte Genres stehen auch dann oben, wenn sonst kein Song sie hat.
    const own = new Map<string, string>();
    for (const genre of [...libraryGenres, ...value]) {
      const name = index.canonical(genre);
      if (!index.find(name)?.isMain && !own.has(genreKey(name))) own.set(genreKey(name), name);
    }
    const ownItems = [...own.values()].sort((a, b) => a.localeCompare(b, 'de')).map(item);
    return [
      ...(ownItems.length > 0 ? [{ label: 'In deiner Bibliothek', items: ownItems }] : []),
      { label: 'Hauptgenres', items: index.mainGenres.map((main) => item(main.name)) },
    ];
  }

  const matches = index.search(typed, MAX_MATCHES).map((genre) => item(genre.name));
  // Eigene Genres, die noch kein Song gespeichert hat, kennt die Liste noch nicht.
  for (const genre of value) {
    if (!index.find(genre) && genreKey(genre).includes(genreKey(typed))) matches.push(item(genre));
  }
  const exists = index.find(typed) !== undefined || value.some((genre) => genreKey(genre) === genreKey(typed));
  const groups: Group[] = matches.length > 0 ? [{ label: 'Treffer', items: matches }] : [];
  if (!exists) groups.push({ label: 'Neu', items: [{ genre: typed, detail: '', isNew: true, selected: false }] });
  return groups;
}

/**
 * Mehrfachauswahl für Genres aus der Genre-Liste (Haupt- und Untergenres). Ein Klick ins Feld
 * (oder Pfeil nach unten) klappt die Genres der Bibliothek und die Hauptgenres auf; Tippen
 * durchsucht die ganze Liste, auch nach anderen Schreibweisen („rap“ findet Hip-Hop). Ein Genre,
 * das es noch nicht gibt, wird mit Enter oder Komma übernommen – oder beim Verlassen des Felds.
 */
export function GenrePicker({ id, value, index, libraryGenres, onChange }: GenrePickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  /** Mit den Pfeiltasten markierter Eintrag; -1 heißt: keiner */
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionId = (position: number) => `${listId}-option-${position}`;

  const groups = useMemo(() => buildGroups(index, libraryGenres, value, query), [index, libraryGenres, value, query]);
  const items = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  // Die markierte Zeile bleibt beim Blättern mit den Pfeiltasten sichtbar.
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${listId}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, listId]);

  /** Hängt ein eingetipptes Genre an, in der Schreibweise der Genre-Liste („rap“ → Hip-Hop). */
  function withTyped(genres: string[], typed: string): string[] {
    return addGenre(genres, index.canonical(typed));
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

  function choose(position: number) {
    const item = items[position];
    if (!item) return;
    const next = item.selected ? removeGenre(value, item.genre) : addGenre(value, item.genre);
    onChange(next);
    setQuery('');
    // Ohne Suchtext steht wieder die ganze Liste da; die Markierung bleibt beim gewählten Genre.
    const nextItems = buildGroups(index, libraryGenres, next, '').flatMap((group) => group.items);
    setActive(nextItems.findIndex((entry) => genreKey(entry.genre) === genreKey(item.genre)));
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

  let position = -1;
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
            <span key={genreKey(genre)} className="chip genre-chip" title={detailOf(index, genre)}>
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
        <div className="genre-picker-popup" onMouseDown={(event) => event.preventDefault()}>
          {items.length > 0 ? (
            <div id={listId} className="genre-picker-list" role="listbox" aria-multiselectable="true" aria-label="Genres">
              {groups.map((group) => (
                <ul key={group.label} className="genre-group" role="group" aria-label={group.label}>
                  <li className="genre-group-label" role="presentation">
                    {group.label}
                  </li>
                  {group.items.map((item) => {
                    position += 1;
                    const current = position;
                    return (
                      <li
                        key={item.isNew ? `neu:${item.genre}` : genreKey(item.genre)}
                        id={optionId(current)}
                        role="option"
                        aria-selected={item.selected}
                        className={`genre-option${current === active ? ' genre-option-active' : ''}${item.isNew ? ' genre-option-new' : ''}`}
                        onMouseMove={() => {
                          if (current !== active) setActive(current);
                        }}
                        onClick={() => choose(current)}
                      >
                        {item.isNew ? (
                          <Plus size={15} aria-hidden className="genre-option-icon" />
                        ) : (
                          <Check size={15} aria-hidden className="genre-option-icon genre-option-check" />
                        )}
                        <span className="genre-option-name">
                          {item.isNew ? `„${item.genre}“ als eigenes Genre hinzufügen` : item.genre}
                        </span>
                        {item.detail && <span className="genre-option-detail">{item.detail}</span>}
                      </li>
                    );
                  })}
                </ul>
              ))}
              {query.trim() === '' && (
                <p className="genre-picker-more">
                  Tippen durchsucht alle {index.genres.length.toLocaleString('de-DE')} Genres der Liste, z. B. „punk“ oder „house“.
                </p>
              )}
            </div>
          ) : (
            <p className="genre-picker-empty">Die Genre-Liste lädt noch – Genres lassen sich trotzdem eintippen.</p>
          )}
        </div>
      )}
    </div>
  );
}

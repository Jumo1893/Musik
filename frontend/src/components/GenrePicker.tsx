import { useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import {
  genreTree,
  type GenreIndex,
  type GenreTreeMainRow,
  type GenreTreeOptions,
  type GenreTreeRow,
  type GenreTreeSubRow,
} from '../lib/genres.ts';
import { addGenre, genreKey, removeGenre } from '../lib/songs.ts';

interface GenrePickerProps {
  /** id des Eingabefelds, damit die Beschriftung des Felds dazu gehört */
  id: string;
  /** Gewählte Genres in der Reihenfolge, in der sie gewählt wurden */
  value: string[];
  /** Genre-Liste mit Haupt- und Untergenres */
  index: GenreIndex;
  /** Genres, die Songs der Bibliothek schon haben; sie stehen immer in der kurzen Liste ihres Hauptgenres. */
  libraryGenres: string[];
  onChange: (genres: string[]) => void;
}

/** Treffer beim Tippen */
interface MatchRow {
  kind: 'match';
  genre: string;
  /** Hauptgenres des Treffers, „Hauptgenre“ oder „eigenes Genre“ */
  detail: string;
  selected: boolean;
}

/** Eingetipptes Genre, das es noch nicht gibt */
interface NewRow {
  kind: 'new';
  genre: string;
}

type Row = GenreTreeRow | MatchRow | NewRow;

/** Höchstens so viele Treffer zeigt die Suche. */
const MAX_MATCHES = 50;

function detailOf(index: GenreIndex, name: string): string {
  const genre = index.find(name);
  if (genre?.isMain) return 'Hauptgenre';
  const mains = index.mainGenresOf(name);
  if (genre && !genre.custom) return mains.join(' · ');
  return mains.length > 0 ? `${mains.join(' · ')} · eigenes Genre` : 'eigenes Genre';
}

/** Passende Genres der ganzen Liste und, falls es den Namen noch nicht gibt, ein Eintrag zum Anlegen. */
function matchRows(index: GenreIndex, value: readonly string[], query: string): Array<MatchRow | NewRow> {
  const typed = query.trim();
  const selected = new Set(value.map(genreKey));
  const rows: Array<MatchRow | NewRow> = index.search(typed, MAX_MATCHES).map((genre) => ({
    kind: 'match',
    genre: genre.name,
    detail: detailOf(index, genre.name),
    selected: selected.has(genreKey(genre.name)),
  }));
  // Eigene Genres, die noch kein Song gespeichert hat, kennt die Liste noch nicht.
  for (const genre of value) {
    if (!index.find(genre) && genreKey(genre).includes(genreKey(typed))) {
      rows.push({ kind: 'match', genre, detail: detailOf(index, genre), selected: true });
    }
  }
  const exists = index.find(typed) !== undefined || value.some((genre) => genreKey(genre) === genreKey(typed));
  if (!exists) rows.push({ kind: 'new', genre: typed });
  return rows;
}

function isSub(row: Row | undefined): row is GenreTreeSubRow {
  return row?.kind === 'sub';
}

function mainName(row: GenreTreeMainRow): string {
  return row.main ?? 'Ohne Hauptgenre';
}

/**
 * Mehrfachauswahl für Genres als Baumliste: Ein Klick ins Feld (oder Pfeil nach unten) klappt
 * die Hauptgenres auf, ein Klick auf ein Hauptgenre zeigt seine bekanntesten Untergenres, „Mehr
 * anzeigen“ den Rest. Das Kästchen vor einem Hauptgenre wählt das Hauptgenre selbst. Tippen
 * durchsucht die ganze Liste, auch nach anderen Schreibweisen („rap“ findet Hip-Hop). Ein Genre,
 * das es noch nicht gibt, wird mit Enter oder Komma übernommen – oder beim Verlassen des Felds.
 *
 * Tastatur: Pfeil hoch/runter wählt die Zeile, Pfeil rechts/links klappt ein Hauptgenre auf und
 * zu, Enter wählt das Genre der Zeile (bzw. zeigt bei „Mehr anzeigen“ den Rest).
 */
export function GenrePicker({ id, value, index, libraryGenres, onChange }: GenrePickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  /** Markierte Zeile (Pfeiltasten oder Maus); -1 heißt: keine */
  const [active, setActive] = useState(-1);
  /** Aufgeklappte Hauptgenres; null steht für die Gruppe ohne Hauptgenre */
  const [expanded, setExpanded] = useState<ReadonlySet<string | null>>(() => new Set());
  /** Hauptgenres, unter denen nach „Mehr anzeigen“ alle Untergenres stehen */
  const [showAll, setShowAll] = useState<ReadonlySet<string>>(() => new Set());
  /** Abgewählte Genres bleiben stehen, statt unter dem Mauszeiger aus der kurzen Liste zu verschwinden. */
  const [keepVisible, setKeepVisible] = useState<readonly string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Hauptgenre, das nach dem Aufklappen samt Untergenres ins Bild rücken soll */
  const revealRef = useRef<number | null>(null);
  const listId = useId();
  const optionId = (position: number) => `${listId}-option-${position}`;

  const searching = query.trim() !== '';
  const treeOptions: GenreTreeOptions = { value, libraryGenres, keepVisible, expanded, showAll };
  const treeWith = (changes: Partial<GenreTreeOptions>) => genreTree(index, { ...treeOptions, ...changes });
  const rows: Row[] = useMemo(
    () =>
      searching
        ? matchRows(index, value, query)
        : genreTree(index, { value, libraryGenres, keepVisible, expanded, showAll }),
    [searching, index, value, query, libraryGenres, keepVisible, expanded, showAll],
  );

  // Die markierte Zeile bleibt beim Blättern mit den Pfeiltasten sichtbar.
  useEffect(() => {
    if (open && active >= 0) {
      document.getElementById(`${listId}-option-${active}`)?.querySelector(':scope > .genre-row')?.scrollIntoView({ block: 'nearest' });
    }
  }, [open, active, listId]);

  // Ein aufgeklapptes Hauptgenre rückt samt Untergenres ins Bild (passt es nicht, steht es oben).
  useEffect(() => {
    if (revealRef.current === null) return;
    document.getElementById(`${listId}-option-${revealRef.current}`)?.scrollIntoView({ block: 'nearest' });
    revealRef.current = null;
  });

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

  /** Wählt ein Genre oder wählt es ab; ein abgewähltes bleibt in der Liste stehen. */
  function toggleGenre(genre: string, selected: boolean) {
    if (selected) {
      onChange(removeGenre(value, genre));
      setKeepVisible((current) => addGenre(current, genre));
    } else {
      onChange(addGenre(value, genre));
    }
  }

  /** Klappt ein Hauptgenre auf oder zu; zugeklappt zeigt es beim nächsten Mal wieder die kurze Liste. */
  function setMainExpanded(row: GenreTreeMainRow, position: number, expand: boolean) {
    const next = new Set(expanded);
    if (expand) next.add(row.main);
    else next.delete(row.main);
    setExpanded(next);
    if (!expand && row.main !== null && showAll.has(row.main)) {
      const all = new Set(showAll);
      all.delete(row.main);
      setShowAll(all);
    }
    setActive(position);
    if (expand) revealRef.current = position;
  }

  /** „Mehr anzeigen“: alle Untergenres; die Markierung springt zum ersten bisher versteckten. */
  function showMore(main: string, position: number) {
    const before = new Set(rows.filter(isSub).filter((row) => row.main === main).map((row) => genreKey(row.genre)));
    const all = new Set(showAll).add(main);
    setShowAll(all);
    const next = treeWith({ showAll: all });
    const first = next.findIndex((row) => isSub(row) && row.main === main && !before.has(genreKey(row.genre)));
    setActive(first >= 0 ? first : position);
  }

  /** Übernimmt einen Treffer der Suche; danach steht wieder der Baum da, aufgeklappt beim Genre. */
  function chooseMatch(row: MatchRow | NewRow) {
    const removing = row.kind === 'match' && row.selected;
    const next = removing ? removeGenre(value, row.genre) : addGenre(value, row.genre);
    const nextKeep = removing ? addGenre(keepVisible, row.genre) : keepVisible;
    onChange(next);
    setKeepVisible(nextKeep);
    setQuery('');
    let nextExpanded = expanded;
    if (!removing && !index.find(row.genre)?.isMain) {
      // Das (erste) Hauptgenre des Genres aufklappen, damit sichtbar wird, wo es einsortiert ist.
      nextExpanded = new Set(expanded).add(index.mainGenresOf(row.genre)[0] ?? null);
      setExpanded(nextExpanded);
    }
    const key = genreKey(row.genre);
    const tree = treeWith({ value: next, keepVisible: nextKeep, expanded: nextExpanded });
    setActive(
      tree.findIndex((entry) => (entry.kind === 'main' ? entry.main !== null && genreKey(entry.main) === key : isSub(entry) && genreKey(entry.genre) === key)),
    );
  }

  /** Enter oder Klick auf eine Zeile */
  function activate(position: number) {
    const row = rows[position];
    if (!row) return;
    switch (row.kind) {
      case 'main':
        // Die Gruppe ohne Hauptgenre ist selbst kein Genre; Enter klappt sie nur auf und zu.
        if (row.main === null) setMainExpanded(row, position, !row.expanded);
        else toggleGenre(row.main, row.selected);
        break;
      case 'sub':
        toggleGenre(row.genre, row.selected);
        break;
      case 'more':
        showMore(row.main, position);
        break;
      case 'match':
      case 'new':
        chooseMatch(row);
        break;
    }
  }

  /** Position des Hauptgenres, unter dem die Zeile steht */
  function parentOf(position: number): number {
    for (let current = position; current >= 0; current -= 1) {
      if (rows[current]?.kind === 'main') return current;
    }
    return position;
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
    const row = open && active >= 0 ? rows[active] : undefined;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) {
          setOpen(true);
          setActive(rows.length > 0 ? 0 : -1);
        } else {
          setActive((current) => Math.min(current + 1, rows.length - 1));
        }
        break;
      case 'ArrowUp':
        if (!open) break;
        event.preventDefault();
        setActive((current) => Math.max(current - 1, 0));
        break;
      case 'ArrowRight':
        // Beim Tippen bewegen die Pfeile nach links und rechts wie gewohnt die Schreibmarke.
        if (searching || row?.kind !== 'main') break;
        event.preventDefault();
        if (!row.expanded) setMainExpanded(row, active, true);
        else if (rows[active + 1] && rows[active + 1]!.kind !== 'main') setActive(active + 1);
        break;
      case 'ArrowLeft':
        if (searching || !row) break;
        if (row.kind === 'main') {
          if (row.expanded) {
            event.preventDefault();
            setMainExpanded(row, active, false);
          }
        } else if (row.kind === 'sub' || row.kind === 'more') {
          event.preventDefault();
          setActive(parentOf(active));
        }
        break;
      case 'Enter':
        // Strg+Enter speichert den ganzen Song (Kürzel des Dialogs).
        if (event.ctrlKey || event.metaKey) break;
        // Enter wählt aus bzw. übernimmt; das Song-Formular wird nur bei leerem, geschlossenem Feld abgeschickt.
        if (row) {
          event.preventDefault();
          activate(active);
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

  /** Gemeinsame Eigenschaften der sichtbaren Zeile (das div im Listeneintrag) */
  function rowProps(position: number, className: string, onClick: () => void) {
    return {
      className: `genre-row ${className}${position === active ? ' genre-row-active' : ''}`,
      onMouseMove: () => {
        if (position !== active) setActive(position);
      },
      onClick,
    };
  }

  function renderSub(row: GenreTreeSubRow, position: number): ReactNode {
    const info = index.find(row.genre);
    return (
      <li key={`sub:${row.genre}`} id={optionId(position)} role="treeitem" aria-level={2} aria-selected={row.selected}>
        <div {...rowProps(position, 'genre-row-sub', () => activate(position))}>
          <span className="genre-check" aria-hidden>
            <Check size={12} strokeWidth={3} />
          </span>
          <span className="genre-row-name">{row.genre}</span>
          {(!info || info.custom) && <span className="genre-row-detail">eigenes Genre</span>}
        </div>
      </li>
    );
  }

  function renderTree(): ReactNode {
    const groups: Array<{ row: GenreTreeMainRow; position: number; children: number[] }> = [];
    rows.forEach((row, position) => {
      if (row.kind === 'main') groups.push({ row, position, children: [] });
      else groups.at(-1)?.children.push(position);
    });
    return groups.map(({ row, position, children }) => {
      const name = mainName(row);
      const label =
        row.selectedCount > 0
          ? `${name}, ${row.selectedCount} ${row.selectedCount === 1 ? 'Untergenre' : 'Untergenres'} gewählt`
          : name;
      return (
        <li
          key={`main:${name}`}
          id={optionId(position)}
          role="treeitem"
          aria-level={1}
          aria-expanded={row.expanded}
          aria-selected={row.main === null ? undefined : row.selected}
          aria-label={label}
        >
          <div {...rowProps(position, 'genre-row-main', () => setMainExpanded(row, position, !row.expanded))}>
            <ChevronRight size={16} aria-hidden className="genre-row-toggle" />
            {row.main !== null && (
              <span
                className="genre-check"
                aria-hidden
                title={row.selected ? `„${row.main}“ abwählen` : `„${row.main}“ als Genre wählen`}
                onClick={(event) => {
                  // Das Kästchen wählt das Hauptgenre; der Rest der Zeile klappt auf und zu.
                  event.stopPropagation();
                  setActive(position);
                  toggleGenre(row.main!, row.selected);
                }}
              >
                <Check size={12} strokeWidth={3} />
              </span>
            )}
            <span className="genre-row-name">{name}</span>
            {row.selectedCount > 0 && (
              <span className="genre-row-count" aria-hidden>
                {row.selectedCount} gewählt
              </span>
            )}
          </div>
          {row.expanded && children.length > 0 && (
            <ul className="genre-tree-group" role="group">
              {children.map((childPosition) => {
                const child = rows[childPosition];
                if (isSub(child)) return renderSub(child, childPosition);
                if (child?.kind !== 'more') return null;
                return (
                  <li
                    key="mehr"
                    id={optionId(childPosition)}
                    role="treeitem"
                    aria-level={2}
                    aria-label={`Mehr anzeigen: ${child.hidden} weitere Untergenres von ${child.main}`}
                  >
                    <div {...rowProps(childPosition, 'genre-row-sub genre-row-more', () => activate(childPosition))}>
                      <Plus size={14} aria-hidden className="genre-row-icon" />
                      <span className="genre-row-name">Mehr anzeigen ({child.hidden.toLocaleString('de-DE')} weitere)</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      );
    });
  }

  function renderMatches(): ReactNode {
    const matches = rows.filter((row) => row.kind === 'match').length;
    return rows.map((row, position) => {
      if (row.kind === 'match') {
        return (
          <li key={`treffer:${row.genre}`} id={optionId(position)} role="treeitem" aria-level={1} aria-selected={row.selected}>
            {position === 0 && (
              <div className="genre-tree-label" aria-hidden>
                Treffer
              </div>
            )}
            <div {...rowProps(position, '', () => activate(position))}>
              <span className="genre-check" aria-hidden>
                <Check size={12} strokeWidth={3} />
              </span>
              <span className="genre-row-name">{row.genre}</span>
              {row.detail && <span className="genre-row-detail">{row.detail}</span>}
            </div>
          </li>
        );
      }
      if (row.kind !== 'new') return null;
      return (
        <li key={`neu:${row.genre}`} id={optionId(position)} role="treeitem" aria-level={1}>
          <div className={`genre-tree-label${matches > 0 ? ' genre-tree-label-divided' : ''}`} aria-hidden>
            Neu
          </div>
          <div {...rowProps(position, 'genre-row-new', () => activate(position))}>
            <Plus size={15} aria-hidden className="genre-row-icon" />
            <span className="genre-row-name">„{row.genre}“ als eigenes Genre hinzufügen</span>
          </div>
        </li>
      );
    });
  }

  let popupContent: ReactNode;
  if (rows.length === 0) {
    popupContent = <p className="genre-picker-empty">Die Genre-Liste lädt noch – Genres lassen sich trotzdem eintippen.</p>;
  } else {
    popupContent = (
      <>
        <ul id={listId} className="genre-tree" role="tree" aria-multiselectable="true" aria-label="Genres">
          {searching ? renderMatches() : renderTree()}
        </ul>
        {!searching && (
          <p className="genre-picker-more">
            Tippen durchsucht alle {index.genres.length.toLocaleString('de-DE')} Genres der Liste, z. B. „punk“ oder „house“.
          </p>
        )}
      </>
    );
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
            aria-haspopup="tree"
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
          {popupContent}
        </div>
      )}
    </div>
  );
}

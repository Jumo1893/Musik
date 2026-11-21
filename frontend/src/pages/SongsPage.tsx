import { useMemo, useState } from 'react';
import { Download, Library, Plus } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { SongFormDialog } from '../components/SongFormDialog.tsx';
import { StreamingLinks } from '../components/StreamingLinks.tsx';
import {
  Artwork,
  CategoryChips,
  ChipToggle,
  EmptyState,
  ErrorNote,
  LoadingNote,
  PageHeader,
  Stars,
} from '../components/ui.tsx';
import { downloadTextFile, toCsv } from '../lib/csv.ts';
import { libraryLanguages } from '../lib/languages.ts';
import { formatDuration, formatSongCount, formatTotalDuration } from '../lib/format.ts';
import { filterSongs, SONG_CSV_HEADER, songCsvRow, sortSongs, totalDuration, type SortState } from '../lib/songs.ts';
import { useById, useCategories, useSongs } from '../queries.ts';
import type { Song } from '../types.ts';

const SORT_OPTIONS: Array<{ id: string; label: string; sort: SortState }> = [
  { id: 'artist', label: 'Interpret (A–Z)', sort: { key: 'artist', descending: false } },
  { id: 'title', label: 'Titel (A–Z)', sort: { key: 'title', descending: false } },
  { id: 'added', label: 'Zuletzt hinzugefügt', sort: { key: 'added', descending: true } },
  { id: 'rating', label: 'Beste Bewertung', sort: { key: 'rating', descending: true } },
  { id: 'longest', label: 'Längste zuerst', sort: { key: 'duration', descending: true } },
  { id: 'shortest', label: 'Kürzeste zuerst', sort: { key: 'duration', descending: false } },
  { id: 'newest', label: 'Neueste Veröffentlichung', sort: { key: 'year', descending: true } },
  { id: 'oldest', label: 'Älteste Veröffentlichung', sort: { key: 'year', descending: false } },
];

// Der Kategorie-Filter steht in der Adresse (?kategorie=1,3), damit die
// Kategorien-Seite direkt auf eine gefilterte Songliste verlinken kann.
const PARAM_CATEGORIES = 'kategorie';
const PARAM_WITHOUT = 'ohne';
// Sprach-Filter: ?sprache=Deutsch, ?sprache=ohne für Songs ohne Angabe
const PARAM_LANGUAGE = 'sprache';
const LANGUAGE_NONE = 'ohne';

function parseIds(value: string | null): number[] {
  return (value ?? '')
    .split(',')
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
}

export function SongsPage() {
  const songs = useSongs();
  const categories = useCategories();
  const categoriesById = useById(categories.data);
  const [searchParams, setSearchParams] = useSearchParams();
  const [text, setText] = useState('');
  const [sortId, setSortId] = useState(SORT_OPTIONS[0]!.id);
  const [editing, setEditing] = useState<Song | 'new' | null>(null);

  const categoryParam = searchParams.get(PARAM_CATEGORIES);
  const selectedIds = useMemo(() => parseIds(categoryParam), [categoryParam]);
  const onlyUncategorized = searchParams.get(PARAM_WITHOUT) === 'kategorie';
  const languageParam = searchParams.get(PARAM_LANGUAGE);
  const sort = (SORT_OPTIONS.find((option) => option.id === sortId) ?? SORT_OPTIONS[0]!).sort;

  const visible = useMemo(() => {
    const language = languageParam === null ? {} : { language: languageParam === LANGUAGE_NONE ? null : languageParam };
    return sortSongs(filterSongs(songs.data ?? [], { text, categoryIds: selectedIds, onlyUncategorized, ...language }), sort);
  }, [songs.data, text, selectedIds, onlyUncategorized, languageParam, sort]);
  const languages = useMemo(() => libraryLanguages(songs.data ?? []), [songs.data]);

  function setLanguage(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === '') next.delete(PARAM_LANGUAGE);
    else next.set(PARAM_LANGUAGE, value);
    setSearchParams(next, { replace: true });
  }

  function setFilter(categoryIds: number[], uncategorized: boolean) {
    const next = new URLSearchParams(searchParams);
    next.delete(PARAM_CATEGORIES);
    next.delete(PARAM_WITHOUT);
    if (uncategorized) next.set(PARAM_WITHOUT, 'kategorie');
    else if (categoryIds.length > 0) next.set(PARAM_CATEGORIES, categoryIds.join(','));
    setSearchParams(next, { replace: true });
  }

  function toggleCategory(id: number) {
    setFilter(selectedIds.includes(id) ? selectedIds.filter((existing) => existing !== id) : [...selectedIds, id], false);
  }

  function resetFilters() {
    setText('');
    const next = new URLSearchParams(searchParams);
    for (const param of [PARAM_CATEGORIES, PARAM_WITHOUT, PARAM_LANGUAGE]) next.delete(param);
    setSearchParams(next, { replace: true });
  }

  function exportCsv() {
    const csv = toCsv(
      SONG_CSV_HEADER,
      visible.map((song) => songCsvRow(song, categoriesById)),
    );
    downloadTextFile(`musik-songs-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const all = songs.data ?? [];
  const filtered = text.trim() !== '' || selectedIds.length > 0 || onlyUncategorized || languageParam !== null;
  const uncategorizedCount = all.filter((song) => song.categoryIds.length === 0).length;
  const withoutLanguage = all.filter((song) => song.language === null).length;

  return (
    <>
      <PageHeader
        title="Songs"
        subtitle="Deine Lieblingssongs mit Kategorien, Bewertung und Links zu den Streaming-Plattformen."
        actions={
          <>
            <button type="button" className="button" onClick={exportCsv} disabled={visible.length === 0}>
              <Download size={16} aria-hidden />
              Als CSV exportieren
            </button>
            <button type="button" className="button button-primary" onClick={() => setEditing('new')}>
              <Plus size={16} aria-hidden />
              Song hinzufügen
            </button>
          </>
        }
      />

      {songs.isPending ? (
        <LoadingNote label="Lade Songs …" />
      ) : songs.isError ? (
        <ErrorNote error={songs.error} onRetry={() => void songs.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState icon={<Library size={28} aria-hidden />} title="Noch keine Songs">
          <p>
            Such einen Song online und übernimm Titel, Album, Dauer und Cover mit einem Klick – oder trag ihn von Hand
            ein.
          </p>
          <button type="button" className="button button-primary" onClick={() => setEditing('new')}>
            <Plus size={16} aria-hidden />
            Ersten Song hinzufügen
          </button>
        </EmptyState>
      ) : (
        <>
          <div className="toolbar">
            <input
              className="input toolbar-search"
              type="search"
              value={text}
              placeholder="Titel, Interpret, Album oder Genre suchen"
              aria-label="Songs durchsuchen"
              onChange={(event) => setText(event.target.value)}
            />
            <label className="toolbar-sort">
              <span>Sortieren</span>
              <select className="input" value={sortId} onChange={(event) => setSortId(event.target.value)}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {(languages.length > 0 || languageParam !== null) && (
              <label className="toolbar-sort">
                <span>Sprache</span>
                <select className="input" value={languageParam ?? ''} onChange={(event) => setLanguage(event.target.value)}>
                  <option value="">alle</option>
                  {languages.map(({ language, count }) => (
                    <option key={language} value={language}>
                      {language} ({count})
                    </option>
                  ))}
                  {withoutLanguage > 0 && <option value={LANGUAGE_NONE}>ohne Angabe ({withoutLanguage})</option>}
                </select>
              </label>
            )}
          </div>

          {(categories.data ?? []).length > 0 && (
            <div className="filter-chips" role="group" aria-label="Nach Kategorien filtern">
              {(categories.data ?? []).map((category) => (
                <ChipToggle
                  key={category.id}
                  category={category}
                  count={category.songCount}
                  pressed={selectedIds.includes(category.id)}
                  onToggle={() => toggleCategory(category.id)}
                />
              ))}
              {uncategorizedCount > 0 && (
                <button
                  type="button"
                  className="chip chip-toggle chip-plain"
                  aria-pressed={onlyUncategorized}
                  onClick={() => setFilter([], !onlyUncategorized)}
                >
                  ohne Kategorie
                  <span className="chip-count">{uncategorizedCount}</span>
                </button>
              )}
            </div>
          )}

          <p className="list-summary" role="status">
            {filtered ? `${visible.length} von ${formatSongCount(all.length)}` : formatSongCount(all.length)}
            {' · '}
            {formatTotalDuration(totalDuration(visible))}
            {filtered && (
              <button type="button" className="link-button" onClick={resetFilters}>
                Filter zurücksetzen
              </button>
            )}
          </p>

          {visible.length === 0 ? (
            <EmptyState title="Kein Song passt zu den Filtern">
              <button type="button" className="button" onClick={resetFilters}>
                Filter zurücksetzen
              </button>
            </EmptyState>
          ) : (
            <div className="card table-card">
              <table className="table table-fixed table-songs">
                <thead>
                  <tr>
                    <th className="col-song">Titel und Interpret</th>
                    <th className="col-categories">Kategorien</th>
                    <th className="col-duration cell-number">Dauer</th>
                    <th className="col-rating">Bewertung</th>
                    <th className="col-links">Anhören</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((song) => (
                    <tr key={song.id} className="row-clickable" onClick={() => setEditing(song)}>
                      <td className="col-song">
                        <div className="song-cell">
                          <Artwork url={song.artworkUrl} />
                          <div className="song-cell-text">
                            <button
                              type="button"
                              className="song-title"
                              title={`${song.title} – bearbeiten`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditing(song);
                              }}
                            >
                              {song.title}
                            </button>
                            <span className="song-sub" title={[song.artist, song.album, song.releaseYear].filter(Boolean).join(' · ')}>
                              {[song.artist, song.album].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="col-categories">
                        <CategoryChips ids={song.categoryIds} categories={categoriesById} />
                      </td>
                      <td className="col-duration cell-number">{formatDuration(song.durationSeconds)}</td>
                      <td className="col-rating">
                        <Stars value={song.rating} />
                      </td>
                      <td className="col-links">
                        <StreamingLinks song={song} compact />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {editing && <SongFormDialog song={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

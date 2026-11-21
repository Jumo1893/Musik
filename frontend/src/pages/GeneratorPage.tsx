import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, Save, X } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, errorMessage } from '../api.ts';
import {
  Artwork,
  CategoryChips,
  ChipToggle,
  EmptyState,
  ENERGY_LABELS,
  ErrorNote,
  LoadingNote,
  PageHeader,
  RATING_LABELS,
  ScaleInput,
  SING_ALONG_LABELS,
} from '../components/ui.tsx';
import { EMPTY_CRITERIA, ORDER_OPTIONS, randomSeed, suggestPlaylistName } from '../lib/criteria.ts';
import { formatDuration, formatSongCount, formatTotalDuration } from '../lib/format.ts';
import { libraryGenreGroups } from '../lib/genres.ts';
import { libraryLanguages, sameLanguage } from '../lib/languages.ts';
import { totalDuration } from '../lib/songs.ts';
import { useById, useCategories, useCreatePlaylist, useGenreIndex, usePlaylists, useSongs } from '../queries.ts';
import type { Category, GeneratorCriteria, PlaylistOrder, Song } from '../types.ts';

const DURATION_PRESETS = [30, 45, 60, 90, 120];

/** Filter für die Skalen von 1 bis 5, jeweils mit Mindest- und Höchstwert. */
const SCALE_FILTERS = [
  { legend: 'Energie', labels: ENERGY_LABELS, minKey: 'energyMin', maxKey: 'energyMax', missing: 'energy' },
  { legend: 'Mitsingen', labels: SING_ALONG_LABELS, minKey: 'singAlongMin', maxKey: 'singAlongMax', missing: 'singAlong' },
] as const;

/** Gibt einen Wert erst weiter, wenn er sich kurz nicht geändert hat (z. B. während des Tippens). */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Leer → null, gültige Ganzzahl im Bereich → Zahl, sonst undefined. */
function parseNumber(text: string, min: number, max: number): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value >= min && value <= max ? value : undefined;
}

interface NumberFieldProps {
  label: string;
  value: number | null;
  min: number;
  max: number;
  placeholder?: string;
  onChange: (value: number | null) => void;
}

/**
 * Zahlenfeld, das halb getippte Werte verträgt: Solange die Eingabe ungültig ist
 * (etwa „19“ auf dem Weg zu „1990“), gilt das Kriterium als nicht gesetzt.
 */
function NumberField({ label, value, min, max, placeholder, onChange }: NumberFieldProps) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const parsed = parseNumber(text, min, max);

  // Von außen gesetzte Werte (Schnellauswahl) ins Feld übernehmen.
  useEffect(() => {
    setText((current) => {
      const currentValue = parseNumber(current, min, max);
      if (currentValue === value || (currentValue === undefined && value === null)) return current;
      return value === null ? '' : String(value);
    });
  }, [value, min, max]);

  return (
    <label className={`field ${parsed === undefined ? 'field-invalid' : ''}`}>
      <span className="field-label">{label}</span>
      <input
        className="input"
        inputMode="numeric"
        value={text}
        placeholder={placeholder ?? 'egal'}
        onChange={(event) => {
          setText(event.target.value);
          onChange(parseNumber(event.target.value, min, max) ?? null);
        }}
      />
      {parsed === undefined && (
        <span className="field-error">
          Zahl von {min} bis {max}
        </span>
      )}
    </label>
  );
}

export function GeneratorPage() {
  const [searchParams] = useSearchParams();
  const songs = useSongs();
  const categories = useCategories();
  const playlists = usePlaylists();
  const templateId = Number(searchParams.get('vorlage'));
  const needsTemplate = Number.isInteger(templateId) && templateId > 0;

  if (songs.isPending || categories.isPending || (needsTemplate && playlists.isPending)) {
    return <LoadingNote label="Lade Bibliothek …" />;
  }
  if (songs.isError) return <ErrorNote error={songs.error} onRetry={() => void songs.refetch()} />;
  if (categories.isError) return <ErrorNote error={categories.error} onRetry={() => void categories.refetch()} />;

  if (songs.data.length === 0) {
    return (
      <>
        <PageHeader title="Playlist erzeugen" />
        <EmptyState title="Erst ein paar Songs anlegen">
          <p>Der Generator stellt Playlists aus deiner Bibliothek zusammen – die ist noch leer.</p>
          <Link className="button button-primary" to="/songs">
            Zu den Songs
          </Link>
        </EmptyState>
      </>
    );
  }

  // Kriterien einer bestehenden Playlist als Ausgangspunkt (?vorlage=ID). Kategorien,
  // die es nicht mehr gibt, fallen heraus; ausgeschlossene Einzelsongs werden nicht übernommen.
  const template = needsTemplate ? playlists.data?.find((playlist) => playlist.id === templateId)?.criteria : null;
  const knownIds = new Set(categories.data.map((category) => category.id));
  const initial: GeneratorCriteria = template
    ? {
        ...EMPTY_CRITERIA,
        ...template,
        includeCategoryIds: template.includeCategoryIds.filter((id) => knownIds.has(id)),
        excludeCategoryIds: template.excludeCategoryIds.filter((id) => knownIds.has(id)),
        excludeSongIds: [],
        seed: null,
      }
    : EMPTY_CRITERIA;

  return <Generator initial={initial} songs={songs.data} categories={categories.data} />;
}

interface GeneratorProps {
  initial: GeneratorCriteria;
  songs: Song[];
  categories: Category[];
}

function Generator({ initial, songs, categories }: GeneratorProps) {
  const navigate = useNavigate();
  const createPlaylist = useCreatePlaylist();
  const songsById = useById(songs);
  const categoriesById = useById(categories);
  const [criteria, setCriteria] = useState(initial);
  const [seed, setSeed] = useState(randomSeed);
  const [name, setName] = useState('');

  const genreIndex = useGenreIndex();
  const genreGroups = useMemo(() => libraryGenreGroups(songs, genreIndex), [songs, genreIndex]);
  const languageOptions = useMemo(() => libraryLanguages(songs), [songs]);
  const request = useDebounced(
    useMemo(() => ({ ...criteria, seed }), [criteria, seed]),
    250,
  );

  const proposal = useQuery({
    queryKey: ['generate', request],
    queryFn: ({ signal }) => api.playlists.generate(request, signal),
    placeholderData: keepPreviousData,
  });

  function update(changes: Partial<GeneratorCriteria>) {
    setCriteria((current) => ({ ...current, ...changes }));
  }

  /** Eine Kategorie ist entweder gewünscht oder ausgeschlossen, nie beides. */
  function toggleCategory(list: 'includeCategoryIds' | 'excludeCategoryIds', id: number) {
    setCriteria((current) => {
      const other = list === 'includeCategoryIds' ? 'excludeCategoryIds' : 'includeCategoryIds';
      const selected = current[list].includes(id);
      return {
        ...current,
        [list]: selected ? current[list].filter((existing) => existing !== id) : [...current[list], id],
        [other]: current[other].filter((existing) => existing !== id),
      };
    });
  }

  function toggleLanguage(language: string) {
    setCriteria((current) => ({
      ...current,
      languages: current.languages.some((existing) => sameLanguage(existing, language))
        ? current.languages.filter((existing) => !sameLanguage(existing, language))
        : [...current.languages, language],
    }));
  }

  function toggleGenre(genre: string) {
    setCriteria((current) => ({
      ...current,
      genres: current.genres.includes(genre)
        ? current.genres.filter((existing) => existing !== genre)
        : [...current.genres, genre],
    }));
  }

  const proposed = (proposal.data?.songIds ?? []).map((id) => songsById.get(id)).filter((song) => song !== undefined);
  const suggestedName = suggestPlaylistName(criteria, categoriesById);
  const showEnergy = criteria.order.startsWith('energy');
  const pendingChange = request.seed !== seed || proposal.isPlaceholderData;

  // Wie viele Songs ein Filter mangels Angabe gar nicht erst berücksichtigen kann.
  const missing = {
    rating: criteria.minRating === null ? 0 : songs.filter((song) => song.rating === null).length,
    energy:
      criteria.energyMin === null && criteria.energyMax === null ? 0 : songs.filter((song) => song.energy === null).length,
    singAlong:
      criteria.singAlongMin === null && criteria.singAlongMax === null
        ? 0
        : songs.filter((song) => song.singAlong === null).length,
    year:
      criteria.yearFrom === null && criteria.yearTo === null ? 0 : songs.filter((song) => song.releaseYear === null).length,
    explicit: songs.filter((song) => song.explicit === null).length,
    language: criteria.languages.length === 0 ? 0 : songs.filter((song) => song.language === null).length,
  };
  const missingNote = (count: number, what: string) =>
    count > 0 ? (
      <p className="field-hint">
        {formatSongCount(count)} ohne {what} {count === 1 ? 'bleibt' : 'bleiben'} dabei außen vor.
      </p>
    ) : null;

  function save() {
    if (!proposal.data || proposed.length === 0) return;
    createPlaylist.mutate(
      {
        name: name.trim() || suggestedName,
        description: null,
        songIds: proposed.map((song) => song.id),
        criteria: { ...criteria, seed: proposal.data.seed },
      },
      { onSuccess: (playlist) => void navigate(`/playlists/${playlist.id}`) },
    );
  }

  return (
    <>
      <Link className="back-link" to="/playlists">
        <ArrowLeft size={16} aria-hidden />
        Alle Playlists
      </Link>
      <PageHeader
        title="Playlist erzeugen"
        subtitle="Leg fest, was passen soll – der Vorschlag rechts aktualisiert sich sofort."
      />

      <div className="generator">
        <form className="card generator-form" onSubmit={(event) => event.preventDefault()}>
          <fieldset className="form-section">
            <legend>Gewünschte Kategorien</legend>
            {categories.length === 0 ? (
              <p className="field-hint">
                Noch keine Kategorien angelegt. <Link to="/kategorien">Kategorien anlegen</Link>
              </p>
            ) : (
              <div className="chip-list">
                {categories.map((category) => (
                  <ChipToggle
                    key={category.id}
                    category={category}
                    count={category.songCount}
                    pressed={criteria.includeCategoryIds.includes(category.id)}
                    onToggle={() => toggleCategory('includeCategoryIds', category.id)}
                  />
                ))}
              </div>
            )}
            {criteria.includeCategoryIds.length > 1 && (
              <div className="segmented" role="group" aria-label="Wie viele der Kategorien müssen passen?">
                <button type="button" aria-pressed={criteria.matchMode === 'any'} onClick={() => update({ matchMode: 'any' })}>
                  Mindestens eine davon
                </button>
                <button type="button" aria-pressed={criteria.matchMode === 'all'} onClick={() => update({ matchMode: 'all' })}>
                  Alle zusammen
                </button>
              </div>
            )}
            {criteria.includeCategoryIds.length > 1 && criteria.matchMode === 'any' && (
              <p className="field-hint">Songs, die mehrere der Kategorien treffen, werden bevorzugt.</p>
            )}
          </fieldset>

          {categories.length > 0 && (
            <fieldset className="form-section">
              <legend>Nicht dabei haben</legend>
              <div className="chip-list">
                {categories.map((category) => (
                  <ChipToggle
                    key={category.id}
                    category={category}
                    tone="exclude"
                    pressed={criteria.excludeCategoryIds.includes(category.id)}
                    onToggle={() => toggleCategory('excludeCategoryIds', category.id)}
                  />
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="form-section">
            <legend>Länge</legend>
            <div className="form-row">
              <NumberField
                label="Ziel-Dauer in Minuten"
                value={criteria.targetMinutes}
                min={1}
                max={1440}
                onChange={(targetMinutes) => update({ targetMinutes })}
              />
              <NumberField
                label="Max. Songs"
                value={criteria.maxSongs}
                min={1}
                max={1000}
                onChange={(maxSongs) => update({ maxSongs })}
              />
            </div>
            <div className="preset-row" role="group" aria-label="Ziel-Dauer wählen">
              {DURATION_PRESETS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className="button button-small"
                  aria-pressed={criteria.targetMinutes === minutes}
                  onClick={() => update({ targetMinutes: minutes })}
                >
                  {minutes} Min.
                </button>
              ))}
              <button
                type="button"
                className="button button-small"
                aria-pressed={criteria.targetMinutes === null}
                onClick={() => update({ targetMinutes: null })}
              >
                egal
              </button>
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>Reihenfolge</legend>
            <select
              className="input"
              aria-label="Reihenfolge"
              value={criteria.order}
              onChange={(event) => update({ order: event.target.value as PlaylistOrder })}
            >
              {ORDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="field-hint">{ORDER_OPTIONS.find((option) => option.value === criteria.order)?.hint}</p>
            <div className="form-row">
              <NumberField
                label="Max. Songs pro Interpret"
                value={criteria.maxPerArtist}
                min={1}
                max={100}
                onChange={(maxPerArtist) => update({ maxPerArtist })}
              />
            </div>
          </fieldset>

          {SCALE_FILTERS.map((filter) => (
            <fieldset key={filter.legend} className="form-section">
              <legend>{filter.legend}</legend>
              <div className="form-row">
                {([filter.minKey, filter.maxKey] as const).map((key) => (
                  <label key={key} className="field">
                    <span className="field-label">{key === filter.minKey ? 'Mindestens' : 'Höchstens'}</span>
                    <select
                      className="input"
                      value={criteria[key] ?? ''}
                      onChange={(event) => update({ [key]: event.target.value === '' ? null : Number(event.target.value) })}
                    >
                      <option value="">egal</option>
                      {filter.labels.map((label, index) => (
                        <option key={label} value={index + 1}>
                          {index + 1} – {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {missingNote(missing[filter.missing], `${filter.legend}-Angabe`)}
            </fieldset>
          ))}

          <fieldset className="form-section">
            <legend>Mindestbewertung</legend>
            <ScaleInput
              variant="stars"
              groupLabel="Mindestbewertung"
              labels={RATING_LABELS}
              value={criteria.minRating}
              onChange={(minRating) => update({ minRating })}
            />
            {missingNote(missing.rating, 'Bewertung')}
          </fieldset>

          <fieldset className="form-section">
            <legend>Texte</legend>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={criteria.excludeExplicit}
                onChange={(event) => update({ excludeExplicit: event.target.checked })}
              />
              Ohne explizite Texte
            </label>
            <p className="field-hint">
              Etwa für Familienfeiern oder das Büro. Songs ohne Angabe bleiben dabei
              {criteria.excludeExplicit && missing.explicit > 0 ? ` (${formatSongCount(missing.explicit)})` : ''}.
            </p>
          </fieldset>

          {languageOptions.length > 0 && (
            <fieldset className="form-section">
              <legend>Sprache</legend>
              <div className="chip-list">
                {languageOptions.map(({ language, count }) => (
                  <button
                    key={language}
                    type="button"
                    className="chip chip-toggle chip-plain"
                    aria-pressed={criteria.languages.some((existing) => sameLanguage(existing, language))}
                    onClick={() => toggleLanguage(language)}
                  >
                    {language}
                    <span className="chip-count">{count}</span>
                  </button>
                ))}
              </div>
              <p className="field-hint">Nichts gewählt heißt: alle Sprachen. „Instrumental“ sind Songs ohne Gesang.</p>
              {missingNote(missing.language, 'Sprach-Angabe')}
            </fieldset>
          )}

          <fieldset className="form-section">
            <legend>Erscheinungsjahr</legend>
            <div className="form-row">
              <NumberField label="Von" value={criteria.yearFrom} min={1000} max={2200} onChange={(yearFrom) => update({ yearFrom })} />
              <NumberField label="Bis" value={criteria.yearTo} min={1000} max={2200} onChange={(yearTo) => update({ yearTo })} />
            </div>
            {missingNote(missing.year, 'Jahr')}
          </fieldset>

          {genreGroups.length > 0 && (
            <fieldset className="form-section">
              <legend>Genres</legend>
              <div className="genre-groups">
                {genreGroups.map((group) => (
                  <div key={group.main ?? '–'} className="genre-group-row">
                    {group.main ? (
                      <button
                        type="button"
                        className="chip chip-toggle chip-plain genre-main-chip"
                        aria-pressed={criteria.genres.includes(group.main)}
                        title={`Alle Songs im Hauptgenre ${group.main}`}
                        onClick={() => toggleGenre(group.main!)}
                      >
                        {group.main}
                      </button>
                    ) : (
                      <span className="genre-group-none">Ohne Hauptgenre</span>
                    )}
                    {group.subgenres.map((genre) => (
                      <button
                        key={genre}
                        type="button"
                        className="chip chip-toggle chip-plain genre-sub-chip"
                        aria-pressed={criteria.genres.includes(genre)}
                        onClick={() => toggleGenre(genre)}
                      >
                        {genre}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <p className="field-hint">Ein Hauptgenre umfasst alle seine Untergenres. Nichts gewählt heißt: alle Genres.</p>
            </fieldset>
          )}

          <button type="button" className="button" onClick={() => setCriteria(EMPTY_CRITERIA)}>
            Alle Kriterien zurücksetzen
          </button>
        </form>

        <section className="generator-result" aria-label="Vorschlag">
          <div className="card result-head">
            <div className="result-save">
              <label className="field result-name">
                <span className="field-label">Name der Playlist</span>
                <input
                  className="input"
                  value={name}
                  maxLength={200}
                  placeholder={suggestedName}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <button type="button" className="button" onClick={() => setSeed(randomSeed())} disabled={proposed.length === 0}>
                <RefreshCw size={16} aria-hidden />
                Neu mischen
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={save}
                disabled={proposed.length === 0 || pendingChange || createPlaylist.isPending}
              >
                <Save size={16} aria-hidden />
                Playlist speichern
              </button>
            </div>
            {createPlaylist.isError && (
              <p className="form-error" role="alert">
                {errorMessage(createPlaylist.error)}
              </p>
            )}
            {proposal.data && (
              <p className="list-summary" role="status">
                {formatSongCount(proposed.length)} · {formatTotalDuration(totalDuration(proposed))} – ausgewählt aus{' '}
                {formatSongCount(proposal.data.candidateCount)}, {proposal.data.candidateCount === 1 ? 'der' : 'die'} zu den
                Kriterien {proposal.data.candidateCount === 1 ? 'passt' : 'passen'}.
                {criteria.excludeSongIds.length > 0 && (
                  <button type="button" className="link-button" onClick={() => update({ excludeSongIds: [] })}>
                    {formatSongCount(criteria.excludeSongIds.length)} wieder zulassen
                  </button>
                )}
              </p>
            )}
          </div>

          {proposal.isPending ? (
            <LoadingNote label="Stelle Vorschlag zusammen …" />
          ) : proposal.isError ? (
            <ErrorNote error={proposal.error} onRetry={() => void proposal.refetch()} />
          ) : proposed.length === 0 ? (
            <EmptyState title={proposal.data.candidateCount === 0 ? 'Kein Song passt zu diesen Kriterien' : 'Kein Song passt in die Ziel-Dauer'}>
              <p>
                {proposal.data.candidateCount === 0
                  ? 'Lockere die Kriterien – zum Beispiel weniger Kategorien oder „Mindestens eine davon“.'
                  : 'Die passenden Songs sind alle länger als die gewünschte Dauer.'}
              </p>
            </EmptyState>
          ) : (
            <ol className={`card result-list ${pendingChange ? 'result-list-stale' : ''}`}>
              {proposed.map((song, index) => (
                <li key={song.id} className="result-row">
                  <span className="result-position">{index + 1}</span>
                  <Artwork url={song.artworkUrl} size={36} />
                  <span className="result-text">
                    <span className="song-title-text">{song.title}</span>
                    <span className="song-sub">{song.artist}</span>
                  </span>
                  <span className="result-categories">
                    <CategoryChips ids={song.categoryIds} categories={categoriesById} />
                  </span>
                  {showEnergy && (
                    <span className="result-energy" title={song.energy === null ? 'Energie: keine Angabe' : `Energie: ${ENERGY_LABELS[song.energy - 1]}`}>
                      {song.energy === null ? 'Energie –' : `Energie ${song.energy}`}
                    </span>
                  )}
                  <span className="cell-number">{formatDuration(song.durationSeconds)}</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${song.title} nicht vorschlagen`}
                    title="Diesen Song nicht vorschlagen"
                    onClick={() => update({ excludeSongIds: [...criteria.excludeSongIds, song.id] })}
                  >
                    <X size={16} aria-hidden />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}

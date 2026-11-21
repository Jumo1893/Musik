import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, CopyCheck, Minus, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, errorMessage, existingSongIdOf } from '../api.ts';
import { formatDuration, formatLongDate, parseDuration } from '../lib/format.ts';
import { extractYoutubeId, PLATFORMS, searchUrl, youtubeVideoUrl, type Platform } from '../lib/links.ts';
import { sameGenres, type GenreIndex } from '../lib/genres.ts';
import { duplicateFinder, sameSong, type Duplicate } from '../lib/songMatching.ts';
import { addGenre, distinctGenres, genreKey } from '../lib/songs.ts';
import { librarySuggestions, type ScaleHint } from '../lib/suggestions.ts';
import { useById, useCategories, useConfig, useDeleteSong, useGenreIndex, useSaveSong, useSongs, useYoutubeStatus } from '../queries.ts';
import type { GenreMatch, LookupResult, Song, SongInput } from '../types.ts';
import { CategoryFormDialog, suggestCategoryColor } from './CategoryFormDialog.tsx';
import { GenrePicker } from './GenrePicker.tsx';
import { ConfirmDialog, Modal } from './Modal.tsx';
import { OnlineSearch, type PickExtras } from './OnlineSearch.tsx';
import { Artwork, ChipToggle, colorProps, ENERGY_LABELS, Field, RATING_LABELS, ScaleInput, SING_ALONG_LABELS } from './ui.tsx';
import { useOnlineLookup } from './useOnlineLookup.ts';

/** Zustand des Formulars: Texte so, wie sie in den Feldern stehen. */
interface FormState {
  title: string;
  artist: string;
  album: string;
  duration: string;
  releaseYear: string;
  genres: string[];
  bpm: string;
  energy: number | null;
  singAlong: number | null;
  rating: number | null;
  notes: string;
  appleMusicUrl: string;
  youtubeUrl: string;
  youtubeMusicUrl: string;
  artworkUrl: string;
  categoryIds: number[];
  /**
   * Genres, die eine Suche eingetragen hat (Treffer der Online-Suche oder MusicBrainz), samt dem
   * Song, zu dem sie gehören. Solange sie unverändert im Feld stehen, darf eine neue Suche sie ersetzen.
   */
  autoGenres: { genres: string[]; song: string } | null;
  /**
   * YouTube-Link, den ein eingefügter Link oder eine Suche eingetragen hat. Steht er noch
   * unverändert im Feld, ersetzt ihn die nächste Übernahme eines anderen Songs.
   */
  autoYoutube: { url: string; song: { title: string; artist: string } | null } | null;
  /** Jahr, das der zuletzt übernommene Treffer eingetragen hat */
  hitYear: string | null;
  /** MusicBrainz hat das Jahr der Erstveröffentlichung eingetragen; `previous` war vorher im Feld. */
  firstYear: { year: string; previous: string; url: string } | null;
}

type Errors = Record<string, string | undefined>;

/** Felder, die die Schnellerfassung hinter der Karte zusammenfasst … */
const DETAIL_FIELDS = ['title', 'artist', 'album', 'genres', 'duration', 'releaseYear', 'bpm'] as const;
/** … und die im eingeklappten Bereich „Links & Cover“ stehen. */
const LINK_FIELDS = ['appleMusicUrl', 'youtubeUrl', 'youtubeMusicUrl', 'artworkUrl'] as const;

const EMPTY_FORM: FormState = {
  title: '',
  artist: '',
  album: '',
  duration: '',
  releaseYear: '',
  genres: [],
  bpm: '',
  energy: null,
  singAlong: null,
  rating: null,
  notes: '',
  appleMusicUrl: '',
  youtubeUrl: '',
  youtubeMusicUrl: '',
  artworkUrl: '',
  categoryIds: [],
  autoGenres: null,
  autoYoutube: null,
  hitYear: null,
  firstYear: null,
};

function formFromSong(song: Song): FormState {
  return {
    title: song.title,
    artist: song.artist,
    album: song.album ?? '',
    duration: song.durationSeconds === null ? '' : formatDuration(song.durationSeconds),
    releaseYear: song.releaseYear === null ? '' : String(song.releaseYear),
    genres: song.genres,
    bpm: song.bpm === null ? '' : String(song.bpm),
    energy: song.energy,
    singAlong: song.singAlong,
    rating: song.rating,
    notes: song.notes ?? '',
    appleMusicUrl: song.appleMusicUrl ?? '',
    youtubeUrl: song.youtubeUrl ?? '',
    youtubeMusicUrl: song.youtubeMusicUrl ?? '',
    artworkUrl: song.artworkUrl ?? '',
    categoryIds: song.categoryIds,
    autoGenres: null,
    autoYoutube: null,
    hitYear: null,
    firstYear: null,
  };
}

function sameText(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

function sameIds(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** Angaben, die nur der Nutzer kennt; gehen sie verloren, ist echte Arbeit weg. */
function samePersonalInput(a: FormState, b: FormState): boolean {
  return (
    sameIds(a.categoryIds, b.categoryIds) &&
    a.rating === b.rating &&
    a.energy === b.energy &&
    a.singAlong === b.singAlong &&
    sameText(a.notes, b.notes)
  );
}

/** Gleicher Inhalt; Leerzeichen am Rand, die Reihenfolge der Kategorien und Genres zählen nicht. */
function sameForm(a: FormState, b: FormState): boolean {
  return (
    samePersonalInput(a, b) &&
    sameGenres(a.genres, b.genres) &&
    (['title', 'artist', 'album', 'duration', 'releaseYear', 'bpm', 'appleMusicUrl', 'youtubeUrl', 'youtubeMusicUrl', 'artworkUrl'] as const).every(
      (key) => sameText(a[key], b[key]),
    )
  );
}

/** Kennung eines Songs für die Online-Suchen; dieselbe wie in useOnlineLookup. */
function songKey(artist: string, title: string): string {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

/** Die Genres dürfen automatisch ersetzt werden: Das Feld ist leer oder enthält nur, was eine Suche eingetragen hat. */
function genresReplaceable(form: FormState): boolean {
  return form.genres.length === 0 || (form.autoGenres !== null && sameGenres(form.genres, form.autoGenres.genres));
}

/**
 * Der YouTube-Link stammt aus einem eingefügten Link oder einer Suche, ist unverändert und
 * gehört zu einem anderen Song als dem übernommenen – dann muss er weichen.
 */
function autoYoutubeOutdated(form: FormState, result: { title: string; artist: string }): boolean {
  const auto = form.autoYoutube;
  return auto !== null && form.youtubeUrl === auto.url && auto.song !== null && !sameSong(auto.song, result);
}

/** Übernimmt einen Treffer der Online-Suche; was der Treffer nicht kennt, bleibt wie es ist. */
function applyLookup(form: FormState, result: LookupResult, genreIndex: GenreIndex, extras: PickExtras = {}): FormState {
  // iTunes nennt ein grobes Genre („Hip-Hop/Rap“); es kommt in der Schreibweise der Genre-Liste.
  const genre = result.genre ? genreIndex.canonical(result.genre) : null;
  const song = songKey(result.artist, result.title);
  let { genres, autoGenres } = form;
  if (genresReplaceable(form)) {
    // Was eine Suche schon für genau diesen Song eingetragen hat, bleibt; sonst gilt das Genre des Treffers.
    if (form.genres.length === 0 || form.autoGenres?.song !== song) {
      genres = genre ? [genre] : [];
      autoGenres = genre ? { genres, song } : null;
    }
  } else if (genre && !genreIndex.mainGenresOfAll(form.genres).includes(genre)) {
    // Selbst gewählte Genres bleiben; das Genre des Treffers kommt dazu, falls es nicht schon drinsteckt.
    genres = addGenre(form.genres, genre);
  }
  return {
    ...form,
    title: result.title,
    artist: result.artist,
    album: result.album ?? form.album,
    duration: result.durationSeconds === null ? form.duration : formatDuration(result.durationSeconds),
    releaseYear: result.releaseYear === null ? form.releaseYear : String(result.releaseYear),
    hitYear: result.releaseYear === null ? form.hitYear : String(result.releaseYear),
    firstYear: null,
    genres,
    autoGenres,
    appleMusicUrl: result.appleMusicUrl ?? form.appleMusicUrl,
    // Ein eingefügter YouTube-Link kommt in jedem Fall ins YouTube-Feld; einer, der automatisch
    // für einen anderen Song eingetragen wurde, muss weichen.
    youtubeUrl: extras.youtubeUrl ?? (autoYoutubeOutdated(form, result) ? '' : form.youtubeUrl),
    autoYoutube: extras.youtubeUrl
      ? { url: extras.youtubeUrl, song: { title: result.title, artist: result.artist } }
      : autoYoutubeOutdated(form, result)
        ? null
        : form.autoYoutube,
    artworkUrl: result.artworkUrl ?? form.artworkUrl,
  };
}

/**
 * Jahr der Erstveröffentlichung laut MusicBrainz: füllt ein leeres Feld und ersetzt ein späteres
 * Jahr, solange es noch unverändert aus dem Treffer stammt. Ein selbst eingetragenes Jahr bleibt.
 */
function withFirstReleaseYear(form: FormState, match: GenreMatch): FormState {
  if (match.firstReleaseYear === null) return form;
  const year = String(match.firstReleaseYear);
  const current = form.releaseYear.trim();
  const fromHit = form.hitYear !== null && current === form.hitYear;
  if (current === '' || (fromHit && match.firstReleaseYear < Number(current))) {
    return { ...form, releaseYear: year, firstYear: { year, previous: current, url: match.url } };
  }
  return form;
}

/** Leeres Feld → null, gültige Ganzzahl im Bereich → Zahl, alles andere → undefined. */
function parseWholeNumber(text: string, min: number, max: number): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value >= min && value <= max ? value : undefined;
}

function validate(form: FormState): { input: SongInput | null; errors: Errors } {
  const errors: Errors = {};
  if (form.title.trim() === '') errors.title = 'Bitte einen Titel angeben.';
  if (form.artist.trim() === '') errors.artist = 'Bitte einen Interpreten angeben.';

  const duration = parseDuration(form.duration);
  if (!duration.ok) errors.duration = 'Bitte als Minuten:Sekunden angeben, z. B. 3:45.';

  const releaseYear = parseWholeNumber(form.releaseYear, 1000, 2200);
  if (releaseYear === undefined) errors.releaseYear = 'Bitte ein Jahr wie 1994 angeben.';

  const bpm = parseWholeNumber(form.bpm, 20, 400);
  if (bpm === undefined) errors.bpm = 'Bitte eine Zahl zwischen 20 und 400 angeben.';

  if (Object.keys(errors).length > 0 || !duration.ok || releaseYear === undefined || bpm === undefined) {
    return { input: null, errors };
  }

  const textOrNull = (text: string) => text.trim() || null;
  return {
    errors,
    input: {
      title: form.title.trim(),
      artist: form.artist.trim(),
      album: textOrNull(form.album),
      durationSeconds: duration.seconds,
      releaseYear,
      genres: form.genres,
      bpm,
      energy: form.energy,
      singAlong: form.singAlong,
      rating: form.rating,
      notes: textOrNull(form.notes),
      appleMusicUrl: textOrNull(form.appleMusicUrl),
      youtubeUrl: textOrNull(form.youtubeUrl),
      youtubeMusicUrl: textOrNull(form.youtubeMusicUrl),
      artworkUrl: textOrNull(form.artworkUrl),
      categoryIds: form.categoryIds,
    },
  };
}

interface LinkFieldProps {
  platform: Platform;
  id: string;
  value: string;
  placeholder: string;
  /** „Interpret Titel“ für die Suche auf der Plattform */
  query: string;
  error: string | undefined;
  hint?: ReactNode;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Statt die Plattform im neuen Tab zu öffnen, direkt in der App suchen (YouTube mit Verbindung). */
  onSearch?: (() => void) | undefined;
  searching?: boolean;
}

/** Eingabefeld für einen Link samt Abkürzung zur Suche auf der Plattform (zum Kopieren des Links). */
function LinkField({ platform, id, value, placeholder, query, error, hint, onChange, onBlur, onSearch, searching }: LinkFieldProps) {
  const { name } = PLATFORMS[platform];
  const storefront = useConfig().data?.appleMusicStorefront;
  if (onSearch) {
    return (
      <Field label={name} htmlFor={id} error={error} hint={hint}>
        <div className="input-with-action">
          <input
            id={id}
            className="input"
            type="url"
            inputMode="url"
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
          />
          <button
            type="button"
            className="button"
            disabled={!query || searching}
            title={query ? `„${query}“ auf ${name} suchen` : 'Erst Titel oder Interpret eintragen'}
            onClick={onSearch}
          >
            <Search size={16} aria-hidden />
            {searching ? 'Suche …' : 'Suchen'}
          </button>
        </div>
      </Field>
    );
  }
  return (
    <Field label={name} htmlFor={id} error={error} hint={hint}>
      <div className="input-with-action">
        <input
          id={id}
          className="input"
          type="url"
          inputMode="url"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
        {query ? (
          <a
            className="button"
            href={searchUrl(platform, query, storefront)}
            target="_blank"
            rel="noopener noreferrer"
            title={`„${query}“ auf ${name} suchen, um den Link zu kopieren`}
          >
            <Search size={16} aria-hidden />
            Suchen
          </a>
        ) : (
          <button type="button" className="button" disabled title="Erst Titel oder Interpret eintragen">
            <Search size={16} aria-hidden />
            Suchen
          </button>
        )}
      </div>
    </Field>
  );
}

interface SongFormDialogProps {
  /** null legt einen neuen Song an */
  song: Song | null;
  onClose: () => void;
}

/** Dialog zum Anlegen und Bearbeiten; „Vorhandenen Song öffnen“ wechselt darin zu einem anderen Song. */
export function SongFormDialog({ song, onClose }: SongFormDialogProps) {
  const [current, setCurrent] = useState<Song | null>(song);
  return <SongForm key={current?.id ?? 'neu'} song={current} onClose={onClose} onOpenSong={setCurrent} />;
}

interface SongFormProps extends SongFormDialogProps {
  /** Wechselt den Dialog zu einem vorhandenen Song (etwa bei einer Dublette). */
  onOpenSong: (song: Song) => void;
}

/** Quellen für YouTube-Links ohne Konto */
const YOUTUBE_LINK_SOURCES = { wikidata: 'Wikidata', musicbrainz: 'MusicBrainz' } as const;

/** Was im eingeklappten Bereich „Links & Cover“ noch fehlt, z. B. „YouTube-Link fehlt“. */
function missingLinksNote(form: FormState): string {
  const missing = [
    form.appleMusicUrl.trim() === '' ? 'Apple-Music-Link' : null,
    form.youtubeUrl.trim() === '' && form.youtubeMusicUrl.trim() === '' ? 'YouTube-Link' : null,
    form.artworkUrl.trim() === '' ? 'Cover' : null,
  ].filter((item) => item !== null);
  if (missing.length === 0) return 'alles da';
  if (missing.length === 1) return `${missing[0]} fehlt`;
  return `${missing.slice(0, -1).join(', ')} und ${missing[missing.length - 1]} fehlen`;
}

interface SongSummaryProps {
  form: FormState;
  bpmSearching: boolean;
  genresSearching: boolean;
  youtubeSearching: boolean;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}

/** Karte der Schnellerfassung: die Angaben aus dem Treffer auf einen Blick. */
function SongSummary({ form, bpmSearching, genresSearching, youtubeSearching, detailsOpen, onToggleDetails }: SongSummaryProps) {
  const meta = [form.artist, form.album, form.releaseYear].map((text) => text.trim()).filter(Boolean).join(' · ');
  const hasYoutube = form.youtubeUrl.trim() !== '' || form.youtubeMusicUrl.trim() !== '';
  const links = [
    { name: 'Apple Music', present: form.appleMusicUrl.trim() !== '', searching: false },
    // Ein YouTube-Link gilt auch für YouTube Music.
    { name: 'YouTube', present: hasYoutube, searching: youtubeSearching },
    { name: 'YouTube Music', present: hasYoutube, searching: youtubeSearching },
  ];
  return (
    <section className="song-summary" aria-label="Angaben zum Song">
      <div className="song-summary-cover">
        <Artwork url={form.artworkUrl.trim() || null} size={72} />
      </div>
      <div className="song-summary-main">
        <div className="song-summary-title">{form.title.trim() || 'Ohne Titel'}</div>
        {meta && <div className="song-summary-meta">{meta}</div>}
        <div className="song-summary-facts">
          <span>Dauer {form.duration.trim() || '–'}</span>
          <span>
            Tempo{' '}
            {bpmSearching ? <span className="searching-note">sucht …</span> : form.bpm.trim() ? `${form.bpm.trim()} BPM` : '–'}
          </span>
        </div>
        <div className="song-summary-genres">
          {genresSearching ? (
            <span className="searching-note">Genres: sucht …</span>
          ) : form.genres.length > 0 ? (
            form.genres.map((genre) => (
              <span key={genre} className="chip chip-plain">
                {genre}
              </span>
            ))
          ) : (
            <span className="muted">Kein Genre</span>
          )}
        </div>
        <ul className="song-summary-links" aria-label="Links zu den Plattformen">
          {links.map((link) =>
            !link.present && link.searching ? (
              <li key={link.name} className="searching-note">
                {link.name}: sucht …
              </li>
            ) : (
              <li key={link.name} className={link.present ? 'summary-link-ok' : 'summary-link-missing'}>
                {link.present ? <Check size={13} aria-hidden /> : <Minus size={13} aria-hidden />}
                {link.present ? link.name : `${link.name} fehlt`}
              </li>
            ),
          )}
        </ul>
      </div>
      <button
        type="button"
        className="button button-small song-summary-edit"
        aria-expanded={detailsOpen}
        onClick={onToggleDetails}
      >
        <Pencil size={14} aria-hidden />
        {detailsOpen ? 'Angaben zuklappen' : 'Angaben bearbeiten'}
      </button>
    </section>
  );
}

/** Dezenter Hinweis neben einer Skala: die übliche Stufe ähnlicher Songs (setzt nichts). */
function ScaleHintNote({ hint, labels }: { hint: ScaleHint; labels: readonly string[] }) {
  return (
    <span
      className="scale-hint"
      title={`${hint.count} von ${hint.total} ${hint.basis} haben ${hint.value} – ${labels[hint.value - 1] ?? ''}`}
    >
      ähnliche Songs: meist {hint.value}
    </span>
  );
}

/** Hinweis auf einen Song, den es in der Bibliothek schon gibt. */
function DuplicateNote({ duplicate, editing, onOpen, onIgnore }: { duplicate: Duplicate; editing: boolean; onOpen: () => void; onIgnore: () => void }) {
  const { song } = duplicate;
  const details = [song.album, `hinzugefügt am ${formatLongDate(song.createdAt)}`].filter(Boolean).join(', ');
  return (
    <div className="duplicate-note" role="status">
      <CopyCheck size={18} aria-hidden />
      <p>
        {duplicate.reason === 'link' ? (
          <>
            Dieser Link gehört schon zu „{song.title}“ von {song.artist} ({details}).
          </>
        ) : (
          <>
            „{song.title}“ von {song.artist} hast du schon ({details}).
          </>
        )}
      </p>
      <div className="duplicate-actions">
        <button type="button" className="button button-small" onClick={onOpen}>
          Vorhandenen Song öffnen
        </button>
        <button type="button" className="button button-small" onClick={onIgnore}>
          {editing ? 'Trotzdem speichern' : 'Trotzdem anlegen'}
        </button>
      </div>
    </div>
  );
}

function SongForm({ song, onClose, onOpenSong }: SongFormProps) {
  /** Ausgangszustand: gespeicherter Stand bzw. leeres Formular. Weicht das Formular ab, fragt Schließen nach. */
  const [baseline] = useState<FormState>(() => (song ? formFromSong(song) : EMPTY_FORM));
  const [form, setForm] = useState<FormState>(baseline);
  /** Wartet auf die Antwort auf „Änderungen verwerfen?“; danach geschieht das hier. */
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [searchKey, setSearchKey] = useState(0);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [focusFirstError, setFocusFirstError] = useState(0);
  /** Song der Bibliothek, der zu den Angaben passt (Hinweis über dem Formular) */
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  /** Songs, bei denen „Trotzdem anlegen“ gewählt wurde – für sie erscheint kein Hinweis mehr. */
  const [ignoredDuplicates, setIgnoredDuplicates] = useState<number[]>([]);
  /** Vorhandener Song, an dem das Speichern gescheitert ist (HTTP 409) */
  const [conflictSongId, setConflictSongId] = useState<number | null>(null);
  /** Schnellerfassung nach einem Treffer: Karte statt Felder, Links und Notizen eingeklappt */
  const [quick, setQuick] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  /** Titel und Interpret stammen aus einem Videotitel und sollten geprüft werden. */
  const [fromVideo, setFromVideo] = useState(false);

  const categories = useCategories();
  const songs = useSongs();
  const genreOptions = useMemo(() => distinctGenres(songs.data ?? []), [songs.data]);
  const findDuplicate = useMemo(() => duplicateFinder(songs.data ?? [], song?.id ?? null), [songs.data, song]);
  const genreIndex = useGenreIndex();
  const categoriesById = useById(categories.data);
  // Vorschläge aus ähnlichen Songs der Bibliothek (gleicher Interpret, Untergenre, Hauptgenre und Tempo).
  const suggestions = useMemo(() => {
    const bpm = parseWholeNumber(form.bpm, 20, 400);
    return librarySuggestions(
      songs.data ?? [],
      {
        id: song?.id ?? null,
        artist: form.artist,
        genres: form.genres,
        mainGenres: genreIndex.mainGenresOfAll(form.genres),
        bpm: typeof bpm === 'number' ? bpm : null,
      },
      categoriesById,
      form.categoryIds,
    );
  }, [songs.data, song, form.artist, form.genres, form.bpm, form.categoryIds, genreIndex, categoriesById]);
  const queryClient = useQueryClient();
  const youtubeStatus = useYoutubeStatus();
  const youtubeSearch = useMutation({
    mutationFn: (hints: Parameters<typeof api.youtube.search>[0]) => api.youtube.search(hints),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['youtube', 'status'] }),
  });
  const bpmLookup = useOnlineLookup(api.lookupBpm);
  const genreLookup = useOnlineLookup(api.lookupGenres);
  const youtubeLinkLookup = useOnlineLookup(api.lookupYoutube);
  const saveSong = useSaveSong();
  const deleteSong = useDeleteSong();
  const bodyRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const busy = saveSong.isPending || deleteSong.isPending;

  // Nach einem fehlgeschlagenen Speichern das erste beanstandete Feld in den Blick holen.
  useEffect(() => {
    if (focusFirstError === 0) return;
    bodyRef.current?.querySelector<HTMLElement>('.field-invalid input, .field-invalid textarea')?.focus();
  }, [focusFirstError]);

  // Ein automatisch eingetragener YouTube-Link kann schon an einem anderen Song hängen (Dublette).
  const autoYoutubeUrl = form.autoYoutube?.url ?? null;
  useEffect(() => {
    if (autoYoutubeUrl !== null && form.youtubeUrl === autoYoutubeUrl) checkDuplicate(form);
    // Nur prüfen, wenn ein neuer Link eingetragen wurde.
  }, [autoYoutubeUrl]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleCategory(categoryId: number) {
    setForm((current) => ({
      ...current,
      categoryIds: current.categoryIds.includes(categoryId)
        ? current.categoryIds.filter((existing) => existing !== categoryId)
        : [...current.categoryIds, categoryId],
    }));
  }

  /** Prüft, ob es den Song schon gibt: über einen gespeicherten Link oder Titel und Interpret. */
  function checkDuplicate(next: FormState) {
    const found = findDuplicate({
      title: next.title,
      artist: next.artist,
      appleMusicUrl: next.appleMusicUrl,
      youtubeUrl: next.youtubeUrl,
      youtubeMusicUrl: next.youtubeMusicUrl,
    });
    setDuplicate(found && !ignoredDuplicates.includes(found.song.id) ? found : null);
  }

  function ignoreDuplicate(existing: Song) {
    setIgnoredDuplicates((ids) => [...ids, existing.id]);
    setDuplicate(null);
  }

  /** Schließt den Dialog; mit ungespeicherten Änderungen erst nach Rückfrage. */
  function requestClose() {
    if (sameForm(form, baseline)) onClose();
    else setPendingDiscard(() => onClose);
  }

  /**
   * Wechselt zu einem vorhandenen Song. Gefragt wird nur, wenn schon Persönliches eingetragen
   * ist: Titel, Album und Co. aus einem Treffer gehören ja zu genau diesem Song.
   */
  function openSong(existing: Song) {
    if (samePersonalInput(form, baseline)) onOpenSong(existing);
    else setPendingDiscard(() => () => onOpenSong(existing));
  }

  function submit(addAnother: boolean) {
    const { input, errors: found } = validate(form);
    setErrors(found);
    setSavedNote(null);
    setConflictSongId(null);
    if (!input) {
      setFormError('Bitte die markierten Felder prüfen.');
      setFocusFirstError((count) => count + 1);
      return;
    }
    setFormError(null);
    saveSong.mutate(
      { id: song?.id ?? null, input },
      {
        onSuccess: (saved) => {
          if (!addAnother) {
            onClose();
            return;
          }
          setForm(EMPTY_FORM);
          setSearchKey((key) => key + 1);
          bpmLookup.reset();
          genreLookup.reset();
          youtubeLinkLookup.reset();
          setDuplicate(null);
          setIgnoredDuplicates([]);
          setQuick(false);
          setDetailsOpen(false);
          setLinksOpen(false);
          setNotesOpen(false);
          setFromVideo(false);
          setSavedNote(`„${saved.title}“ ist gespeichert.`);
        },
        onError: (err) => {
          const existingId = existingSongIdOf(err);
          if (existingId !== null) {
            setConflictSongId(existingId);
            setFormError(errorMessage(err));
          } else if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
            // Das Feld heißt im Formular „duration“, in der API „durationSeconds“.
            setErrors({ ...err.fields, duration: err.fields.durationSeconds });
            setFormError('Bitte die markierten Felder prüfen.');
            setFocusFirstError((count) => count + 1);
          } else {
            setFormError(errorMessage(err));
          }
        },
      },
    );
  }

  const query = `${form.artist} ${form.title}`.trim();

  // Wert im BPM-Feld, der aus der Tempo-Suche stammt und noch nicht verändert wurde.
  const bpmFromLookup = bpmLookup.state.status === 'found' ? String(bpmLookup.state.match.bpm) : null;

  /**
   * Schlägt das Tempo auf songbpm.com nach, sobald Titel und Interpret feststehen. Ein selbst
   * eingetragenes Tempo bleibt unangetastet; nur ein leeres Feld oder der Wert einer früheren
   * Suche wird ersetzt.
   */
  function lookUpBpm(next: FormState, force = false) {
    const title = next.title.trim();
    const artist = next.artist.trim();
    if (!title || !artist) return;
    if (next.bpm.trim() !== '' && next.bpm !== bpmFromLookup) return;

    const duration = parseDuration(next.duration);
    const started = bpmLookup.search(
      { title, artist, durationSeconds: duration.ok ? duration.seconds : null },
      (match) => setForm((current) => (current.bpm.trim() === '' ? { ...current, bpm: String(match.bpm) } : current)),
      force,
    );
    // Der Wert der vorigen Suche gehört zu einem anderen Song und muss weichen.
    if (started && bpmFromLookup !== null) {
      setForm((current) => (current.bpm === bpmFromLookup ? { ...current, bpm: '' } : current));
    }
  }

  /**
   * Schlägt die Genres auf MusicBrainz nach, sobald Titel und Interpret feststehen. Selbst
   * gewählte Genres bleiben; ersetzt werden nur ein leeres Feld oder Genres, die eine Suche
   * eingetragen hat. Mit force wird auch dann gesucht – das Ergebnis erscheint als Vorschläge.
   */
  function lookUpGenres(next: FormState, force = false) {
    const title = next.title.trim();
    const artist = next.artist.trim();
    if (!title || !artist) return;
    if (!force && !genresReplaceable(next)) return;

    const song = songKey(artist, title);
    const duration = parseDuration(next.duration);
    const started = genreLookup.search(
      { title, artist, durationSeconds: duration.ok ? duration.seconds : null },
      (match) =>
        setForm((current) =>
          withFirstReleaseYear(
            genresReplaceable(current) && match.genres.length > 0
              ? { ...current, genres: match.genres, autoGenres: { genres: match.genres, song } }
              : current,
            match,
          ),
        ),
      force,
    );
    // Genres, die eine Suche für einen anderen Song eingetragen hat, passen nicht mehr.
    if (started && next.autoGenres && next.autoGenres.song !== song) {
      setForm((current) =>
        current.autoGenres && current.autoGenres.song !== song && sameGenres(current.genres, current.autoGenres.genres)
          ? { ...current, genres: [], autoGenres: null }
          : current,
      );
    }
  }

  /**
   * Sucht einen YouTube-Link bei Wikidata und MusicBrainz (ohne Konto), sobald Titel und Interpret
   * feststehen. Gefüllt wird nur ein leeres Feld; ein selbst eingetragener Link wird nie ersetzt,
   * einer, den eine Suche für einen anderen Song eingetragen hat, schon.
   */
  function lookUpYoutubeLink(next: FormState, force = false) {
    const title = next.title.trim();
    const artist = next.artist.trim();
    if (!title || !artist) return;
    const song = { title, artist };
    const auto = next.autoYoutube !== null && next.youtubeUrl === next.autoYoutube.url ? next.autoYoutube : null;
    if (next.youtubeUrl.trim() !== '' && !auto) return;
    // Ein eingefügter oder schon gefundener Link zu genau diesem Song bleibt.
    if (!force && auto?.song && sameSong(auto.song, song)) return;

    const duration = parseDuration(next.duration);
    const started = youtubeLinkLookup.search(
      { title, artist, durationSeconds: duration.ok ? duration.seconds : null },
      (match) =>
        setForm((current) =>
          current.youtubeUrl.trim() === '' ? { ...current, youtubeUrl: match.url, autoYoutube: { url: match.url, song } } : current,
        ),
      force,
    );
    if (started && auto) {
      setForm((current) =>
        current.autoYoutube &&
        current.youtubeUrl === current.autoYoutube.url &&
        !(current.autoYoutube.song && sameSong(current.autoYoutube.song, song))
          ? { ...current, youtubeUrl: '', autoYoutube: null }
          : current,
      );
    }
  }

  /** Tempo, Genres und YouTube-Link online nachschlagen, sobald Titel und Interpret feststehen. */
  function lookUpOnline(next: FormState) {
    lookUpBpm(next);
    lookUpGenres(next);
    lookUpYoutubeLink(next);
  }

  const canSearchBpm = form.bpm.trim() === '' && form.title.trim() !== '' && form.artist.trim() !== '';
  let bpmHint: ReactNode = 'Tempo, falls bekannt';
  if (bpmLookup.state.status === 'searching') {
    bpmHint = <span role="status">Suche auf songbpm.com …</span>;
  } else if (bpmLookup.state.status === 'found' && form.bpm === bpmFromLookup) {
    const { match } = bpmLookup.state;
    bpmHint = (
      <span role="status">
        Laut{' '}
        <a href={match.url} target="_blank" rel="noopener noreferrer" title={`Treffer: ${match.artist} – ${match.title}`}>
          songbpm.com
        </a>
      </span>
    );
  } else if (canSearchBpm && bpmLookup.state.status === 'notFound') {
    bpmHint = <span role="status">Auf songbpm.com nicht gefunden</span>;
  } else if (canSearchBpm) {
    bpmHint = (
      <span role={bpmLookup.state.status === 'error' ? 'alert' : undefined}>
        {bpmLookup.state.status === 'error' && 'songbpm.com nicht erreichbar. '}
        <button type="button" className="link-button" onClick={() => lookUpBpm(form, true)}>
          {bpmLookup.state.status === 'error' ? 'Nochmal versuchen' : 'Auf songbpm.com suchen'}
        </button>
      </span>
    );
  }

  const mainGenres = genreIndex.mainGenresOfAll(form.genres);
  // Ein Treffer ohne Genres (nur mit Erscheinungsjahr) zählt für die Genres als „nichts gefunden“.
  const genreMatch = genreLookup.state.status === 'found' && genreLookup.state.match.genres.length > 0 ? genreLookup.state.match : null;
  const canSearchGenres = form.title.trim() !== '' && form.artist.trim() !== '';
  let genreStatus: ReactNode = null;
  if (genreLookup.state.status === 'searching') {
    genreStatus = <span role="status">Suche Genres auf MusicBrainz …</span>;
  } else if (genreMatch) {
    const chosen = new Set(form.genres.map(genreKey));
    const suggestions = [...genreMatch.genres, ...genreMatch.suggestions].filter((genre) => !chosen.has(genreKey(genre))).slice(0, 6);
    genreStatus = (
      <span role="status">
        {sameGenres(form.genres, genreMatch.genres) ? 'Laut ' : 'Gefunden auf '}
        <a href={genreMatch.url} target="_blank" rel="noopener noreferrer" title={`Treffer: ${genreMatch.artist} – ${genreMatch.title}`}>
          MusicBrainz
        </a>
        {suggestions.length > 0 && (
          <>
            {' · Weitere: '}
            {suggestions.map((genre) => (
              <button
                key={genre}
                type="button"
                className="genre-suggestion"
                title={`„${genre}“ hinzufügen`}
                onClick={() => set('genres', addGenre(form.genres, genre))}
              >
                <Plus size={12} aria-hidden />
                {genre}
              </button>
            ))}
          </>
        )}
      </span>
    );
  } else if (canSearchGenres && (genreLookup.state.status === 'notFound' || genreLookup.state.status === 'found')) {
    genreStatus = <span role="status">Auf MusicBrainz keine Genres gefunden</span>;
  } else if (canSearchGenres) {
    genreStatus = (
      <span role={genreLookup.state.status === 'error' ? 'alert' : undefined}>
        {genreLookup.state.status === 'error' && 'MusicBrainz nicht erreichbar. '}
        <button type="button" className="link-button" onClick={() => lookUpGenres(form, true)}>
          {genreLookup.state.status === 'error' ? 'Nochmal versuchen' : 'Auf MusicBrainz suchen'}
        </button>
      </span>
    );
  }
  const genreHint = (
    <>
      {mainGenres.length > 0
        ? `${mainGenres.length === 1 ? 'Hauptgenre' : 'Hauptgenres'}: ${mainGenres.join(', ')}`
        : 'Aus der Liste wählen oder eintippen.'}
      {genreStatus && <> · {genreStatus}</>}
    </>
  );

  // Herkunft eines automatisch gefundenen YouTube-Links, sonst der Stand der Suche.
  const youtubeMatch = youtubeLinkLookup.state.status === 'found' ? youtubeLinkLookup.state.match : null;
  const canSearchYoutubeLink = form.youtubeUrl.trim() === '' && form.title.trim() !== '' && form.artist.trim() !== '';
  let youtubeHint: ReactNode = undefined;
  if (youtubeLinkLookup.state.status === 'searching') {
    youtubeHint = <span role="status">Suche bei Wikidata und MusicBrainz …</span>;
  } else if (youtubeMatch && form.youtubeUrl === youtubeMatch.url) {
    youtubeHint = (
      <span role="status">
        Gefunden über{' '}
        <a href={youtubeMatch.sourceUrl} target="_blank" rel="noopener noreferrer">
          {YOUTUBE_LINK_SOURCES[youtubeMatch.source]}
        </a>
        {' · '}
        <a
          href={youtubeMatch.url}
          target="_blank"
          rel="noopener noreferrer"
          title={youtubeMatch.channel ? `${youtubeMatch.videoTitle} – ${youtubeMatch.channel}` : youtubeMatch.videoTitle}
        >
          Video ansehen
        </a>
      </span>
    );
  } else if (canSearchYoutubeLink && youtubeLinkLookup.state.status === 'notFound') {
    youtubeHint = <span role="status">Bei Wikidata und MusicBrainz kein Video gefunden.</span>;
  } else if (canSearchYoutubeLink && youtubeLinkLookup.state.status === 'error') {
    youtubeHint = (
      <span role="alert">
        Wikidata und MusicBrainz nicht erreichbar.{' '}
        <button type="button" className="link-button" onClick={() => lookUpYoutubeLink(form, true)}>
          Nochmal versuchen
        </button>
      </span>
    );
  }

  // Mit verbundenem YouTube-Konto sucht der Knopf neben dem YouTube-Feld direkt in der App.
  const youtubeReady = Boolean(youtubeStatus.data?.configured && youtubeStatus.data.connected && !youtubeStatus.data.expired);
  function searchYoutube() {
    const duration = parseDuration(form.duration);
    youtubeSearch.mutate({
      q: query,
      title: form.title.trim() || undefined,
      artist: form.artist.trim() || undefined,
      duration: duration.ok ? duration.seconds : null,
    });
  }
  const youtubeLinkWithoutVideo = form.youtubeUrl.trim() !== '' && extractYoutubeId(form.youtubeUrl) === null;
  const conflictSong = conflictSongId === null ? null : (songs.data?.find((existing) => existing.id === conflictSongId) ?? null);

  /** Strg+Enter speichert, Strg+Umschalt+Enter speichert und öffnet den nächsten Song. */
  function handleShortcut(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    if (!busy) submit(event.shiftKey && !song);
  }

  // --- Bausteine des Formulars ---------------------------------------------------

  // Das Jahr stammt von MusicBrainz (Erstveröffentlichung); ein Klick holt das Jahr des Treffers zurück.
  const firstYear = form.firstYear !== null && form.releaseYear.trim() === form.firstYear.year ? form.firstYear : null;
  const yearHint: ReactNode = firstYear ? (
    <span role="status">
      Erstveröffentlichung laut{' '}
      <a href={firstYear.url} target="_blank" rel="noopener noreferrer">
        MusicBrainz
      </a>
      {firstYear.previous !== '' && (
        <>
          {' ('}
          <button
            type="button"
            className="link-button"
            title="Das Jahr aus dem Treffer wiederherstellen"
            onClick={() => setForm((current) => ({ ...current, releaseYear: firstYear.previous, firstYear: null }))}
          >
            Treffer: {firstYear.previous}
          </button>
          {')'}
        </>
      )}
    </span>
  ) : (
    'Erscheinungsjahr'
  );

  const videoHint = fromVideo ? (
    <span className="review-note" role="status">
      Aus dem Videotitel gelesen – bitte prüfen
    </span>
  ) : undefined;

  const detailFields = (
    <div className="form-grid">
      <Field label="Titel" htmlFor={`${id}-title`} error={errors.title} hint={videoHint} className="span-3">
        <input
          id={`${id}-title`}
          className="input"
          value={form.title}
          maxLength={300}
          data-autofocus={song ? true : undefined}
          onChange={(event) => {
            set('title', event.target.value);
            setFromVideo(false);
          }}
          onBlur={() => {
            lookUpOnline(form);
            checkDuplicate(form);
          }}
        />
      </Field>
      <Field label="Interpret" htmlFor={`${id}-artist`} error={errors.artist} hint={videoHint} className="span-3">
        <input
          id={`${id}-artist`}
          className="input"
          value={form.artist}
          maxLength={300}
          onChange={(event) => {
            set('artist', event.target.value);
            setFromVideo(false);
          }}
          onBlur={() => {
            lookUpOnline(form);
            checkDuplicate(form);
          }}
        />
      </Field>
      <Field label="Album" htmlFor={`${id}-album`} error={errors.album} className="span-3">
        <input
          id={`${id}-album`}
          className="input"
          value={form.album}
          maxLength={300}
          onChange={(event) => set('album', event.target.value)}
        />
      </Field>
      <Field label="Genres" htmlFor={`${id}-genre`} error={errors.genres} hint={genreHint} className="span-3">
        <GenrePicker
          id={`${id}-genre`}
          value={form.genres}
          index={genreIndex}
          libraryGenres={genreOptions}
          onChange={(genres) => set('genres', genres)}
        />
      </Field>
      <Field label="Dauer" htmlFor={`${id}-duration`} error={errors.duration} hint="Minuten:Sekunden" className="span-2">
        <input
          id={`${id}-duration`}
          className="input"
          value={form.duration}
          placeholder="3:45"
          inputMode="numeric"
          onChange={(event) => set('duration', event.target.value)}
        />
      </Field>
      <Field label="Jahr" htmlFor={`${id}-year`} error={errors.releaseYear} hint={yearHint} className="span-2">
        <input
          id={`${id}-year`}
          className="input"
          value={form.releaseYear}
          placeholder="1994"
          inputMode="numeric"
          maxLength={4}
          onChange={(event) => set('releaseYear', event.target.value)}
        />
      </Field>
      <Field label="BPM" htmlFor={`${id}-bpm`} error={errors.bpm} hint={bpmHint} className="span-2">
        <input
          id={`${id}-bpm`}
          className="input"
          value={form.bpm}
          placeholder="120"
          inputMode="numeric"
          maxLength={3}
          onChange={(event) => set('bpm', event.target.value)}
        />
      </Field>
    </div>
  );

  const categorySection = (
    <fieldset className="form-section">
      <legend>Kategorien</legend>
      <div className="chip-list">
        {(categories.data ?? []).map((category) => (
          <ChipToggle
            key={category.id}
            category={category}
            pressed={form.categoryIds.includes(category.id)}
            onToggle={() => toggleCategory(category.id)}
          />
        ))}
        <button type="button" className="chip chip-add" onClick={() => setCreatingCategory(true)}>
          <Plus size={14} aria-hidden />
          Neue Kategorie
        </button>
      </div>
      {suggestions.categories.length > 0 && (
        <div className="suggestion-row" role="group" aria-label="Vorschläge aus ähnlichen Songs deiner Bibliothek">
          <span className="suggestion-label">Passt vielleicht:</span>
          {suggestions.categories.map((suggestion) => {
            const category = categoriesById.get(suggestion.categoryId);
            if (!category) return null;
            return (
              <button
                key={suggestion.categoryId}
                type="button"
                className="chip chip-suggestion"
                {...colorProps(category.color)}
                title={suggestion.reason}
                aria-label={`${category.name} wählen – ${suggestion.reason}`}
                onClick={() => toggleCategory(category.id)}
              >
                <Plus size={12} aria-hidden />
                {category.name}
              </button>
            );
          })}
        </div>
      )}
      {errors.categoryIds && (
        <p className="field-error" role="alert">
          {errors.categoryIds}
        </p>
      )}
    </fieldset>
  );

  const scaleSection = (
    <div className="form-grid">
      <div className="field span-3">
        <span className="field-label">Bewertung</span>
        <ScaleInput
          variant="stars"
          groupLabel="Bewertung"
          labels={RATING_LABELS}
          value={form.rating}
          onChange={(value) => set('rating', value)}
        />
      </div>
      <div className="field span-3">
        <span className="field-label">
          Energie {suggestions.energy && <ScaleHintNote hint={suggestions.energy} labels={ENERGY_LABELS} />}
        </span>
        <ScaleInput
          variant="levels"
          groupLabel="Energie"
          labels={ENERGY_LABELS}
          value={form.energy}
          onChange={(value) => set('energy', value)}
        />
      </div>
      <div className="field span-3">
        <span className="field-label">
          Mitsingen {suggestions.singAlong && <ScaleHintNote hint={suggestions.singAlong} labels={SING_ALONG_LABELS} />}
        </span>
        <ScaleInput
          variant="levels"
          groupLabel="Mitsingen"
          labels={SING_ALONG_LABELS}
          value={form.singAlong}
          onChange={(value) => set('singAlong', value)}
        />
      </div>
    </div>
  );

  const linkFields = (
    <>
      <LinkField
        platform="appleMusic"
        id={`${id}-apple`}
        value={form.appleMusicUrl}
        placeholder="https://music.apple.com/…"
        query={query}
        error={errors.appleMusicUrl}
        onChange={(value) => set('appleMusicUrl', value)}
        onBlur={() => checkDuplicate(form)}
      />
      <LinkField
        platform="youtube"
        id={`${id}-youtube`}
        value={form.youtubeUrl}
        placeholder="https://www.youtube.com/watch?v=…"
        query={query}
        error={errors.youtubeUrl}
        hint={
          youtubeLinkWithoutVideo
            ? 'Das sieht nicht nach dem Link zu einem einzelnen Video aus – für YouTube-Playlists wird ein Video-Link gebraucht.'
            : youtubeHint
        }
        onChange={(value) => set('youtubeUrl', value)}
        onBlur={() => checkDuplicate(form)}
        onSearch={youtubeReady ? searchYoutube : undefined}
        searching={youtubeSearch.isPending}
      />
      {youtubeSearch.isError && (
        <p className="field-error" role="alert">
          {errorMessage(youtubeSearch.error)}
        </p>
      )}
      {youtubeSearch.data &&
        (youtubeSearch.data.length === 0 ? (
          <p className="field-hint" role="status">
            Auf YouTube nichts gefunden.
          </p>
        ) : (
          <div className="youtube-results">
            <ul className="lookup-results" aria-label="Treffer auf YouTube">
              {youtubeSearch.data.map((video) => (
                <li key={video.videoId}>
                  <button
                    type="button"
                    className="lookup-result"
                    onClick={() => {
                      set('youtubeUrl', youtubeVideoUrl(video.videoId));
                      checkDuplicate({ ...form, youtubeUrl: youtubeVideoUrl(video.videoId) });
                      youtubeSearch.reset();
                    }}
                  >
                    <Artwork url={video.thumbnailUrl} size={44} />
                    <span className="lookup-text">
                      <span className="lookup-title">{video.title}</span>
                      <span className="lookup-meta">
                        {video.channelTitle ?? 'Unbekannter Kanal'}
                        {video.recommended && ' · passt am besten'}
                      </span>
                    </span>
                    <span className="lookup-duration">{formatDuration(video.durationSeconds)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="field-hint">
              Ein Klick übernimmt das Video.
              {youtubeStatus.data &&
                ` Heute noch ${Math.max(0, youtubeStatus.data.quota.searchesLimit - youtubeStatus.data.quota.searchesUsed)} von ${youtubeStatus.data.quota.searchesLimit} Suchen frei.`}
            </p>
          </div>
        ))}
      <LinkField
        platform="youtubeMusic"
        id={`${id}-youtube-music`}
        value={form.youtubeMusicUrl}
        placeholder="https://music.youtube.com/watch?v=…"
        query={query}
        error={errors.youtubeMusicUrl}
        hint="Kann leer bleiben, wenn ein YouTube-Link eingetragen ist – der funktioniert auch in YouTube Music."
        onChange={(value) => set('youtubeMusicUrl', value)}
        onBlur={() => checkDuplicate(form)}
      />
    </>
  );

  const coverField = (
    <Field
      label="Cover"
      htmlFor={`${id}-artwork`}
      error={errors.artworkUrl}
      hint="Adresse eines Bildes; es wird nur verlinkt, nicht gespeichert."
      className="span-6"
    >
      <div className="input-with-action">
        <Artwork url={form.artworkUrl.trim() || null} size={36} />
        <input
          id={`${id}-artwork`}
          className="input"
          type="url"
          inputMode="url"
          value={form.artworkUrl}
          placeholder="https://…"
          onChange={(event) => set('artworkUrl', event.target.value)}
        />
      </div>
    </Field>
  );

  const notesField = (
    <Field label="Notizen" htmlFor={`${id}-notes`} error={errors.notes} className="span-6">
      <textarea
        id={`${id}-notes`}
        className="input textarea"
        rows={3}
        value={form.notes}
        maxLength={5000}
        placeholder="Woran erinnert dich der Song? Wann passt er?"
        onChange={(event) => set('notes', event.target.value)}
      />
    </Field>
  );

  // Schnellerfassung: Eingeklappte Teile öffnen sich von selbst, sobald darin ein Fehler steht.
  const detailsVisible = detailsOpen || DETAIL_FIELDS.some((key) => errors[key]);
  const linksVisible = linksOpen || LINK_FIELDS.some((key) => errors[key]);
  const notesVisible = notesOpen || Boolean(errors.notes);

  return (
    <>
      <Modal
        title={song ? 'Song bearbeiten' : 'Song hinzufügen'}
        onClose={requestClose}
        onSubmit={() => submit(false)}
        onKeyDown={handleShortcut}
        size="large"
        footer={
          <>
            {song && (
              <button
                type="button"
                className="button button-danger-quiet footer-start"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
              >
                <Trash2 size={16} aria-hidden />
                Löschen
              </button>
            )}
            {formError && (
              <p className="form-error" role="alert">
                {formError}
                {conflictSong && (
                  <>
                    {' '}
                    <button type="button" className="link-button" onClick={() => openSong(conflictSong)}>
                      Vorhandenen Song öffnen
                    </button>
                  </>
                )}
              </p>
            )}
            {savedNote && (
              <p className="form-success" role="status">
                {savedNote}
              </p>
            )}
            <button type="button" className="button" onClick={requestClose} disabled={busy}>
              {savedNote ? 'Fertig' : 'Abbrechen'}
            </button>
            {!song && (
              <button
                type="button"
                className="button"
                onClick={() => submit(true)}
                disabled={busy}
                title="Speichern und gleich den nächsten Song erfassen (Strg+Umschalt+Enter)"
              >
                Speichern &amp; weiterer Song
              </button>
            )}
            <button type="submit" className="button button-primary" disabled={busy} title="Speichern (Strg+Enter)">
              Speichern
            </button>
          </>
        }
      >
        <div ref={bodyRef} className="song-form">
          <OnlineSearch
            key={searchKey}
            autoFocus={!song}
            findDuplicate={(result) => findDuplicate({ title: result.title, artist: result.artist, appleMusicUrl: result.appleMusicUrl })}
            onPick={(result, extras) => {
              const next = applyLookup(form, result, genreIndex, extras);
              setForm((current) => applyLookup(current, result, genreIndex, extras));
              lookUpOnline(next);
              checkDuplicate(next);
              // Beim Anlegen steht danach das Persönliche im Mittelpunkt; beim Bearbeiten bleibt das ganze Formular.
              if (!song) setQuick(true);
              // Aus einem Videotitel Gelesenes soll man sehen und prüfen können.
              setFromVideo(Boolean(extras?.fromVideo));
              if (extras?.fromVideo) setDetailsOpen(true);
              setErrors({});
              setFormError(null);
              setSavedNote(null);
            }}
            onYoutubeLink={(youtubeUrl, video) => {
              setForm((current) => ({ ...current, youtubeUrl, autoYoutube: { url: youtubeUrl, song: video } }));
              checkDuplicate({ ...form, youtubeUrl });
              setSavedNote(null);
            }}
          />

          {duplicate && (
            <DuplicateNote
              duplicate={duplicate}
              editing={song !== null}
              onOpen={() => openSong(duplicate.song)}
              onIgnore={() => ignoreDuplicate(duplicate.song)}
            />
          )}

          {quick ? (
            <>
              <SongSummary
                form={form}
                bpmSearching={bpmLookup.state.status === 'searching'}
                genresSearching={genreLookup.state.status === 'searching'}
                youtubeSearching={youtubeLinkLookup.state.status === 'searching'}
                detailsOpen={detailsVisible}
                onToggleDetails={() => setDetailsOpen(!detailsVisible)}
              />
              {detailsVisible && detailFields}
              {categorySection}
              {scaleSection}
              <details
                className="form-collapsible"
                open={linksVisible}
                onToggle={(event) => setLinksOpen(event.currentTarget.open)}
              >
                <summary>
                  Links &amp; Cover <span className="collapsible-note">{missingLinksNote(form)}</span>
                </summary>
                <div className="collapsible-body">
                  {linkFields}
                  <div className="form-grid">{coverField}</div>
                </div>
              </details>
              <details
                className="form-collapsible"
                open={notesVisible}
                onToggle={(event) => setNotesOpen(event.currentTarget.open)}
              >
                <summary>
                  Notizen <span className="collapsible-note">{form.notes.trim() === '' ? 'noch keine' : 'eingetragen'}</span>
                </summary>
                <div className="collapsible-body">{notesField}</div>
              </details>
            </>
          ) : (
            <>
              {detailFields}
              {categorySection}
              {scaleSection}
              <fieldset className="form-section">
                <legend>Links zu Streaming-Plattformen</legend>
                <p className="field-hint section-hint">
                  Alles optional: Ohne gespeicherten Link führt der Knopf in der Songliste zur Suche auf der Plattform.
                </p>
                {linkFields}
              </fieldset>
              <div className="form-grid">
                {coverField}
                {notesField}
              </div>
            </>
          )}
        </div>
      </Modal>

      {creatingCategory && (
        <CategoryFormDialog
          category={null}
          suggestedColor={suggestCategoryColor(categories.data ?? [])}
          onClose={() => setCreatingCategory(false)}
          onSaved={(category) =>
            setForm((current) => ({ ...current, categoryIds: [...current.categoryIds, category.id] }))
          }
        />
      )}

      {pendingDiscard && (
        <ConfirmDialog
          title="Änderungen verwerfen?"
          confirmLabel="Verwerfen"
          cancelLabel="Weiter bearbeiten"
          onCancel={() => setPendingDiscard(null)}
          onConfirm={() => {
            setPendingDiscard(null);
            pendingDiscard();
          }}
        >
          {song
            ? `Deine Änderungen an „${song.title}“ sind noch nicht gespeichert.`
            : 'Deine Angaben zu diesem Song sind noch nicht gespeichert.'}
        </ConfirmDialog>
      )}

      {confirmingDelete && song && (
        <ConfirmDialog
          title="Song löschen?"
          confirmLabel="Löschen"
          busy={deleteSong.isPending}
          error={deleteSong.isError ? errorMessage(deleteSong.error) : null}
          onCancel={() => {
            deleteSong.reset();
            setConfirmingDelete(false);
          }}
          onConfirm={() => deleteSong.mutate(song.id, { onSuccess: onClose })}
        >
          „{song.title}“ von {song.artist} wird aus der Bibliothek und aus allen Playlists entfernt.
        </ConfirmDialog>
      )}
    </>
  );
}

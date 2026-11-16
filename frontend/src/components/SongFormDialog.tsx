import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, errorMessage } from '../api.ts';
import { formatDuration, parseDuration } from '../lib/format.ts';
import { extractYoutubeId, PLATFORMS, searchUrl, youtubeVideoUrl, type Platform } from '../lib/links.ts';
import { addGenre, distinctGenres } from '../lib/songs.ts';
import { useCategories, useConfig, useDeleteSong, useSaveSong, useSongs, useYoutubeStatus } from '../queries.ts';
import type { LookupResult, Song, SongInput } from '../types.ts';
import { CategoryFormDialog, suggestCategoryColor } from './CategoryFormDialog.tsx';
import { GenrePicker } from './GenrePicker.tsx';
import { ConfirmDialog, Modal } from './Modal.tsx';
import { OnlineSearch } from './OnlineSearch.tsx';
import { Artwork, ChipToggle, ENERGY_LABELS, Field, RATING_LABELS, ScaleInput } from './ui.tsx';

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
  rating: number | null;
  notes: string;
  appleMusicUrl: string;
  youtubeUrl: string;
  youtubeMusicUrl: string;
  artworkUrl: string;
  categoryIds: number[];
}

type Errors = Record<string, string | undefined>;

const EMPTY_FORM: FormState = {
  title: '',
  artist: '',
  album: '',
  duration: '',
  releaseYear: '',
  genres: [],
  bpm: '',
  energy: null,
  rating: null,
  notes: '',
  appleMusicUrl: '',
  youtubeUrl: '',
  youtubeMusicUrl: '',
  artworkUrl: '',
  categoryIds: [],
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
    rating: song.rating,
    notes: song.notes ?? '',
    appleMusicUrl: song.appleMusicUrl ?? '',
    youtubeUrl: song.youtubeUrl ?? '',
    youtubeMusicUrl: song.youtubeMusicUrl ?? '',
    artworkUrl: song.artworkUrl ?? '',
    categoryIds: song.categoryIds,
  };
}

/** Übernimmt einen Treffer der Online-Suche; was der Treffer nicht kennt, bleibt wie es ist. */
function applyLookup(form: FormState, result: LookupResult): FormState {
  return {
    ...form,
    title: result.title,
    artist: result.artist,
    album: result.album ?? form.album,
    duration: result.durationSeconds === null ? form.duration : formatDuration(result.durationSeconds),
    releaseYear: result.releaseYear === null ? form.releaseYear : String(result.releaseYear),
    // Ein Song kann mehrere Genres haben: Das Genre des Treffers kommt dazu, statt die Auswahl zu ersetzen.
    genres: result.genre ? addGenre(form.genres, result.genre) : form.genres,
    appleMusicUrl: result.appleMusicUrl ?? form.appleMusicUrl,
    artworkUrl: result.artworkUrl ?? form.artworkUrl,
  };
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
  hint?: string | undefined;
  onChange: (value: string) => void;
  /** Statt die Plattform im neuen Tab zu öffnen, direkt in der App suchen (YouTube mit Verbindung). */
  onSearch?: (() => void) | undefined;
  searching?: boolean;
}

/** Eingabefeld für einen Link samt Abkürzung zur Suche auf der Plattform (zum Kopieren des Links). */
function LinkField({ platform, id, value, placeholder, query, error, hint, onChange, onSearch, searching }: LinkFieldProps) {
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

export function SongFormDialog({ song, onClose }: SongFormDialogProps) {
  const [form, setForm] = useState<FormState>(() => (song ? formFromSong(song) : EMPTY_FORM));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [searchKey, setSearchKey] = useState(0);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [focusFirstError, setFocusFirstError] = useState(0);

  const categories = useCategories();
  const songs = useSongs();
  const genreOptions = useMemo(() => distinctGenres(songs.data ?? []), [songs.data]);
  const queryClient = useQueryClient();
  const youtubeStatus = useYoutubeStatus();
  const youtubeSearch = useMutation({
    mutationFn: (hints: Parameters<typeof api.youtube.search>[0]) => api.youtube.search(hints),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['youtube', 'status'] }),
  });
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

  function submit(addAnother: boolean) {
    const { input, errors: found } = validate(form);
    setErrors(found);
    setSavedNote(null);
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
          setSavedNote(`„${saved.title}“ ist gespeichert.`);
        },
        onError: (err) => {
          if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
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

  return (
    <>
      <Modal
        title={song ? 'Song bearbeiten' : 'Song hinzufügen'}
        onClose={onClose}
        onSubmit={() => submit(false)}
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
              </p>
            )}
            {savedNote && (
              <p className="form-success" role="status">
                {savedNote}
              </p>
            )}
            <button type="button" className="button" onClick={onClose} disabled={busy}>
              {savedNote ? 'Fertig' : 'Abbrechen'}
            </button>
            {!song && (
              <button type="button" className="button" onClick={() => submit(true)} disabled={busy}>
                Speichern &amp; weiterer Song
              </button>
            )}
            <button type="submit" className="button button-primary" disabled={busy}>
              Speichern
            </button>
          </>
        }
      >
        <div ref={bodyRef} className="song-form">
          <OnlineSearch
            key={searchKey}
            autoFocus={!song}
            onPick={(result) => {
              setForm((current) => applyLookup(current, result));
              setErrors({});
              setFormError(null);
              setSavedNote(null);
            }}
          />

          <div className="form-grid">
            <Field label="Titel" htmlFor={`${id}-title`} error={errors.title} className="span-3">
              <input
                id={`${id}-title`}
                className="input"
                value={form.title}
                maxLength={300}
                data-autofocus={song ? true : undefined}
                onChange={(event) => set('title', event.target.value)}
              />
            </Field>
            <Field label="Interpret" htmlFor={`${id}-artist`} error={errors.artist} className="span-3">
              <input
                id={`${id}-artist`}
                className="input"
                value={form.artist}
                maxLength={300}
                onChange={(event) => set('artist', event.target.value)}
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
            <Field
              label="Genres"
              htmlFor={`${id}-genre`}
              error={errors.genres}
              hint="Mehrere möglich: aus der Liste wählen oder neu eintippen."
              className="span-3"
            >
              <GenrePicker
                id={`${id}-genre`}
                value={form.genres}
                options={genreOptions}
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
            <Field label="Jahr" htmlFor={`${id}-year`} error={errors.releaseYear} hint="Erscheinungsjahr" className="span-2">
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
            <Field label="BPM" htmlFor={`${id}-bpm`} error={errors.bpm} hint="Tempo, falls bekannt" className="span-2">
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
            {errors.categoryIds && (
              <p className="field-error" role="alert">
                {errors.categoryIds}
              </p>
            )}
          </fieldset>

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
              <span className="field-label">Energie</span>
              <ScaleInput
                variant="levels"
                groupLabel="Energie"
                labels={ENERGY_LABELS}
                value={form.energy}
                onChange={(value) => set('energy', value)}
              />
            </div>
          </div>

          <fieldset className="form-section">
            <legend>Links zu Streaming-Plattformen</legend>
            <p className="field-hint section-hint">
              Alles optional: Ohne gespeicherten Link führt der Knopf in der Songliste zur Suche auf der Plattform.
            </p>
            <LinkField
              platform="appleMusic"
              id={`${id}-apple`}
              value={form.appleMusicUrl}
              placeholder="https://music.apple.com/…"
              query={query}
              error={errors.appleMusicUrl}
              onChange={(value) => set('appleMusicUrl', value)}
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
                  : undefined
              }
              onChange={(value) => set('youtubeUrl', value)}
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
            />
          </fieldset>

          <div className="form-grid">
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
          </div>
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

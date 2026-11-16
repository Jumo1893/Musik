import { useId, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleCheck, ExternalLink, Import } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { api, errorMessage } from '../api.ts';
import { Artwork, ChipToggle, EmptyState, ErrorNote, Field, LoadingNote, PageHeader } from '../components/ui.tsx';
import { formatCount, formatDuration, formatSongCount } from '../lib/format.ts';
import { refreshData, useCategories, useYoutubePreview } from '../queries.ts';
import type {
  Category,
  YoutubeImportCandidate,
  YoutubeImportItem,
  YoutubeImportPreview,
  YoutubeImportResult,
} from '../types.ts';

type Action = 'create' | 'link' | 'skip';

interface Choice {
  action: Action;
  title: string;
  artist: string;
}

/** Vorschlag je Video: Vorhandene Songs verknüpfen, Nicht-Musik und Dubletten überspringen. */
function initialChoice(item: YoutubeImportCandidate): Choice {
  const action: Action =
    !item.available || item.duplicateOf !== null || item.isMusic === false ? 'skip' : item.match ? 'link' : 'create';
  return { action, title: item.title, artist: item.artist };
}

function note(item: YoutubeImportCandidate): string | null {
  if (!item.available) return 'Nicht mehr verfügbar';
  if (item.duplicateOf !== null) return `Doppelt (wie Nr. ${item.duplicateOf + 1})`;
  if (item.isMusic === false) return 'Kein Musikvideo';
  return null;
}

interface RowProps {
  item: YoutubeImportCandidate;
  choice: Choice;
  invalid: boolean;
  onChange: (change: Partial<Choice>) => void;
}

function ImportRow({ item, choice, invalid, onChange }: RowProps) {
  const id = useId();
  const hint = note(item);
  return (
    <li className={`import-row import-${choice.action}`}>
      <span className="import-position">{item.position + 1}</span>
      <Artwork url={item.thumbnailUrl} size={44} />
      <div className="import-main">
        {choice.action === 'create' ? (
          <div className="import-fields">
            <input
              className={`input ${invalid && !choice.title.trim() ? 'input-invalid' : ''}`}
              value={choice.title}
              aria-label={`Titel für Video ${item.position + 1}`}
              placeholder="Titel"
              maxLength={300}
              onChange={(event) => onChange({ title: event.target.value })}
            />
            <input
              className={`input ${invalid && !choice.artist.trim() ? 'input-invalid' : ''}`}
              value={choice.artist}
              aria-label={`Interpret für Video ${item.position + 1}`}
              placeholder="Interpret"
              maxLength={300}
              onChange={(event) => onChange({ artist: event.target.value })}
            />
          </div>
        ) : choice.action === 'link' && item.match ? (
          <div className="import-link">
            Verknüpft mit „{item.match.title}“ von {item.match.artist}
            {item.match.reason === 'video' && <span className="muted"> · Video ist dort schon verlinkt</span>}
          </div>
        ) : (
          <div className="import-skip">{item.available ? `${item.artist} – ${item.title}` : item.videoTitle}</div>
        )}
        <div className="song-sub" title={item.videoTitle}>
          {item.available ? (
            <a href={`https://www.youtube.com/watch?v=${item.videoId}`} target="_blank" rel="noopener noreferrer">
              {item.videoTitle}
            </a>
          ) : (
            item.videoTitle
          )}
          {item.channelTitle && ` · ${item.channelTitle}`}
        </div>
      </div>
      <span className="import-duration cell-number">{formatDuration(item.durationSeconds)}</span>
      <div className="import-action">
        {item.available ? (
          <select
            id={id}
            className="input"
            value={choice.action}
            aria-label={`Was mit Video ${item.position + 1} passieren soll`}
            onChange={(event) => onChange({ action: event.target.value as Action })}
          >
            <option value="create">Neu anlegen</option>
            {item.match && <option value="link">Verknüpfen</option>}
            <option value="skip">Überspringen</option>
          </select>
        ) : null}
        {hint && <span className="import-note">{hint}</span>}
      </div>
    </li>
  );
}

function ImportResultCard({ result, preview }: { result: YoutubeImportResult; preview: YoutubeImportPreview }) {
  const parts = [
    result.createdSongs > 0 && formatCount(result.createdSongs, 'neuer Song angelegt', 'neue Songs angelegt'),
    result.linkedSongs > 0 && formatCount(result.linkedSongs, 'vorhandener Song verknüpft', 'vorhandene Songs verknüpft'),
    result.existingSongs > 0 && formatCount(result.existingSongs, 'Song war schon da', 'Songs waren schon da'),
  ].filter(Boolean);
  return (
    <section className="card youtube-card">
      <p className="form-success" role="status">
        <CircleCheck size={16} aria-hidden /> „{preview.playlist.title}“ ist übernommen: {parts.join(', ')}.
      </p>
      <p className="field-hint">
        Titel, Interpret und Dauer stammen von YouTube. Album, Genre und Jahr ergänzt die Online-Suche im Song-Dialog, die
        Stimmung die Kategorien.
        {result.createdSongs > 0 &&
          ' Das Tempo (BPM) der neuen Songs wird gerade im Hintergrund auf songbpm.com nachgeschlagen und erscheint nach und nach in der Songliste.'}
      </p>
      <div className="export-actions">
        {result.playlistId !== null && (
          <Link className="button button-primary" to={`/playlists/${result.playlistId}`}>
            Zur Playlist
          </Link>
        )}
        <Link className="button" to="/songs">
          Zu den Songs
        </Link>
        <Link className="button" to="/youtube">
          Weitere Playlist übernehmen
        </Link>
      </div>
    </section>
  );
}

function ImportForm({ preview, categories }: { preview: YoutubeImportPreview; categories: Category[] }) {
  const queryClient = useQueryClient();
  const nameId = useId();
  const [choices, setChoices] = useState<Choice[]>(() => preview.items.map(initialChoice));
  const [asPlaylist, setAsPlaylist] = useState(true);
  const [name, setName] = useState(preview.playlist.id === 'mag-ich' ? 'Mag ich (YouTube)' : preview.playlist.title);
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [showInvalid, setShowInvalid] = useState(false);

  const save = useMutation({
    mutationFn: api.youtube.import,
    onSuccess: () => refreshData(queryClient),
  });

  const counts = useMemo(() => {
    const result = { create: 0, link: 0, skip: 0 };
    for (const choice of choices) result[choice.action]++;
    return result;
  }, [choices]);
  const invalidRows = choices.filter((choice) => choice.action === 'create' && (!choice.title.trim() || !choice.artist.trim()));
  const selected = counts.create + counts.link;

  function update(index: number, change: Partial<Choice>) {
    setChoices((list) => list.map((choice, i) => (i === index ? { ...choice, ...change } : choice)));
  }

  function selectAll(selectedState: boolean) {
    setChoices(preview.items.map((item, index) => {
      const current = choices[index]!;
      if (!selectedState || !item.available) return { ...current, action: 'skip' };
      return { ...current, action: item.match ? 'link' : 'create' };
    }));
  }

  function submit() {
    if (invalidRows.length > 0 || (asPlaylist && !name.trim())) {
      setShowInvalid(true);
      return;
    }
    const items: YoutubeImportItem[] = [];
    preview.items.forEach((item, index) => {
      const choice = choices[index]!;
      if (choice.action === 'link' && item.match) {
        items.push({ action: 'link', videoId: item.videoId, songId: item.match.songId });
      } else if (choice.action === 'create') {
        items.push({
          action: 'create',
          videoId: item.videoId,
          title: choice.title.trim(),
          artist: choice.artist.trim(),
          durationSeconds: item.durationSeconds,
          thumbnailUrl: item.thumbnailUrl,
        });
      }
    });
    save.mutate({
      playlist: asPlaylist ? { name: name.trim(), description: `Übernommen von YouTube („${preview.playlist.title}“)` } : null,
      categoryIds,
      items,
    });
  }

  if (save.data) return <ImportResultCard result={save.data} preview={preview} />;

  return (
    <>
      <section className="card youtube-card import-options">
        <label className="checkbox-row">
          <input type="checkbox" checked={asPlaylist} onChange={(event) => setAsPlaylist(event.target.checked)} />
          Als Playlist in der App anlegen
        </label>
        {asPlaylist && (
          <Field
            label="Name der Playlist"
            htmlFor={nameId}
            error={showInvalid && !name.trim() ? 'Bitte einen Namen angeben.' : undefined}
          >
            <input id={nameId} className="input" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
          </Field>
        )}
        {categories.length > 0 && (
          <div className="field">
            <span className="field-label">Kategorien für die neuen Songs</span>
            <div className="chip-list">
              {categories.map((category) => (
                <ChipToggle
                  key={category.id}
                  category={category}
                  pressed={categoryIds.includes(category.id)}
                  onToggle={() =>
                    setCategoryIds((ids) =>
                      ids.includes(category.id) ? ids.filter((id) => id !== category.id) : [...ids, category.id],
                    )
                  }
                />
              ))}
            </div>
            <p className="field-hint">Optional – zum Beispiel „aufpushend“ für eine Workout-Playlist.</p>
          </div>
        )}
      </section>

      <div className="list-summary import-summary">
        <span>
          {formatCount(preview.items.length, 'Video', 'Videos')}: {counts.create} neu, {counts.link} verknüpfen, {counts.skip}{' '}
          überspringen
        </span>
        <button type="button" className="link-button" onClick={() => selectAll(true)}>
          Alle übernehmen
        </button>
        <button type="button" className="link-button" onClick={() => selectAll(false)}>
          Keins übernehmen
        </button>
      </div>

      <ol className="card import-list">
        {preview.items.map((item, index) => (
          <ImportRow
            key={`${item.videoId}-${item.position}`}
            item={item}
            choice={choices[index]!}
            invalid={showInvalid}
            onChange={(change) => update(index, change)}
          />
        ))}
      </ol>

      <div className="import-footer">
        {showInvalid && invalidRows.length > 0 && (
          <p className="form-error" role="alert">
            Bei {formatCount(invalidRows.length, 'neuem Song fehlt', 'neuen Songs fehlen')} Titel oder Interpret.
          </p>
        )}
        {save.isError && (
          <p className="form-error" role="alert">
            {errorMessage(save.error)}
          </p>
        )}
        <button type="button" className="button button-primary" disabled={selected === 0 || save.isPending} onClick={submit}>
          <Import size={16} aria-hidden />
          {selected === 1 ? 'Einen Song übernehmen' : `${formatSongCount(selected)} übernehmen`}
        </button>
      </div>
    </>
  );
}

export function YoutubeImportPage() {
  const id = useParams().id ?? '';
  const preview = useYoutubePreview(id);
  const categories = useCategories();

  return (
    <>
      <Link className="back-link" to="/youtube">
        <ArrowLeft size={16} aria-hidden />
        YouTube
      </Link>
      {preview.isPending ? (
        <LoadingNote label="Lade die Playlist von YouTube …" />
      ) : preview.isError ? (
        <ErrorNote error={preview.error} onRetry={() => void preview.refetch()} />
      ) : (
        <>
          <PageHeader
            title={preview.data.playlist.title}
            subtitle="Prüfe, welche Videos als Songs übernommen werden. Titel und Interpret stammen aus dem Videotitel und lassen sich hier noch korrigieren."
            actions={
              <a className="button" href={preview.data.playlist.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} aria-hidden />
                Auf YouTube öffnen
              </a>
            }
          />
          {preview.data.items.length === 0 ? (
            <EmptyState title="Diese Playlist ist leer" />
          ) : (
            <ImportForm key={id} preview={preview.data} categories={categories.data ?? []} />
          )}
        </>
      )}
    </>
  );
}

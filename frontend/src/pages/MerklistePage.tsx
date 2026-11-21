import { useState } from 'react';
import { Bookmark, BookmarkPlus, Link2, Music, Trash2 } from 'lucide-react';
import { errorMessage } from '../api.ts';
import { SongFormDialog } from '../components/SongFormDialog.tsx';
import { EmptyState, ErrorNote, LoadingNote, PageHeader } from '../components/ui.tsx';
import { formatDateTime, formatRelativeTime } from '../lib/format.ts';
import { looksLikeLink } from '../lib/links.ts';
import { useAddToMerkliste, useMerkliste, useRemoveFromMerkliste } from '../queries.ts';
import type { NotedSong } from '../types.ts';

/**
 * Merkliste für unterwegs: einen Song, den man gerade irgendwo hört, in Sekunden vormerken –
 * als „Interpret – Titel“ oder Link – und später in Ruhe erfassen. Gebaut fürs Handy: ein
 * großes Feld, große Knöpfe, mit einer Hand bedienbar.
 */
export function MerklistePage() {
  const notes = useMerkliste();
  const add = useAddToMerkliste();
  const remove = useRemoveFromMerkliste();
  const [text, setText] = useState('');
  const [capturing, setCapturing] = useState<NotedSong | null>(null);
  /** Der Eintrag, der gerade erfasst wird, ist als Song gespeichert und von der Liste genommen. */
  const [captured, setCaptured] = useState(false);

  function noteDown() {
    const trimmed = text.trim();
    if (trimmed === '' || add.isPending) return;
    add.mutate(trimmed, { onSuccess: () => setText('') });
  }

  /** Nach dem ersten Speichern verschwindet der Eintrag von der Merkliste. */
  function songSaved() {
    if (!capturing || captured) return;
    setCaptured(true);
    remove.mutate(capturing.id);
  }

  function closeDialog() {
    setCapturing(null);
    setCaptured(false);
  }

  return (
    <>
      <PageHeader
        title="Merkliste"
        subtitle="Gerade einen Song gehört? Schnell vormerken und später in Ruhe erfassen."
      />

      <form
        className="card note-form"
        onSubmit={(event) => {
          event.preventDefault();
          noteDown();
        }}
      >
        <label className="field-label" htmlFor="note-text">
          Interpret – Titel oder Link
        </label>
        <div className="note-input-row">
          <input
            id="note-text"
            className="input note-input"
            value={text}
            maxLength={2000}
            autoComplete="off"
            enterKeyHint="done"
            placeholder="z. B. Johnny Cash – Hurt"
            onChange={(event) => setText(event.target.value)}
          />
          <button type="submit" className="button button-primary note-submit" disabled={text.trim() === '' || add.isPending}>
            <BookmarkPlus size={20} aria-hidden />
            Vormerken
          </button>
        </div>
        {add.isError && (
          <p className="form-error" role="alert">
            {errorMessage(add.error)}
          </p>
        )}
        <p className="field-hint">
          Links von Apple Music, YouTube und YouTube Music werden beim Erfassen erkannt. Vorgemerktes zählt noch nicht als Song.
        </p>
      </form>

      {notes.isPending ? (
        <LoadingNote label="Lade Merkliste …" />
      ) : notes.isError ? (
        <ErrorNote error={notes.error} onRetry={() => void notes.refetch()} />
      ) : notes.data.length === 0 ? (
        <EmptyState icon={<Bookmark size={28} aria-hidden />} title="Nichts vorgemerkt">
          <p>Was du hier einträgst, wartet, bis du es mit „Erfassen“ als Song anlegst.</p>
        </EmptyState>
      ) : (
        <>
          <p className="list-summary" role="status">
            {notes.data.length === 1 ? 'Ein Eintrag wartet' : `${notes.data.length} Einträge warten`} aufs Erfassen.
          </p>
          <ul className="note-list">
            {notes.data.map((note) => (
              <li key={note.id} className="card note-row">
                <span className="note-icon" aria-hidden>
                  {looksLikeLink(note.text) ? <Link2 size={18} /> : <Music size={18} />}
                </span>
                <span className="note-text">
                  <span className="note-title">{note.text}</span>
                  <span className="song-sub" title={formatDateTime(note.createdAt)}>
                    vorgemerkt {formatRelativeTime(note.createdAt)}
                  </span>
                </span>
                <span className="note-actions">
                  <button type="button" className="button button-primary" onClick={() => setCapturing(note)}>
                    Erfassen
                  </button>
                  <button
                    type="button"
                    className="icon-button note-delete"
                    aria-label={`„${note.text}“ löschen`}
                    title="Löschen"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(note.id)}
                  >
                    <Trash2 size={18} aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {remove.isError && (
            <p className="form-error" role="alert">
              {errorMessage(remove.error)}
            </p>
          )}
        </>
      )}

      {capturing && (
        <SongFormDialog
          song={null}
          initialSearch={capturing.text}
          onSaved={songSaved}
          onClose={closeDialog}
        />
      )}
    </>
  );
}

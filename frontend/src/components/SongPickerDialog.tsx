import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { formatDuration } from '../lib/format.ts';
import { filterSongs, sortSongs } from '../lib/songs.ts';
import type { Category, Song } from '../types.ts';
import { Modal } from './Modal.tsx';
import { Artwork, CategoryChips } from './ui.tsx';

/** Mehr Zeilen zeigt die Auswahl nicht auf einmal – die Suche grenzt ein. */
const VISIBLE_LIMIT = 60;

interface SongPickerDialogProps {
  songs: Song[];
  categories: Map<number, Category>;
  /** Songs, die schon in der Playlist sind und deshalb nicht angeboten werden */
  excludeIds: number[];
  onAdd: (song: Song) => void;
  onClose: () => void;
}

/** Auswahl von Songs aus der Bibliothek; bleibt offen, um mehrere nacheinander hinzuzufügen. */
export function SongPickerDialog({ songs, categories, excludeIds, onAdd, onClose }: SongPickerDialogProps) {
  const [text, setText] = useState('');

  const available = useMemo(() => {
    const excluded = new Set(excludeIds);
    const candidates = songs.filter((song) => !excluded.has(song.id));
    return sortSongs(filterSongs(candidates, { text, categoryIds: [], onlyUncategorized: false }), {
      key: 'artist',
      descending: false,
    });
  }, [songs, excludeIds, text]);

  return (
    <Modal
      title="Songs hinzufügen"
      onClose={onClose}
      size="large"
      footer={
        <button type="button" className="button button-primary" onClick={onClose}>
          Fertig
        </button>
      }
    >
      <input
        className="input"
        type="search"
        value={text}
        data-autofocus
        placeholder="Titel, Interpret, Album oder Genre suchen"
        aria-label="Bibliothek durchsuchen"
        onChange={(event) => setText(event.target.value)}
      />

      {available.length === 0 ? (
        <p className="field-hint picker-empty" role="status">
          {songs.length === excludeIds.length && text.trim() === ''
            ? 'Alle Songs deiner Bibliothek sind schon in dieser Playlist.'
            : 'Kein passender Song gefunden.'}
        </p>
      ) : (
        <ul className="picker-list">
          {available.slice(0, VISIBLE_LIMIT).map((song) => (
            <li key={song.id} className="picker-row">
              <Artwork url={song.artworkUrl} size={36} />
              <span className="picker-text">
                <span className="picker-title">{song.title}</span>
                <span className="song-sub">{song.artist}</span>
              </span>
              <span className="picker-categories">
                <CategoryChips ids={song.categoryIds} categories={categories} />
              </span>
              <span className="cell-number">{formatDuration(song.durationSeconds)}</span>
              <button
                type="button"
                className="button button-small"
                aria-label={`${song.title} von ${song.artist} hinzufügen`}
                onClick={() => onAdd(song)}
              >
                <Plus size={14} aria-hidden />
                Hinzufügen
              </button>
            </li>
          ))}
        </ul>
      )}
      {available.length > VISIBLE_LIMIT && (
        <p className="field-hint">
          {available.length - VISIBLE_LIMIT} weitere Songs – grenz die Auswahl über die Suche ein.
        </p>
      )}
    </Modal>
  );
}

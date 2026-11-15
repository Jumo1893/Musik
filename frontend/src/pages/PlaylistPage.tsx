import { useEffect, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Check, Copy, Download, Pencil, Play, Plus, Trash2, WandSparkles, X } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { errorMessage } from '../api.ts';
import { ConfirmDialog, Modal } from '../components/Modal.tsx';
import { PlaylistDetailsDialog } from '../components/PlaylistDetailsDialog.tsx';
import { SongPickerDialog } from '../components/SongPickerDialog.tsx';
import { StreamingLinks } from '../components/StreamingLinks.tsx';
import { Artwork, CategoryChips, EmptyState, ErrorNote, LoadingNote, PageHeader } from '../components/ui.tsx';
import { downloadTextFile, toCsv, toFilename } from '../lib/csv.ts';
import { describeCriteria } from '../lib/criteria.ts';
import { formatDuration, formatSongCount, formatTotalDuration } from '../lib/format.ts';
import { YOUTUBE_QUEUE_LIMIT, youtubeIdOf, youtubeQueueUrl } from '../lib/links.ts';
import { SONG_CSV_HEADER, songCsvRow, totalDuration } from '../lib/songs.ts';
import { useById, useCategories, useDeletePlaylist, usePlaylists, useSongs, useUpdatePlaylist } from '../queries.ts';
import type { Category, Playlist, Song } from '../types.ts';

export function PlaylistPage() {
  const id = Number(useParams().id);
  const playlists = usePlaylists();
  const songs = useSongs();
  const categories = useCategories();
  const categoriesById = useById(categories.data);

  if (playlists.isPending || songs.isPending) return <LoadingNote label="Lade Playlist …" />;
  if (playlists.isError) return <ErrorNote error={playlists.error} onRetry={() => void playlists.refetch()} />;
  if (songs.isError) return <ErrorNote error={songs.error} onRetry={() => void songs.refetch()} />;

  const playlist = playlists.data.find((candidate) => candidate.id === id);
  if (!playlist) {
    return (
      <EmptyState title="Diese Playlist gibt es nicht (mehr)">
        <Link to="/playlists">Zu den Playlists</Link>
      </EmptyState>
    );
  }
  return <PlaylistView key={playlist.id} playlist={playlist} songs={songs.data} categoriesById={categoriesById} />;
}

interface PlaylistViewProps {
  playlist: Playlist;
  songs: Song[];
  categoriesById: Map<number, Category>;
}

function PlaylistView({ playlist, songs, categoriesById }: PlaylistViewProps) {
  const navigate = useNavigate();
  const updatePlaylist = useUpdatePlaylist();
  const deletePlaylist = useDeletePlaylist(() => void navigate('/playlists'));
  const songsById = useById(songs);
  const [dialog, setDialog] = useState<'add' | 'rename' | 'delete' | 'text' | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  const entries = playlist.songIds.map((id) => songsById.get(id)).filter((song) => song !== undefined);
  const entryIds = entries.map((song) => song.id);

  function saveSongs(songIds: number[]) {
    updatePlaylist.mutate({
      id: playlist.id,
      input: { name: playlist.name, description: playlist.description, songIds },
    });
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= entryIds.length) return;
    const next = [...entryIds];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    saveSongs(next);
  }

  const videoIds = entries.map(youtubeIdOf).filter((videoId) => videoId !== null);
  const queueUrl = youtubeQueueUrl(videoIds);
  const listAsText = entries.map((song, index) => `${index + 1}. ${song.artist} – ${song.title}`).join('\n');

  async function copyList() {
    try {
      await navigator.clipboard.writeText(listAsText);
      setCopied(true);
    } catch {
      // Ohne https oder localhost verweigert der Browser die Zwischenablage – dann zum Markieren anzeigen.
      setDialog('text');
    }
  }

  function exportCsv() {
    const rows = entries.map((song, index) => [index + 1, ...songCsvRow(song, categoriesById)]);
    downloadTextFile(`${toFilename(playlist.name, 'playlist')}.csv`, toCsv(['Nr.', ...SONG_CSV_HEADER], rows));
  }

  const criteriaParts = playlist.criteria ? describeCriteria(playlist.criteria, categoriesById) : [];

  return (
    <>
      <Link className="back-link" to="/playlists">
        <ArrowLeft size={16} aria-hidden />
        Alle Playlists
      </Link>

      <PageHeader
        title={playlist.name}
        subtitle={
          <>
            {playlist.description && <span className="playlist-description">{playlist.description}</span>}
            <span>
              {formatSongCount(entries.length)} · {formatTotalDuration(totalDuration(entries))}
            </span>
          </>
        }
        actions={
          <>
            <button type="button" className="button" onClick={() => setDialog('rename')}>
              <Pencil size={16} aria-hidden />
              Umbenennen
            </button>
            <button type="button" className="button button-danger-quiet" onClick={() => setDialog('delete')}>
              <Trash2 size={16} aria-hidden />
              Löschen
            </button>
            <button type="button" className="button button-primary" onClick={() => setDialog('add')}>
              <Plus size={16} aria-hidden />
              Songs hinzufügen
            </button>
          </>
        }
      />

      {playlist.criteria && (
        <p className="criteria-summary">
          <WandSparkles size={16} aria-hidden />
          <span>
            Erzeugt aus: {criteriaParts.length > 0 ? criteriaParts.join(' · ') : 'der ganzen Bibliothek'}.{' '}
            <Link to={`/playlists/neu?vorlage=${playlist.id}`}>Mit diesen Kriterien neu erzeugen</Link>
          </span>
        </p>
      )}

      {updatePlaylist.isError && <ErrorNote error={updatePlaylist.error} />}

      {entries.length === 0 ? (
        <EmptyState title="Diese Playlist ist noch leer">
          <button type="button" className="button button-primary" onClick={() => setDialog('add')}>
            <Plus size={16} aria-hidden />
            Songs hinzufügen
          </button>
        </EmptyState>
      ) : (
        <>
          <section className="card export-card" aria-label="Playlist mitnehmen">
            <div className="export-actions">
              {queueUrl ? (
                <a className="button button-primary" href={queueUrl} target="_blank" rel="noopener noreferrer">
                  <Play size={16} aria-hidden />
                  Auf YouTube abspielen
                </a>
              ) : (
                <button type="button" className="button" disabled>
                  <Play size={16} aria-hidden />
                  Auf YouTube abspielen
                </button>
              )}
              <button type="button" className="button" onClick={() => void copyList()}>
                {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                {copied ? 'Kopiert' : 'Als Liste kopieren'}
              </button>
              <button type="button" className="button" onClick={exportCsv}>
                <Download size={16} aria-hidden />
                Als CSV exportieren
              </button>
            </div>
            <p className="field-hint">
              {videoIds.length === 0
                ? 'Für YouTube braucht mindestens ein Song einen gespeicherten YouTube-Link.'
                : `${videoIds.length} von ${formatSongCount(entries.length)} ${videoIds.length === 1 ? 'hat' : 'haben'} einen YouTube-Link und ${videoIds.length === 1 ? 'wird' : 'werden'} dort als Wiedergabeliste geöffnet – über „Speichern“ wird daraus eine eigene YouTube-Playlist.`}
              {videoIds.length > YOUTUBE_QUEUE_LIMIT && ` YouTube übernimmt auf diesem Weg höchstens ${YOUTUBE_QUEUE_LIMIT} Songs.`}
            </p>
          </section>

          <div className="card table-card">
            <table className="table table-fixed table-playlist">
              <thead>
                <tr>
                  <th className="col-position cell-number">Nr.</th>
                  <th className="col-song">Titel und Interpret</th>
                  <th className="col-categories">Kategorien</th>
                  <th className="col-duration cell-number">Dauer</th>
                  <th className="col-links">Anhören</th>
                  <th className="col-actions">
                    <span className="visually-hidden">Reihenfolge ändern oder entfernen</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((song, index) => (
                  <tr key={song.id}>
                    <td className="col-position cell-number muted">{index + 1}</td>
                    <td className="col-song">
                      <div className="song-cell">
                        <Artwork url={song.artworkUrl} />
                        <div className="song-cell-text">
                          <span className="song-title-text" title={song.title}>{song.title}</span>
                          <span className="song-sub">{song.artist}</span>
                        </div>
                      </div>
                    </td>
                    <td className="col-categories">
                      <CategoryChips ids={song.categoryIds} categories={categoriesById} />
                    </td>
                    <td className="col-duration cell-number">{formatDuration(song.durationSeconds)}</td>
                    <td className="col-links">
                      <StreamingLinks song={song} compact />
                    </td>
                    <td className="col-actions">
                      <span className="row-actions">
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`${song.title} nach oben`}
                          title="Nach oben"
                          disabled={index === 0}
                          onClick={() => move(index, index - 1)}
                        >
                          <ArrowUp size={16} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`${song.title} nach unten`}
                          title="Nach unten"
                          disabled={index === entries.length - 1}
                          onClick={() => move(index, index + 1)}
                        >
                          <ArrowDown size={16} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`${song.title} aus der Playlist entfernen`}
                          title="Aus der Playlist entfernen"
                          onClick={() => saveSongs(entryIds.filter((id) => id !== song.id))}
                        >
                          <X size={16} aria-hidden />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {dialog === 'add' && (
        <SongPickerDialog
          songs={songs}
          categories={categoriesById}
          excludeIds={entryIds}
          onAdd={(song) => saveSongs([...entryIds, song.id])}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === 'rename' && (
        <PlaylistDetailsDialog
          title="Playlist umbenennen"
          submitLabel="Speichern"
          initialName={playlist.name}
          initialDescription={playlist.description}
          onClose={() => setDialog(null)}
          onSubmit={async (details) => {
            await updatePlaylist.mutateAsync({ id: playlist.id, input: { ...details, songIds: entryIds } });
            setDialog(null);
          }}
        />
      )}

      {dialog === 'delete' && (
        <ConfirmDialog
          title="Playlist löschen?"
          confirmLabel="Löschen"
          busy={deletePlaylist.isPending}
          error={deletePlaylist.isError ? errorMessage(deletePlaylist.error) : null}
          onCancel={() => {
            deletePlaylist.reset();
            setDialog(null);
          }}
          onConfirm={() => deletePlaylist.mutate(playlist.id)}
        >
          „{playlist.name}“ wird gelöscht. Die Songs bleiben in deiner Bibliothek.
        </ConfirmDialog>
      )}

      {dialog === 'text' && (
        <Modal
          title="Playlist als Liste"
          onClose={() => setDialog(null)}
          footer={
            <button type="button" className="button button-primary" onClick={() => setDialog(null)}>
              Schließen
            </button>
          }
        >
          <p className="field-hint">Der Browser erlaubt hier keinen Zugriff auf die Zwischenablage – bitte den Text markieren und kopieren.</p>
          <textarea
            className="input textarea"
            rows={Math.min(16, entries.length + 1)}
            readOnly
            value={listAsText}
            aria-label="Playlist als Text"
            onFocus={(event) => event.target.select()}
          />
        </Modal>
      )}
    </>
  );
}

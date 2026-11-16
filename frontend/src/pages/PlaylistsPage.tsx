import { useState } from 'react';
import { ListMusic, Plus, WandSparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { PlaylistDetailsDialog } from '../components/PlaylistDetailsDialog.tsx';
import { EmptyState, ErrorNote, LoadingNote, PageHeader } from '../components/ui.tsx';
import { formatDate, formatSongCount, formatTotalDuration } from '../lib/format.ts';
import { useById, useCreatePlaylist, usePlaylists, useSongs } from '../queries.ts';

/** Bis zu vier Cover der Playlist als Kachel; ohne Cover ein Platzhalter. */
function Mosaic({ urls }: { urls: string[] }) {
  if (urls.length === 0) {
    return (
      <span className="mosaic mosaic-empty" aria-hidden>
        <ListMusic size={28} />
      </span>
    );
  }
  const shown = urls.length >= 4 ? urls.slice(0, 4) : urls.slice(0, 1);
  return (
    <span className={`mosaic ${shown.length === 4 ? 'mosaic-four' : ''}`} aria-hidden>
      {shown.map((url, index) => (
        <img key={`${url}-${index}`} src={url} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ))}
    </span>
  );
}

export function PlaylistsPage() {
  const playlists = usePlaylists();
  const songs = useSongs();
  const songsById = useById(songs.data);
  const createPlaylist = useCreatePlaylist();
  const navigate = useNavigate();
  const [creatingEmpty, setCreatingEmpty] = useState(false);

  const all = playlists.data ?? [];

  return (
    <>
      <PageHeader
        title="Playlists"
        subtitle="Lass dir aus Kategorien, Energie und Wunschdauer eine passende Playlist zusammenstellen – oder bau sie von Hand."
        actions={
          <>
            <button type="button" className="button" onClick={() => setCreatingEmpty(true)}>
              <Plus size={16} aria-hidden />
              Leere Playlist
            </button>
            <Link className="button button-primary" to="/playlists/neu">
              <WandSparkles size={16} aria-hidden />
              Playlist erzeugen
            </Link>
          </>
        }
      />

      {playlists.isPending ? (
        <LoadingNote label="Lade Playlists …" />
      ) : playlists.isError ? (
        <ErrorNote error={playlists.error} onRetry={() => void playlists.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState icon={<ListMusic size={28} aria-hidden />} title="Noch keine Playlists">
          <p>
            Wähl Kategorien wie „melancholisch“ oder „aufpushend“, gib eine Wunschdauer an – der Generator sucht die
            passendsten Songs aus deiner Bibliothek heraus.
          </p>
          <Link className="button button-primary" to="/playlists/neu">
            <WandSparkles size={16} aria-hidden />
            Erste Playlist erzeugen
          </Link>
        </EmptyState>
      ) : (
        <ul className="playlist-grid">
          {all.map((playlist) => {
            const covers = playlist.songIds
              .map((id) => songsById.get(id)?.artworkUrl)
              .filter((url): url is string => Boolean(url));
            return (
              <li key={playlist.id}>
                <Link className="card playlist-card" to={`/playlists/${playlist.id}`}>
                  <Mosaic urls={covers} />
                  <span className="playlist-card-text">
                    <span className="playlist-card-name">{playlist.name}</span>
                    {playlist.description && <span className="playlist-card-description">{playlist.description}</span>}
                    <span className="playlist-card-meta">
                      {formatSongCount(playlist.songIds.length)} · {formatTotalDuration(playlist.totalDurationSeconds)}
                    </span>
                    <span className="playlist-card-meta">
                      Geändert am {formatDate(playlist.updatedAt)}
                      {playlist.youtubePlaylistId && ' · auch auf YouTube'}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {creatingEmpty && (
        <PlaylistDetailsDialog
          title="Leere Playlist anlegen"
          submitLabel="Anlegen"
          onClose={() => setCreatingEmpty(false)}
          onSubmit={async (details) => {
            const playlist = await createPlaylist.mutateAsync({ ...details, songIds: [] });
            void navigate(`/playlists/${playlist.id}`);
          }}
        />
      )}
    </>
  );
}

import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CloudUpload, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { Link } from 'react-router';
import { api, errorMessage } from '../api.ts';
import { formatCount, formatDateTime, formatSongCount } from '../lib/format.ts';
import { youtubeIdOf } from '../lib/links.ts';
import { refreshData, useYoutubeStatus } from '../queries.ts';
import type { Playlist, Song, YoutubePrivacy, YoutubeStatus, YoutubeSyncJob } from '../types.ts';
import { ConfirmDialog, Modal } from './Modal.tsx';
import { Field, ProgressBar } from './ui.tsx';
import { YoutubeLinkFinder } from './YoutubeLinkFinder.tsx';

const PRIVACY_OPTIONS: Array<{ value: YoutubePrivacy; label: string; hint: string }> = [
  { value: 'private', label: 'Privat', hint: 'Nur du siehst die Playlist.' },
  { value: 'unlisted', label: 'Nicht gelistet', hint: 'Wer den Link hat, kann sie öffnen.' },
  { value: 'public', label: 'Öffentlich', hint: 'Für alle auf deinem Kanal sichtbar.' },
];

/** Kosten bei YouTube: Anlegen der Playlist und jedes Videos je 50 Einheiten. */
const WRITE_COST = 50;

function playlistLinks(id: string) {
  return {
    url: `https://www.youtube.com/playlist?list=${id}`,
    musicUrl: `https://music.youtube.com/playlist?list=${id}`,
  };
}

function SongNames({ songs }: { songs: Array<{ songId: number; title: string; artist: string }> }) {
  const shown = songs.slice(0, 5);
  return (
    <ul className="compact-list">
      {shown.map((song) => (
        <li key={song.songId}>
          „{song.title}“ von {song.artist}
        </li>
      ))}
      {songs.length > shown.length && <li>und {songs.length - shown.length} weitere</li>}
    </ul>
  );
}

function JobSummary({ job }: { job: YoutubeSyncJob }) {
  const result = job.result!;
  const changes = [
    result.added > 0 && formatCount(result.added, 'Song ergänzt', 'Songs ergänzt'),
    result.removed > 0 && formatCount(result.removed, 'Song entfernt', 'Songs entfernt'),
    result.moved > 0 && formatCount(result.moved, 'Song verschoben', 'Songs verschoben'),
  ].filter(Boolean);

  return (
    <div className="job-summary">
      <p className="form-success" role="status">
        <CircleCheck size={16} aria-hidden />{' '}
        {result.created
          ? `Die Playlist ist in deinem YouTube-Konto angelegt – ${formatSongCount(result.added)} übertragen.`
          : changes.length > 0
            ? `Abgeglichen: ${changes.join(', ')}.`
            : 'Die Playlist auf YouTube war schon auf dem neuesten Stand.'}
      </p>
      {result.recreated && (
        <p className="field-hint">Die verknüpfte Playlist gab es auf YouTube nicht mehr – sie wurde neu angelegt.</p>
      )}
      {result.orderSkipped && (
        <p className="field-hint">
          Die Reihenfolge ließ sich nicht übernehmen, weil die Playlist auf YouTube automatisch sortiert wird. Stell sie
          dort auf „Manuell“, dann klappt es beim nächsten Übertragen.
        </p>
      )}
      {result.unavailable.length > 0 && (
        <div className="field-hint">
          Diese Videos gibt es auf YouTube nicht mehr – bitte bei den Songs einen neuen Link eintragen:
          <SongNames songs={result.unavailable} />
        </div>
      )}
      {result.withoutVideo.length > 0 && (
        <div className="field-hint">
          Ohne YouTube-Link und deshalb nicht dabei:
          <SongNames songs={result.withoutVideo} />
        </div>
      )}
      <div className="export-actions">
        <a className="button" href={result.url} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} aria-hidden />
          Auf YouTube öffnen
        </a>
        <a className="button" href={result.musicUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} aria-hidden />
          In YouTube Music öffnen
        </a>
      </div>
    </div>
  );
}

interface ExportDialogProps {
  playlist: Playlist;
  entries: Song[];
  status: YoutubeStatus;
  onClose: () => void;
  onFindMissing: () => void;
}

function ExportDialog({ playlist, entries, status, onClose, onFindMissing }: ExportDialogProps) {
  const queryClient = useQueryClient();
  const privacyId = useId();
  const [privacy, setPrivacy] = useState<YoutubePrivacy>('private');
  const [jobId, setJobId] = useState<string | null>(null);
  // Beim Öffnen festhalten: Nach dem Anlegen ist die Playlist verknüpft, der Dialog soll trotzdem
  // weiter vom Anlegen sprechen.
  const [linked] = useState(() => playlist.youtubePlaylistId !== null);

  const start = useMutation({
    mutationFn: () => api.youtube.startExport(playlist.id, privacy),
    onSuccess: (job) => setJobId(job.id),
  });

  const job = useQuery({
    queryKey: ['youtube', 'job', jobId],
    queryFn: () => api.youtube.job(jobId!),
    enabled: jobId !== null,
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 700 : false),
  });

  const finished = job.data !== undefined && job.data.status !== 'running';
  useEffect(() => {
    // Danach stimmen Verknüpfung, Zeitpunkt und Kontingent nicht mehr – neu laden.
    if (finished) void refreshData(queryClient);
  }, [finished, queryClient]);

  const withVideo = entries.filter((song) => youtubeIdOf(song) !== null).length;
  const missing = entries.length - withVideo;
  const unitsLeft = Math.max(0, status.quota.unitsLimit - status.quota.unitsUsed);
  const estimate = WRITE_COST * (linked ? 0 : withVideo + 1);
  const running = start.isPending || (jobId !== null && !finished);

  let body;
  if (jobId === null || job.data === undefined) {
    body = (
      <>
        {linked ? (
          <p>
            Die Playlist auf YouTube wird an den Stand hier angepasst: Fehlende Songs werden ergänzt, entfernte gelöscht und
            die Reihenfolge übernommen. Auch Videos, die du auf YouTube von Hand hinzugefügt hast, werden dort entfernt.
          </p>
        ) : (
          <>
            <p>
              Die App legt in deinem YouTube-Konto die Playlist „{playlist.name}“ an. Sie erscheint auch in YouTube Music
              in der Bibliothek.
            </p>
            <Field label="Sichtbarkeit" htmlFor={privacyId} hint={PRIVACY_OPTIONS.find((option) => option.value === privacy)?.hint}>
              <select
                id={privacyId}
                className="input"
                value={privacy}
                onChange={(event) => setPrivacy(event.target.value as YoutubePrivacy)}
              >
                {PRIVACY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        <p className="field-hint">
          {withVideo === entries.length
            ? `Alle ${formatSongCount(entries.length)} haben einen YouTube-Link.`
            : `${withVideo} von ${formatSongCount(entries.length)} haben einen YouTube-Link; ${missing === 1 ? 'einer fehlt' : `${missing} fehlen`} auf YouTube.`}
        </p>
        {missing > 0 && (
          <div>
            <button type="button" className="button button-small" onClick={onFindMissing}>
              <Search size={14} aria-hidden />
              Fehlende Videos suchen
            </button>
          </div>
        )}
        <p className="field-hint">
          {linked
            ? `Jede Änderung kostet ${WRITE_COST} Einheiten des YouTube-Tageskontingents (heute noch etwa ${unitsLeft.toLocaleString('de-DE')} frei).`
            : `Das kostet etwa ${estimate.toLocaleString('de-DE')} Einheiten des YouTube-Tageskontingents (heute noch etwa ${unitsLeft.toLocaleString('de-DE')} frei).`}
        </p>
        {start.isError && (
          <p className="form-error" role="alert">
            {errorMessage(start.error)}
          </p>
        )}
      </>
    );
  } else if (job.data.status === 'running') {
    body = (
      <div className="job-progress" role="status">
        <ProgressBar value={job.data.done} max={Math.max(job.data.total, 1)} label="Übertragung" />
        <span>
          {job.data.total > 0 ? `${job.data.done} von ${job.data.total} Schritten …` : 'Wird vorbereitet …'}
        </span>
      </div>
    );
  } else if (job.data.status === 'failed') {
    body = (
      <p className="form-error" role="alert">
        {job.data.error?.message ?? 'Die Übertragung ist fehlgeschlagen.'}
        {job.data.error?.code === 'youtube_reconnect' && (
          <>
            {' '}
            <Link to="/youtube">Zur Seite „YouTube“</Link>
          </>
        )}
      </p>
    );
  } else {
    body = <JobSummary job={job.data} />;
  }

  return (
    <Modal
      title={linked ? 'Änderungen zu YouTube übertragen' : 'Playlist im YouTube-Konto anlegen'}
      onClose={onClose}
      footer={
        finished ? (
          <>
            {job.data?.status === 'failed' && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setJobId(null);
                  start.reset();
                }}
              >
                Zurück
              </button>
            )}
            <button type="button" className="button button-primary" onClick={onClose}>
              Fertig
            </button>
          </>
        ) : (
          <>
            <button type="button" className="button" onClick={onClose}>
              {running ? 'Im Hintergrund weiterlaufen lassen' : 'Abbrechen'}
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={running || withVideo === 0}
              onClick={() => start.mutate()}
            >
              {linked ? <RefreshCw size={16} aria-hidden /> : <CloudUpload size={16} aria-hidden />}
              {linked ? 'Übertragen' : 'Anlegen'}
            </button>
          </>
        )
      }
    >
      {body}
    </Modal>
  );
}

interface YoutubeExportProps {
  playlist: Playlist;
  /** Songs der Playlist in Reihenfolge */
  entries: Song[];
}

/** Abschnitt „In YouTube-Konto anlegen“ auf der Seite einer Playlist. */
export function YoutubeExport({ playlist, entries }: YoutubeExportProps) {
  const queryClient = useQueryClient();
  const status = useYoutubeStatus();
  const [dialog, setDialog] = useState<'export' | 'finder' | 'unlink' | null>(null);
  const unlink = useMutation({
    mutationFn: () => api.youtube.unlink(playlist.id),
    onSuccess: async () => {
      setDialog(null);
      await refreshData(queryClient);
    },
  });

  if (!status.data) return null;
  const youtube = status.data;

  if (!youtube.configured || !youtube.connected) {
    return (
      <p className="field-hint youtube-note">
        Mit deinem YouTube-Konto verbunden, legt die App die Playlist direkt dort an – und hält sie aktuell.{' '}
        <Link to="/youtube">YouTube verbinden</Link>
      </p>
    );
  }
  if (youtube.expired) {
    return (
      <p className="field-hint youtube-note">
        Die Verbindung zu YouTube ist abgelaufen. <Link to="/youtube">Neu verbinden</Link>
      </p>
    );
  }

  const links = playlist.youtubePlaylistId ? playlistLinks(playlist.youtubePlaylistId) : null;
  const missingSongs = entries.filter((song) => youtubeIdOf(song) === null);

  return (
    <div className="youtube-export">
      {links ? (
        <>
          <p className="youtube-export-status">
            <CircleCheck size={16} aria-hidden />
            In deinem YouTube-Konto angelegt
            {playlist.youtubeSyncedAt && ` · zuletzt übertragen am ${formatDateTime(playlist.youtubeSyncedAt)}`}
          </p>
          <div className="export-actions">
            <button type="button" className="button" onClick={() => setDialog('export')}>
              <RefreshCw size={16} aria-hidden />
              Änderungen übertragen
            </button>
            <a className="button" href={links.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} aria-hidden />
              Auf YouTube öffnen
            </a>
            <a className="button" href={links.musicUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} aria-hidden />
              In YouTube Music öffnen
            </a>
            <button type="button" className="link-button" onClick={() => setDialog('unlink')}>
              Verknüpfung lösen
            </button>
          </div>
        </>
      ) : (
        <div className="export-actions">
          <button type="button" className="button" onClick={() => setDialog('export')}>
            <CloudUpload size={16} aria-hidden />
            In YouTube-Konto anlegen
          </button>
        </div>
      )}

      {dialog === 'export' && (
        <ExportDialog
          playlist={playlist}
          entries={entries}
          status={youtube}
          onClose={() => setDialog(null)}
          onFindMissing={() => setDialog('finder')}
        />
      )}

      {dialog === 'finder' && (
        <Modal
          title="Fehlende YouTube-Links suchen"
          size="large"
          onClose={() => setDialog('export')}
          footer={
            <button type="button" className="button button-primary" onClick={() => setDialog('export')}>
              Zurück zur Übertragung
            </button>
          }
        >
          <YoutubeLinkFinder songs={missingSongs} status={youtube} />
        </Modal>
      )}

      {dialog === 'unlink' && (
        <ConfirmDialog
          title="Verknüpfung lösen?"
          confirmLabel="Verknüpfung lösen"
          busy={unlink.isPending}
          error={unlink.isError ? errorMessage(unlink.error) : null}
          onCancel={() => {
            unlink.reset();
            setDialog(null);
          }}
          onConfirm={() => unlink.mutate()}
        >
          Die Playlist auf YouTube bleibt erhalten, wird aber nicht mehr abgeglichen. Beim nächsten Übertragen legt die App
          eine neue an.
        </ConfirmDialog>
      )}
    </div>
  );
}

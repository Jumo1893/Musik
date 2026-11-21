import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Search } from 'lucide-react';
import { Link } from 'react-router';
import { api, errorMessage } from '../api.ts';
import { Artwork, ErrorNote, LoadingNote, PageHeader, ProgressBar } from '../components/ui.tsx';
import { useLibraryJob } from '../components/useLibraryJob.ts';
import { formatSongCount } from '../lib/format.ts';
import { refreshData, useById, useSongs } from '../queries.ts';
import type { ReleaseYearFinding } from '../types.ts';

/**
 * Einmalige Prüfung der Bibliothek: Bei welchen Songs kennt MusicBrainz ein früheres
 * Erscheinungsjahr (die Erstveröffentlichung statt einer Compilation oder Neuauflage)?
 * Übernommen wird einzeln oder für alle, erst auf Wunsch.
 */
export function ReleaseYearsPage() {
  const queryClient = useQueryClient();
  const songs = useSongs();
  const songsById = useById(songs.data);
  const { job, start, stop, forget } = useLibraryJob<ReleaseYearFinding>('release-years');
  const [applied, setApplied] = useState<ReadonlySet<number>>(new Set());

  const apply = useMutation({
    mutationFn: (findings: ReleaseYearFinding[]) =>
      api.songs.applyReleaseYears(findings.map((finding) => ({ songId: finding.songId, releaseYear: finding.firstReleaseYear }))),
    onSuccess: (_result, findings) => {
      setApplied((current) => new Set([...current, ...findings.map((finding) => finding.songId)]));
      return refreshData(queryClient);
    },
  });

  if (songs.isPending) return <LoadingNote label="Lade Songs …" />;
  if (songs.isError) return <ErrorNote error={songs.error} onRetry={() => void songs.refetch()} />;

  const running = job?.status === 'running';
  const findings = (job?.results ?? []).filter((finding) => songsById.has(finding.songId));
  const open = findings.filter((finding) => !applied.has(finding.songId));
  // MusicBrainz braucht je Song etwa zwei bis drei Anfragen, höchstens eine pro Sekunde.
  const minutes = Math.max(1, Math.round((songs.data.length * 2.5) / 60));

  return (
    <>
      <Link className="back-link" to="/auswertung">
        <ArrowLeft size={16} aria-hidden />
        Auswertung
      </Link>
      <PageHeader
        title="Erscheinungsjahre prüfen"
        subtitle="Stammt ein Jahr von einer Compilation oder Neuauflage, stimmen Jahrzehnte und der Jahr-Filter des Generators nicht."
      />

      <section className="card youtube-card" aria-labelledby="years-check">
        <h2 id="years-check">Mit MusicBrainz vergleichen</h2>
        {!job && (
          <>
            <p>
              Die App fragt bei MusicBrainz für jeden deiner {formatSongCount(songs.data.length)} nach dem Jahr der ersten
              Veröffentlichung (Single, EP oder Album; Sampler, Live- und Remix-Alben zählen nicht) und listet die Songs, bei
              denen MusicBrainz ein früheres Jahr kennt oder bei denen das Jahr fehlt.
            </p>
            <p className="field-hint">
              Gesendet werden Titel und Interpret. MusicBrainz erlaubt eine Anfrage pro Sekunde, das dauert hier etwa {minutes}{' '}
              {minutes === 1 ? 'Minute' : 'Minuten'} und läuft im Hintergrund weiter, auch wenn du die Seite verlässt. Geändert
              wird erst, was du übernimmst.
            </p>
            {start.isError && (
              <p className="form-error" role="alert">
                {errorMessage(start.error)}
              </p>
            )}
            <div className="export-actions">
              <button
                type="button"
                className="button button-primary"
                disabled={start.isPending || songs.data.length === 0}
                onClick={() => start.mutate()}
              >
                <Search size={16} aria-hidden />
                Erscheinungsjahre prüfen
              </button>
            </div>
          </>
        )}

        {job && (
          <div className="finder">
            {running && (
              <div className="finder-progress" role="status">
                <ProgressBar value={job.done} max={job.total} label="Fortschritt" />
                <span>
                  {job.done} von {formatSongCount(job.total)} geprüft · {findings.length}{' '}
                  {findings.length === 1 ? 'früheres Jahr' : 'frühere Jahre'} gefunden
                </span>
                <button type="button" className="button button-small" onClick={stop}>
                  Anhalten
                </button>
              </div>
            )}
            {job.error && (
              <p className="form-error" role="alert">
                {job.error}
              </p>
            )}
            {!running && findings.length === 0 && (
              <p className="field-hint" role="status">
                {job.status === 'cancelled' ? 'Angehalten. ' : ''}Bei keinem der {formatSongCount(job.done)} kennt MusicBrainz
                ein früheres Jahr.
              </p>
            )}
            {findings.length > 0 && (
              <ul className="finder-list">
                {findings.map((finding) => {
                  const song = songsById.get(finding.songId)!;
                  const done = applied.has(finding.songId);
                  return (
                    <li key={finding.songId} className={`finder-row year-row ${done ? 'finder-row-accepted' : ''}`}>
                      <div className="finder-song">
                        <Artwork url={song.artworkUrl} size={40} />
                        <span className="finder-text">
                          <span className="song-title-text">{song.title}</span>
                          <span className="song-sub">{[song.artist, song.album].filter(Boolean).join(' · ')}</span>
                        </span>
                      </div>
                      <span className="year-change">
                        <span className={finding.currentYear === null ? 'muted' : ''}>{finding.currentYear ?? 'ohne Jahr'}</span>
                        <ArrowRight size={14} aria-label="wird zu" />
                        <strong>{finding.firstReleaseYear}</strong>
                        <a href={finding.sourceUrl} target="_blank" rel="noopener noreferrer" className="year-source">
                          MusicBrainz
                        </a>
                      </span>
                      {done ? (
                        <span className="form-success year-done">
                          <Check size={14} aria-hidden /> übernommen
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="button button-small"
                          disabled={apply.isPending}
                          onClick={() => apply.mutate([finding])}
                        >
                          Übernehmen
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {apply.isError && (
              <p className="form-error" role="alert">
                {errorMessage(apply.error)}
              </p>
            )}
            {!running && (
              <div className="finder-footer">
                <span className="field-hint">
                  Ein Klick auf „MusicBrainz“ zeigt die Aufnahme samt ihrer Veröffentlichungen.
                </span>
                <button type="button" className="button" onClick={forget}>
                  {open.length > 0 ? 'Verwerfen' : 'Fertig'}
                </button>
                {open.length > 0 && (
                  <button type="button" className="button button-primary" disabled={apply.isPending} onClick={() => apply.mutate(open)}>
                    {open.length === 1 ? 'Übernehmen' : `Alle ${open.length} übernehmen`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}

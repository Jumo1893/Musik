import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Sparkles } from 'lucide-react';
import { api, ApiError, errorMessage } from '../api.ts';
import { formatDuration, formatSongCount } from '../lib/format.ts';
import { youtubeVideoUrl } from '../lib/links.ts';
import { refreshData } from '../queries.ts';
import type { LibraryJob, Song, YoutubeLinkFinding, YoutubeSearchResult, YoutubeStatus } from '../types.ts';
import { Artwork, ProgressBar } from './ui.tsx';

/** So viele Songs werden höchstens in einem Durchgang über YouTube gesucht. */
const BATCH_LIMIT = 30;
/** So oft wird der Fortschritt eines Auftrags abgefragt. */
const POLL_MS = 1500;
const JOB_KIND = 'youtube-links';

const SOURCES: Record<YoutubeLinkFinding['source'], string> = { wikidata: 'Wikidata', musicbrainz: 'MusicBrainz' };

interface Proposal {
  song: Song;
  results: YoutubeSearchResult[];
  /** Gewählter Treffer */
  choice: string | null;
  accepted: boolean;
  /** Die Suche für diesen Song ist fehlgeschlagen. */
  error: string | null;
  /** Quelle eines Funds ohne Konto, z. B. „Wikidata“ */
  source: string | null;
}

function durationDifference(song: Song, video: YoutubeSearchResult | null): string {
  if (!video || song.durationSeconds === null || video.durationSeconds === null) return '';
  const difference = video.durationSeconds - song.durationSeconds;
  if (Math.abs(difference) <= 3) return '';
  return ` (${difference > 0 ? '+' : '−'}${formatDuration(Math.abs(difference))})`;
}

/** Funde eines Auftrags als vorausgewählte Vorschläge, nur für Songs, die noch keinen Link haben. */
function proposalsFromFindings(findings: readonly YoutubeLinkFinding[], songs: readonly Song[]): Proposal[] {
  const byId = new Map(songs.map((song) => [song.id, song]));
  return findings.flatMap((finding) => {
    const song = byId.get(finding.songId);
    if (!song) return [];
    const video: YoutubeSearchResult = {
      videoId: finding.videoId,
      title: finding.videoTitle,
      channelTitle: finding.channel,
      durationSeconds: null,
      thumbnailUrl: finding.thumbnailUrl,
      score: 0,
      recommended: true,
    };
    return [{ song, results: [video], choice: finding.videoId, accepted: true, error: null, source: SOURCES[finding.source] }];
  });
}

function ProposalRow({ proposal, onChange }: { proposal: Proposal; onChange: (update: Partial<Proposal>) => void }) {
  const { song, results } = proposal;
  const chosen = results.find((result) => result.videoId === proposal.choice) ?? null;
  return (
    <li className={`finder-row ${proposal.accepted ? 'finder-row-accepted' : ''}`}>
      <input
        type="checkbox"
        className="finder-check"
        checked={proposal.accepted}
        disabled={!chosen}
        aria-label={`Video für „${song.title}“ übernehmen`}
        onChange={(event) => onChange({ accepted: event.target.checked })}
      />
      <div className="finder-song">
        <Artwork url={song.artworkUrl} size={40} />
        <span className="finder-text">
          <span className="song-title-text">{song.title}</span>
          <span className="song-sub">
            {song.artist} · {formatDuration(song.durationSeconds)}
          </span>
        </span>
      </div>
      <div className="finder-choice">
        {chosen ? (
          <>
            <a
              className="finder-video"
              href={youtubeVideoUrl(chosen.videoId)}
              target="_blank"
              rel="noopener noreferrer"
              title="Video auf YouTube ansehen"
            >
              <Artwork url={chosen.thumbnailUrl} size={40} />
              <span className="finder-text">
                <span className="finder-video-title">{chosen.title}</span>
                <span className="song-sub">
                  {chosen.channelTitle ?? 'Unbekannter Kanal'}
                  {chosen.durationSeconds !== null && ` · ${formatDuration(chosen.durationSeconds)}`}
                  {durationDifference(song, chosen)}
                  {proposal.source && ` · gefunden über ${proposal.source}`}
                </span>
              </span>
            </a>
            {results.length > 1 && (
              <select
                className="input finder-select"
                value={chosen.videoId}
                aria-label={`Anderen Treffer für „${song.title}“ wählen`}
                onChange={(event) => onChange({ choice: event.target.value, accepted: true })}
              >
                {results.map((result) => (
                  <option key={result.videoId} value={result.videoId}>
                    {result.title} – {result.channelTitle ?? '?'} ({formatDuration(result.durationSeconds)})
                  </option>
                ))}
              </select>
            )}
          </>
        ) : proposal.error ? (
          <span className="field-error">{proposal.error}</span>
        ) : (
          <span className="muted">Nichts gefunden</span>
        )}
      </div>
    </li>
  );
}

interface YoutubeLinkFinderProps {
  /** Songs ohne YouTube-Link */
  songs: Song[];
  /** Mit verbundenem Konto lässt sich zusätzlich auf YouTube selbst suchen. */
  status: YoutubeStatus | null;
}

/**
 * Findet YouTube-Links für Songs ohne Link und lässt die Vorschläge vor dem Speichern prüfen.
 * Ohne Konto: Ein Auftrag im Hintergrund fragt Wikidata und MusicBrainz. Mit verbundenem Konto
 * zusätzlich die YouTube-Suche (kostet Kontingent). Gute Treffer sind vorausgewählt.
 */
export function YoutubeLinkFinder({ songs, status }: YoutubeLinkFinderProps) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<'idle' | 'auto' | 'searching' | 'review' | 'saved'>('idle');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  /** Auftrag „Fehlende YouTube-Links ergänzen“, dessen Funde gerade gezeigt werden */
  const [jobId, setJobId] = useState<string | null>(null);
  const cancelled = useRef(false);

  // Läuft schon ein Auftrag oder wartet einer auf Prüfung (etwa nach dem Verlassen der Seite), geht es dort weiter.
  const latest = useQuery({
    queryKey: ['jobs', JOB_KIND, 'latest'],
    queryFn: () => api.jobs.latest<YoutubeLinkFinding>(JOB_KIND),
    staleTime: 0,
  });
  useEffect(() => {
    const running = latest.data?.job;
    if (running && phase === 'idle' && jobId === null) {
      setJobId(running.id);
      setPhase('auto');
    }
  }, [latest.data, phase, jobId]);

  const job = useQuery({
    queryKey: ['jobs', jobId],
    queryFn: () => api.jobs.get<YoutubeLinkFinding>(jobId!),
    enabled: jobId !== null && phase === 'auto',
    refetchInterval: (query) => (query.state.data?.status === 'running' ? POLL_MS : false),
    retry: false,
  });
  useEffect(() => {
    const data: LibraryJob<YoutubeLinkFinding> | undefined = job.data;
    if (phase !== 'auto' || !data || data.status === 'running') return;
    setProposals(proposalsFromFindings(data.results, songs));
    setTotal(data.total);
    setError(data.status === 'failed' ? data.error : null);
    setPhase('review');
  }, [job.data, phase, songs]);
  useEffect(() => {
    // Den Auftrag gibt es nicht mehr (etwa nach einem Neustart der App).
    if (phase === 'auto' && job.isError) {
      setJobId(null);
      setPhase('idle');
    }
  }, [job.isError, phase]);

  const startJob = useMutation({
    mutationFn: () => api.jobs.start<YoutubeLinkFinding>(JOB_KIND),
    onSuccess: (started) => {
      queryClient.setQueryData(['jobs', started.id], started);
      setJobId(started.id);
      setError(null);
      save.reset();
      setPhase('auto');
    },
  });

  /** Vergisst den Auftrag, dessen Funde gespeichert oder verworfen wurden. */
  function forgetJob() {
    if (jobId) void api.jobs.remove(jobId).catch(() => undefined);
    setJobId(null);
    queryClient.setQueryData(['jobs', JOB_KIND, 'latest'], { job: null });
  }

  const save = useMutation({
    mutationFn: api.youtube.saveLinks,
    onSuccess: async ({ updated }) => {
      setSavedCount(updated);
      setPhase('saved');
      forgetJob();
      await refreshData(queryClient);
    },
  });

  const connected = Boolean(status?.configured && status.connected && !status.expired);
  const searchesLeft = status ? Math.max(0, status.quota.searchesLimit - status.quota.searchesUsed) : 0;
  const batchSize = Math.min(songs.length, searchesLeft, BATCH_LIMIT);

  async function run() {
    const batch = songs.slice(0, batchSize);
    cancelled.current = false;
    setPhase('searching');
    setProposals([]);
    setTotal(batch.length);
    setError(null);
    save.reset();

    for (const song of batch) {
      if (cancelled.current) break;
      try {
        const results = await api.youtube.search({
          q: `${song.artist} ${song.title}`,
          title: song.title,
          artist: song.artist,
          duration: song.durationSeconds,
        });
        const best = results[0] ?? null;
        setProposals((list) => [
          ...list,
          { song, results, choice: best?.videoId ?? null, accepted: Boolean(best?.recommended), error: null, source: null },
        ]);
      } catch (err) {
        // Kontingent erschöpft oder Verbindung weg: Weitersuchen hätte keinen Sinn.
        if (err instanceof ApiError && err.code?.startsWith('youtube_')) {
          setError(errorMessage(err));
          break;
        }
        setProposals((list) => [...list, { song, results: [], choice: null, accepted: false, error: errorMessage(err), source: null }]);
      }
    }
    setPhase('review');
    void queryClient.invalidateQueries({ queryKey: ['youtube', 'status'] });
  }

  function update(index: number, change: Partial<Proposal>) {
    setProposals((list) => list.map((proposal, i) => (i === index ? { ...proposal, ...change } : proposal)));
  }

  const accepted = proposals.filter((proposal) => proposal.accepted && proposal.choice !== null);
  const fromJob = jobId !== null;

  if (phase === 'idle' || phase === 'saved') {
    return (
      <div className="finder">
        {phase === 'saved' && (
          <p className="form-success" role="status">
            {savedCount === 1 ? 'Ein Link ist gespeichert.' : `${savedCount} Links sind gespeichert.`}
          </p>
        )}
        {songs.length === 0 ? (
          <p className="field-hint">Alle Songs haben einen YouTube-Link.</p>
        ) : (
          <>
            <p>
              {songs.length === 1 ? 'Ein Song hat' : `${formatSongCount(songs.length)} haben`} noch keinen YouTube-Link.
            </p>
            <p className="field-hint">
              „Fehlende YouTube-Links ergänzen“ fragt Wikidata und MusicBrainz – ohne YouTube-Konto und ohne Kontingent.
              Das läuft im Hintergrund, du kannst die Seite währenddessen verlassen. Gespeichert wird erst, was du bestätigst.
            </p>
            {startJob.isError && (
              <p className="form-error" role="alert">
                {errorMessage(startJob.error)}
              </p>
            )}
            <div className="export-actions">
              <button type="button" className="button button-primary" disabled={startJob.isPending} onClick={() => startJob.mutate()}>
                <Sparkles size={16} aria-hidden />
                Fehlende YouTube-Links ergänzen
              </button>
              {connected && (
                <button type="button" className="button" disabled={batchSize === 0} onClick={() => void run()}>
                  <Search size={16} aria-hidden />
                  {batchSize === 1 ? 'Auf YouTube suchen' : `Auf YouTube suchen (${batchSize} Songs)`}
                </button>
              )}
            </div>
            {connected && status && (
              <p className="field-hint">
                Die Suche auf YouTube findet mehr, kostet aber je Song eine Suche; YouTube erlaubt {status.quota.searchesLimit} am
                Tag, heute sind noch {searchesLeft} frei.
                {batchSize < songs.length && batchSize > 0 && ` Gesucht werden die ersten ${batchSize}.`}
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  const runningJob = phase === 'auto' ? job.data : undefined;

  return (
    <div className="finder">
      {phase === 'auto' && (
        <div className="finder-progress" role="status">
          <ProgressBar value={runningJob?.done ?? 0} max={runningJob?.total ?? 1} label="Fortschritt" />
          <span>
            {runningJob
              ? `${runningJob.done} von ${formatSongCount(runningJob.total)} geprüft · ${runningJob.results.length} ${runningJob.results.length === 1 ? 'Link' : 'Links'} gefunden`
              : 'Starte …'}
          </span>
          <button
            type="button"
            className="button button-small"
            disabled={!jobId}
            onClick={() => {
              if (jobId) void api.jobs.remove(jobId).then(() => job.refetch());
            }}
          >
            Anhalten
          </button>
        </div>
      )}
      {phase === 'searching' && (
        <div className="finder-progress" role="status">
          <ProgressBar value={proposals.length} max={total} label="Suchfortschritt" />
          <span>
            Suche {Math.min(proposals.length + 1, total)} von {total} …
          </span>
          <button type="button" className="button button-small" onClick={() => (cancelled.current = true)}>
            Abbrechen
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {phase === 'review' && fromJob && proposals.length === 0 && (
        <p className="field-hint" role="status">
          Wikidata und MusicBrainz kennen für {total === 1 ? 'diesen Song' : `diese ${formatSongCount(total)}`} kein passendes
          Video.{connected && ' Mit „Auf YouTube suchen“ lässt sich noch die YouTube-Suche fragen.'}
        </p>
      )}
      {proposals.length > 0 && (
        <ul className="finder-list">
          {proposals.map((proposal, index) => (
            <ProposalRow key={proposal.song.id} proposal={proposal} onChange={(change) => update(index, change)} />
          ))}
        </ul>
      )}
      {phase === 'review' && (
        <div className="finder-footer">
          <span className="field-hint">
            {fromJob
              ? 'Gefunden bei Wikidata und MusicBrainz und bei YouTube geprüft. Ein Klick auf das Video öffnet es zur Kontrolle.'
              : 'Vorausgewählt sind Treffer, bei denen Titel, Interpret und Dauer passen. Ein Klick auf das Video öffnet es zur Kontrolle.'}
          </span>
          {save.isError && (
            <p className="form-error" role="alert">
              {errorMessage(save.error)}
            </p>
          )}
          <button
            type="button"
            className="button"
            onClick={() => {
              forgetJob();
              setPhase('idle');
            }}
          >
            Verwerfen
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={accepted.length === 0 || save.isPending}
            onClick={() => save.mutate(accepted.map((proposal) => ({ songId: proposal.song.id, videoId: proposal.choice! })))}
          >
            {accepted.length === 1 ? 'Einen Link speichern' : `${accepted.length} Links speichern`}
          </button>
        </div>
      )}
    </div>
  );
}

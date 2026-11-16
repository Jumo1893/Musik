import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api, ApiError, errorMessage } from '../api.ts';
import { formatDuration, formatSongCount } from '../lib/format.ts';
import { youtubeVideoUrl } from '../lib/links.ts';
import { refreshData } from '../queries.ts';
import type { Song, YoutubeSearchResult, YoutubeStatus } from '../types.ts';
import { Artwork, ProgressBar } from './ui.tsx';

/** So viele Songs werden höchstens in einem Durchgang gesucht. */
const BATCH_LIMIT = 30;

interface Proposal {
  song: Song;
  results: YoutubeSearchResult[];
  /** Gewählter Treffer */
  choice: string | null;
  accepted: boolean;
  /** Die Suche für diesen Song ist fehlgeschlagen. */
  error: string | null;
}

function durationDifference(song: Song, video: YoutubeSearchResult | null): string {
  if (!video || song.durationSeconds === null || video.durationSeconds === null) return '';
  const difference = video.durationSeconds - song.durationSeconds;
  if (Math.abs(difference) <= 3) return '';
  return ` (${difference > 0 ? '+' : '−'}${formatDuration(Math.abs(difference))})`;
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
                  {chosen.channelTitle ?? 'Unbekannter Kanal'} · {formatDuration(chosen.durationSeconds)}
                  {durationDifference(song, chosen)}
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
  status: YoutubeStatus;
}

/**
 * Sucht für Songs ohne YouTube-Link passende Videos und lässt die Vorschläge vor dem
 * Speichern prüfen. Gute Treffer (Titel, Interpret und Dauer passen) sind vorausgewählt.
 */
export function YoutubeLinkFinder({ songs, status }: YoutubeLinkFinderProps) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<'idle' | 'searching' | 'review' | 'saved'>('idle');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const cancelled = useRef(false);

  const save = useMutation({
    mutationFn: api.youtube.saveLinks,
    onSuccess: async ({ updated }) => {
      setSavedCount(updated);
      setPhase('saved');
      await refreshData(queryClient);
    },
  });

  const searchesLeft = Math.max(0, status.quota.searchesLimit - status.quota.searchesUsed);
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
          { song, results, choice: best?.videoId ?? null, accepted: Boolean(best?.recommended), error: null },
        ]);
      } catch (err) {
        // Kontingent erschöpft oder Verbindung weg: Weitersuchen hätte keinen Sinn.
        if (err instanceof ApiError && err.code?.startsWith('youtube_')) {
          setError(errorMessage(err));
          break;
        }
        setProposals((list) => [...list, { song, results: [], choice: null, accepted: false, error: errorMessage(err) }]);
      }
    }
    setPhase('review');
    void queryClient.invalidateQueries({ queryKey: ['youtube', 'status'] });
  }

  function update(index: number, change: Partial<Proposal>) {
    setProposals((list) => list.map((proposal, i) => (i === index ? { ...proposal, ...change } : proposal)));
  }

  const accepted = proposals.filter((proposal) => proposal.accepted && proposal.choice !== null);

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
              Jeder Song kostet eine Suche; YouTube erlaubt {status.quota.searchesLimit} am Tag, heute sind noch{' '}
              {searchesLeft} frei.
              {batchSize < songs.length && batchSize > 0 && ` Gesucht werden die ersten ${batchSize}.`}
            </p>
            <div className="export-actions">
              <button type="button" className="button button-primary" disabled={batchSize === 0} onClick={() => void run()}>
                <Search size={16} aria-hidden />
                {batchSize === 1 ? 'Video suchen' : `Videos für ${batchSize} Songs suchen`}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="finder">
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
            Vorausgewählt sind Treffer, bei denen Titel, Interpret und Dauer passen. Ein Klick auf das Video öffnet es
            zur Kontrolle.
          </span>
          {save.isError && (
            <p className="form-error" role="alert">
              {errorMessage(save.error)}
            </p>
          )}
          <button type="button" className="button" onClick={() => setPhase('idle')}>
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

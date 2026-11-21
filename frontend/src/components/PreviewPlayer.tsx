// Reinhören im Song-Dialog: die 30-Sekunden-Hörprobe von Apple oder der eingebettete
// YouTube-Player. Abgespielt wird direkt von Apple bzw. YouTube, nichts wird gespeichert.
// Es läuft immer nur eine Hörprobe; eine neue hält die alte an.

import { useState, useSyncExternalStore } from 'react';
import { Pause, Play, X } from 'lucide-react';
import { api, errorMessage } from '../api.ts';

let audio: HTMLAudioElement | null = null;
let playing: string | null = null;
const listeners = new Set<() => void>();

function setPlaying(url: string | null) {
  playing = url;
  for (const listener of listeners) listener();
}

function player(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'none';
    audio.addEventListener('ended', () => setPlaying(null));
    audio.addEventListener('error', () => setPlaying(null));
  }
  return audio;
}

/** Spielt eine Hörprobe ab; läuft sie schon, hält ein zweiter Aufruf sie an. */
export function togglePreview(url: string): void {
  if (playing === url) {
    stopPreview();
    return;
  }
  const element = player();
  element.src = url;
  setPlaying(url);
  element.play().catch(() => {
    if (playing === url) setPlaying(null);
  });
}

/** Hält die laufende Hörprobe an (etwa beim Schließen des Dialogs). */
export function stopPreview(): void {
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
  }
  if (playing !== null) setPlaying(null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Adresse der Hörprobe, die gerade läuft. */
function usePlayingPreview(): string | null {
  return useSyncExternalStore(subscribe, () => playing);
}

interface PreviewButtonProps {
  /** Hörprobe; fehlt sie, holt `appleMusicUrl` sie beim ersten Klick über die Track-ID. */
  url: string | null;
  appleMusicUrl?: string | null;
  /** Für Screenreader, z. B. „Hurt von Johnny Cash“ */
  label: string;
  compact?: boolean;
}

/** Knopf zum Anhören der Hörprobe von Apple. */
export function PreviewButton({ url, appleMusicUrl, label, compact = false }: PreviewButtonProps) {
  const current = usePlayingPreview();
  const [resolved, setResolved] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'missing' | 'error'>('idle');
  const previewUrl = url ?? resolved;
  const active = previewUrl !== null && current === previewUrl;

  async function click() {
    if (previewUrl) {
      togglePreview(previewUrl);
      return;
    }
    if (!appleMusicUrl) return;
    setState('loading');
    try {
      const found = await api.lookupLink(appleMusicUrl);
      const preview = found.kind === 'apple' ? found.result.previewUrl : null;
      if (!preview) {
        setState('missing');
        return;
      }
      setResolved(preview);
      setState('idle');
      togglePreview(preview);
    } catch (err) {
      console.warn('Hörprobe nicht gefunden:', errorMessage(err));
      setState('error');
    }
  }

  const title =
    state === 'missing'
      ? 'Für diesen Song gibt es bei Apple keine Hörprobe.'
      : state === 'error'
        ? 'Die Hörprobe ließ sich gerade nicht laden.'
        : active
          ? 'Hörprobe anhalten'
          : 'Hörprobe von Apple Music anhören (30 Sekunden)';
  return (
    <button
      type="button"
      className={`preview-button ${compact ? 'preview-button-compact' : ''} ${active ? 'preview-button-active' : ''}`}
      aria-label={`${active ? 'Hörprobe anhalten' : 'Hörprobe anhören'}: ${label}`}
      aria-pressed={active}
      title={title}
      disabled={state === 'loading' || state === 'missing'}
      onClick={(event) => {
        // In der Trefferliste soll der Klick nicht den Treffer übernehmen.
        event.stopPropagation();
        void click();
      }}
    >
      {active ? <Pause size={compact ? 14 : 16} aria-hidden /> : <Play size={compact ? 14 : 16} aria-hidden />}
      {!compact && (state === 'loading' ? 'Lade …' : state === 'missing' ? 'Keine Hörprobe' : active ? 'Anhalten' : 'Anhören')}
    </button>
  );
}

/**
 * Datensparsamer YouTube-Player (youtube-nocookie.com) in einem einklappbaren Bereich. Weil die
 * App sonst keinen Referrer schickt, braucht der Player ihn hier ausdrücklich (sonst „Error 153“);
 * YouTube erfährt dabei nur die Adresse der App, nicht die Seite.
 */
export function YoutubeEmbed({ videoId, title, onClose }: { videoId: string; title: string; onClose: () => void }) {
  return (
    <div className="youtube-embed">
      <div className="youtube-embed-head">
        <span className="field-hint">Abgespielt von youtube-nocookie.com</span>
        <button type="button" className="icon-button" aria-label="Player schließen" onClick={onClose}>
          <X size={16} aria-hidden />
        </button>
      </div>
      <iframe
        className="youtube-embed-frame"
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`}
        title={`YouTube-Video: ${title}`}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

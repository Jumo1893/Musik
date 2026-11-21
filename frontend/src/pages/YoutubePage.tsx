import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, LogIn, ThumbsUp, TriangleAlert, TvMinimalPlay } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { api, errorMessage } from '../api.ts';
import { MeterList } from '../components/charts.tsx';
import { ConfirmDialog } from '../components/Modal.tsx';
import { Artwork, ErrorNote, LoadingNote, PageHeader } from '../components/ui.tsx';
import { YoutubeLinkFinder } from '../components/YoutubeLinkFinder.tsx';
import { formatDate, formatTime } from '../lib/format.ts';
import { youtubeIdOf } from '../lib/links.ts';
import { refreshData, useSongs, useYoutubePlaylists, useYoutubeStatus } from '../queries.ts';
import type { YoutubeStatus } from '../types.ts';

/** Meldungen nach dem Rücksprung von Google (?verbunden=1 oder ?fehler=…). */
const CALLBACK_ERRORS: Record<string, string> = {
  abgebrochen: 'Du hast die Anmeldung bei Google abgebrochen – es wurde nichts verbunden.',
  sitzung:
    'Die Anmeldung hat zu lange gedauert oder wurde in einem anderen Tab gestartet. Bitte noch einmal auf „Mit YouTube verbinden“ klicken.',
  berechtigung:
    'Google hat der App den Zugriff auf YouTube nicht erlaubt. Bitte erneut verbinden und auf der Zustimmungsseite den Zugriff auf YouTube erlauben.',
  'kein-token':
    'Google hat keinen dauerhaften Zugang ausgestellt. Entferne den Zugriff der App unter myaccount.google.com/permissions und verbinde neu.',
  anmeldung:
    'Die Anmeldung bei Google ist fehlgeschlagen. Stimmen YOUTUBE_CLIENT_ID und YOUTUBE_CLIENT_SECRET in der .env?',
  google: 'Google hat die Anmeldung mit einem Fehler beendet. Bitte noch einmal versuchen.',
  'nicht-eingerichtet': 'Die YouTube-Anbindung ist noch nicht eingerichtet – die Anleitung steht unten.',
};

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <div className="input-with-action">
      <input className="input copy-input" readOnly value={value} aria-label={label} onFocus={(event) => event.target.select()} />
      <button
        type="button"
        className="button"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(value)
            .then(() => setCopied(true))
            .catch(() => undefined);
        }}
      >
        {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
        {copied ? 'Kopiert' : 'Kopieren'}
      </button>
    </div>
  );
}

function SetupGuide({ status }: { status: YoutubeStatus }) {
  return (
    <div className="setup">
      <p>
        Damit die App in deinem YouTube-Konto Playlists anlegen und lesen darf, braucht sie eigene Zugangsdaten von Google.
        Das ist einmalig und kostenlos, dauert etwa zehn Minuten und geschieht in der{' '}
        <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">
          Google Cloud Console
        </a>
        . Die Menüpunkte heißen dort je nach Spracheinstellung auf Englisch oder Deutsch ähnlich.
      </p>
      <ol className="setup-steps">
        <li>
          Ein Projekt anlegen, z. B. „Musik“. Unter <strong>APIs &amp; Services → Library</strong> die{' '}
          <strong>YouTube Data API v3</strong> suchen und aktivieren (<strong>Enable</strong>).
        </li>
        <li>
          Unter <strong>Google Auth Platform</strong> auf <strong>Get started</strong>: einen App-Namen (z. B. „Musik“) und
          deine E-Mail-Adresse eintragen, als Zielgruppe <strong>External</strong> wählen, die Richtlinie bestätigen.
        </li>
        <li>
          Unter <strong>Audience → Test users</strong> deine eigene Google-Adresse hinzufügen.
        </li>
        <li>
          Unter <strong>Clients → Create client</strong> den Typ <strong>Web application</strong> wählen und bei{' '}
          <strong>Authorized redirect URIs</strong> genau diese Adresse eintragen:
          <CopyField value={status.redirectUri} label="Rücksprungadresse" />
        </li>
        <li>
          Client-ID und Client-Secret in die Datei <code>.env</code> im Projektordner eintragen (Vorlage:{' '}
          <code>.env.example</code>). Das Secret zeigt Google nur direkt nach dem Anlegen vollständig an.
          <pre className="code-block">{'YOUTUBE_CLIENT_ID=…\nYOUTUBE_CLIENT_SECRET=…'}</pre>
        </li>
        <li>
          Die App neu starten: <code>podman compose up -d</code>. Danach erscheint hier „Mit YouTube verbinden“.
        </li>
      </ol>
      <p className="field-hint">
        Solange die App bei Google im Status „Testing“ ist, läuft die Verbindung nach 7 Tagen ab und muss erneuert werden.
        Wer das nicht möchte, veröffentlicht sie unter <strong>Audience → Publish app</strong>; beim Verbinden zeigt Google
        dann einen Hinweis, dass die App nicht überprüft ist. Für die eigene Nutzung lässt er sich bestätigen.
      </p>
    </div>
  );
}

function ConnectionCard({ status }: { status: YoutubeStatus }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const disconnect = useMutation({
    mutationFn: api.youtube.disconnect,
    onSuccess: async () => {
      setConfirming(false);
      queryClient.removeQueries({ queryKey: ['youtube', 'playlists'] });
      await refreshData(queryClient);
    },
  });

  if (!status.configured) {
    return (
      <section className="card youtube-card" aria-labelledby="youtube-setup">
        <h2 id="youtube-setup">Einrichten</h2>
        <SetupGuide status={status} />
      </section>
    );
  }

  if (!status.connected || status.expired) {
    return (
      <section className="card youtube-card" aria-labelledby="youtube-connect">
        <h2 id="youtube-connect">{status.expired ? 'Verbindung abgelaufen' : 'Verbinden'}</h2>
        {status.expired ? (
          <p className="warning-note">
            <TriangleAlert size={16} aria-hidden />
            Google nimmt den gespeicherten Zugang nicht mehr an – bei Apps im Status „Testing“ passiert das nach 7 Tagen.
            Einmal neu verbinden, dann geht es weiter.
          </p>
        ) : (
          <p>
            Melde dich bei Google an und erlaube der App, dein YouTube-Konto zu verwalten. Sie legt dort nur Playlists an,
            die du selbst überträgst, und liest deine Playlists, wenn du sie übernehmen willst.
          </p>
        )}
        <div className="export-actions">
          <a className="button button-primary" href="/api/youtube/connect">
            <LogIn size={16} aria-hidden />
            {status.expired ? 'Neu verbinden' : 'Mit YouTube verbinden'}
          </a>
        </div>
        <p className="field-hint">
          Google zeigt dabei einen Hinweis, dass die App nicht von Google überprüft wurde. Bei einer selbst eingerichteten
          App ist das normal; du kannst ihn bestätigen. Verbinden klappt nur auf dem Rechner, auf dem die App läuft.
        </p>
      </section>
    );
  }

  const quota = status.quota;
  return (
    <section className="card youtube-card" aria-labelledby="youtube-connected">
      <h2 id="youtube-connected">Verbunden</h2>
      <div className="channel">
        <Artwork url={status.channel?.thumbnailUrl ?? null} size={48} />
        <div>
          <div className="channel-title">{status.channel?.title ?? 'Google-Konto ohne YouTube-Kanal'}</div>
          <div className="song-sub">
            {status.connectedAt ? `Verbunden seit ${formatDate(status.connectedAt)}` : 'Verbunden'}
          </div>
        </div>
        <button type="button" className="button button-danger-quiet channel-action" onClick={() => setConfirming(true)}>
          Verbindung trennen
        </button>
      </div>
      {!status.channel && (
        <p className="warning-note">
          <TriangleAlert size={16} aria-hidden />
          Zu diesem Google-Konto gibt es noch keinen YouTube-Kanal. Ohne Kanal lassen sich keine Playlists anlegen – auf
          youtube.com über das Profilbild „Kanal erstellen“.
        </p>
      )}
      <div className="quota">
        <h3>Kontingent heute</h3>
        <MeterList
          rows={[
            { key: 'units', label: 'Einheiten', value: quota.unitsUsed, total: quota.unitsLimit },
            { key: 'searches', label: 'Suchen', value: quota.searchesUsed, total: quota.searchesLimit },
          ]}
        />
        <p className="field-hint">
          Schätzung der App. Lesen kostet 1 Einheit, Anlegen und Ändern 50 Einheiten je Song; Suchen zählen extra. Um{' '}
          {formatTime(quota.resetsAt)} Uhr fängt der Tag bei Google neu an.
        </p>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Verbindung trennen?"
          confirmLabel="Trennen"
          busy={disconnect.isPending}
          error={disconnect.isError ? errorMessage(disconnect.error) : null}
          onCancel={() => {
            disconnect.reset();
            setConfirming(false);
          }}
          onConfirm={() => disconnect.mutate()}
        >
          Die App gibt ihren Zugang zu deinem YouTube-Konto zurück. Playlists, die sie dort angelegt hat, bleiben erhalten.
        </ConfirmDialog>
      )}
    </section>
  );
}

function PlaylistsCard() {
  const playlists = useYoutubePlaylists(true);
  return (
    <section className="card youtube-card" aria-labelledby="youtube-import">
      <h2 id="youtube-import">Playlists übernehmen</h2>
      <p className="field-hint">
        Übernimm eine deiner YouTube-Playlists: Die Videos werden zu Songs (vorhandene werden erkannt und verknüpft), auf
        Wunsch als Playlist in der App.
      </p>
      {playlists.isPending ? (
        <LoadingNote label="Lade deine Playlists …" />
      ) : playlists.isError ? (
        <ErrorNote error={playlists.error} onRetry={() => void playlists.refetch()} />
      ) : (
        <ul className="playlist-grid youtube-playlists">
          <li>
            <Link className="card playlist-card" to="/youtube/playlists/mag-ich">
              <span className="mosaic mosaic-empty" aria-hidden>
                <ThumbsUp size={28} />
              </span>
              <span className="playlist-card-text">
                <span className="playlist-card-name">Mag ich</span>
                <span className="playlist-card-meta">Videos, die du mit „Mag ich“ markiert hast</span>
              </span>
            </Link>
          </li>
          {playlists.data.map((playlist) => (
            <li key={playlist.id}>
              <Link className="card playlist-card" to={`/youtube/playlists/${playlist.id}`}>
                <span className={`mosaic ${playlist.thumbnailUrl ? '' : 'mosaic-empty'}`} aria-hidden>
                  {playlist.thumbnailUrl ? (
                    <img src={playlist.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <TvMinimalPlay size={28} />
                  )}
                </span>
                <span className="playlist-card-text">
                  <span className="playlist-card-name">{playlist.title}</span>
                  <span className="playlist-card-meta">
                    {playlist.itemCount === null ? '' : `${playlist.itemCount.toLocaleString('de-DE')} Videos · `}
                    {playlist.privacyStatus === 'private'
                      ? 'privat'
                      : playlist.privacyStatus === 'unlisted'
                        ? 'nicht gelistet'
                        : 'öffentlich'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LinksCard({ status }: { status: YoutubeStatus }) {
  const songs = useSongs();
  const missing = (songs.data ?? []).filter((song) => youtubeIdOf(song) === null);
  return (
    <section className="card youtube-card" aria-labelledby="youtube-links">
      <h2 id="youtube-links">Fehlende YouTube-Links</h2>
      {songs.isPending ? <LoadingNote label="Lade Songs …" /> : <YoutubeLinkFinder songs={missing} status={status} />}
    </section>
  );
}

export function YoutubePage() {
  const status = useYoutubeStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Ergebnis der Anmeldung einmal anzeigen und aus der Adresse entfernen.
  useEffect(() => {
    const error = searchParams.get('fehler');
    if (searchParams.get('verbunden')) {
      setNotice({ kind: 'success', text: 'Die App ist jetzt mit deinem YouTube-Konto verbunden.' });
    } else if (error) {
      setNotice({ kind: 'error', text: CALLBACK_ERRORS[error] ?? CALLBACK_ERRORS.google! });
    } else {
      return;
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const ready = status.data?.configured && status.data.connected && !status.data.expired;

  return (
    <>
      <PageHeader
        title="YouTube"
        subtitle="Verbinde dein YouTube-Konto, um Playlists dort anzulegen, deine YouTube-Playlists zu übernehmen und fehlende Links zu finden."
      />
      {notice && (
        <p className={notice.kind === 'success' ? 'success-note' : 'error-note'} role={notice.kind === 'success' ? 'status' : 'alert'}>
          {notice.text}
        </p>
      )}
      {status.isPending ? (
        <LoadingNote label="Prüfe die Verbindung …" />
      ) : status.isError ? (
        <ErrorNote error={status.error} onRetry={() => void status.refetch()} />
      ) : (
        <div className="youtube-layout">
          <ConnectionCard status={status.data} />
          {/* Fehlende Links lassen sich auch ohne verbundenes Konto ergänzen (Wikidata, MusicBrainz). */}
          <LinksCard status={status.data} />
          {ready && <PlaylistsCard />}
          {ready && (
            <p className="field-hint youtube-note">
              Eine Playlist aus der App überträgst du auf ihrer Seite mit „In YouTube-Konto anlegen“.
            </p>
          )}
        </div>
      )}
    </>
  );
}

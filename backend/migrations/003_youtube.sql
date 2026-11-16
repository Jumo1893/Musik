-- Anbindung an ein YouTube-Konto.

-- Die Verbindung zu YouTube. Die App hat nur einen Nutzer, deshalb gibt es höchstens eine Zeile.
CREATE TABLE youtube_account (
    id                      smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    refresh_token           text        NOT NULL,
    access_token            text,
    access_token_expires_at timestamptz,
    scope                   text        NOT NULL,
    channel_id              text,
    channel_title           text,
    channel_thumbnail_url   text,
    connected_at            timestamptz NOT NULL DEFAULT now(),
    -- Gesetzt, sobald Google den Zugang nicht mehr annimmt (abgelaufen oder widerrufen).
    expired_at              timestamptz
);

-- Geschätzter Verbrauch des Tageskontingents. Google rechnet in Tagen pazifischer Zeit:
-- 10.000 Einheiten für die meisten Aufrufe und getrennt davon 100 Suchanfragen.
CREATE TABLE youtube_quota_usage (
    day      date    PRIMARY KEY,
    units    integer NOT NULL DEFAULT 0,
    searches integer NOT NULL DEFAULT 0
);

-- Playlists, die aus der App auf YouTube angelegt wurden, merken sich ihr Gegenstück.
ALTER TABLE playlists
    ADD COLUMN youtube_playlist_id text,
    ADD COLUMN youtube_synced_at   timestamptz;

CREATE UNIQUE INDEX playlists_unique_youtube_playlist
    ON playlists (youtube_playlist_id)
    WHERE youtube_playlist_id IS NOT NULL;

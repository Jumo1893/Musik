-- Grundschema der Musik-Bibliothek.
-- Es werden ausschließlich Metadaten und Links gespeichert, niemals Audiodateien.

CREATE TABLE songs (
    id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title             text        NOT NULL CHECK (length(btrim(title)) > 0),
    artist            text        NOT NULL CHECK (length(btrim(artist)) > 0),
    album             text,
    duration_seconds  integer     CHECK (duration_seconds BETWEEN 1 AND 86399),
    release_year      smallint    CHECK (release_year BETWEEN 1000 AND 2200),
    genre             text,
    bpm               smallint    CHECK (bpm BETWEEN 20 AND 400),
    -- Energie und Bewertung sind bewusst grobe Skalen von 1 bis 5.
    energy            smallint    CHECK (energy BETWEEN 1 AND 5),
    rating            smallint    CHECK (rating BETWEEN 1 AND 5),
    notes             text,
    apple_music_url   text,
    youtube_url       text,
    youtube_music_url text,
    artwork_url       text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Derselbe Titel desselben Interpreten darf nur einmal pro Album vorkommen
-- (Groß-/Kleinschreibung spielt keine Rolle).
CREATE UNIQUE INDEX songs_unique_track
    ON songs (lower(title), lower(artist), lower(coalesce(album, '')));

CREATE TABLE categories (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text        NOT NULL CHECK (length(btrim(name)) > 0),
    color       text        NOT NULL DEFAULT '#2a78d6' CHECK (color ~ '^#[0-9a-f]{6}$'),
    description text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX categories_unique_name ON categories (lower(name));

CREATE TABLE song_categories (
    song_id     integer NOT NULL REFERENCES songs (id) ON DELETE CASCADE,
    category_id integer NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    PRIMARY KEY (song_id, category_id)
);

CREATE INDEX song_categories_category_idx ON song_categories (category_id);

CREATE TABLE playlists (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text        NOT NULL CHECK (length(btrim(name)) > 0),
    description text,
    -- Kriterien, mit denen die Playlist erzeugt wurde (NULL bei von Hand angelegten Playlists).
    criteria    jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE playlist_songs (
    playlist_id integer NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
    song_id     integer NOT NULL REFERENCES songs (id) ON DELETE CASCADE,
    position    integer NOT NULL CHECK (position > 0),
    PRIMARY KEY (playlist_id, song_id),
    CONSTRAINT playlist_songs_unique_position UNIQUE (playlist_id, position)
);

CREATE INDEX playlist_songs_song_idx ON playlist_songs (song_id);

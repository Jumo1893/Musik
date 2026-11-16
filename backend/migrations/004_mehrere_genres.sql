-- Ein Song kann mehrere Genres haben. Aus dem bisherigen Einzelfeld wird eine Liste;
-- ein vorhandenes Genre wird ihr erster (und einziger) Eintrag, es geht also nichts verloren.

ALTER TABLE songs
    ADD COLUMN genres text[] NOT NULL DEFAULT '{}'
    CONSTRAINT songs_genres_ohne_null CHECK (array_position(genres, NULL) IS NULL);

UPDATE songs
   SET genres = ARRAY[btrim(genre)]
 WHERE genre IS NOT NULL
   AND btrim(genre) <> '';

ALTER TABLE songs DROP COLUMN genre;

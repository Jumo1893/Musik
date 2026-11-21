-- Sprache, in der ein Song gesungen wird: „Deutsch“, „Englisch“, „Instrumental“ (ohne Gesang)
-- oder eine andere Sprache als Freitext. NULL heißt: keine Angabe.

ALTER TABLE songs ADD COLUMN language text CHECK (length(btrim(language)) BETWEEN 1 AND 50);

-- Merkliste: Songs, die man unterwegs in Sekunden vormerkt („Interpret – Titel“ oder ein Link)
-- und später in Ruhe erfasst. Vorgemerkte Einträge sind keine Songs: Sie erscheinen nicht in
-- Songliste, Auswertung und Generator.

CREATE TABLE merkliste (
    id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    text       text        NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 2000),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX merkliste_created_idx ON merkliste (created_at);

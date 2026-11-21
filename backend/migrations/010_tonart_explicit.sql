-- Tonart (laut songbpm.com, z. B. „A“ oder „C♯/D♭“) und ob der Text als explizit gilt
-- (laut iTunes: ja, nein; NULL heißt unbekannt). Bestehende Songs haben noch keine Angabe.

ALTER TABLE songs
    ADD COLUMN musical_key text CHECK (length(btrim(musical_key)) BETWEEN 1 AND 20),
    ADD COLUMN explicit boolean;

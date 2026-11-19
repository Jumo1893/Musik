-- Mitsingen: wie stark man bei einem Song mitsingen möchte, als grobe Skala von 1 bis 5
-- wie Energie und Bewertung. Bestehende Songs haben noch keine Angabe.

ALTER TABLE songs ADD COLUMN sing_along smallint CHECK (sing_along BETWEEN 1 AND 5);

-- Weitere Kategorien als Startpunkt: Stimmungen und Anlässe, für die man gern eine
-- Playlist hätte. Wie die ersten acht lassen sie sich in der App frei umbenennen,
-- umfärben oder löschen. Gibt es schon eine Kategorie gleichen Namens, bleibt sie, wie sie ist.

INSERT INTO categories (name, color, description) VALUES
    ('verträumt',    '#e87ba4', 'Zum Abschweifen und Tagträumen'),
    ('nostalgisch',  '#eda100', 'Weckt Erinnerungen an früher'),
    ('episch',       '#6250d6', 'Groß, hymnisch, Gänsehaut'),
    ('motivierend',  '#008300', 'Macht Mut und gibt Kraft'),
    ('wütend',       '#e34948', 'Zum Dampf ablassen'),
    ('gemütlich',    '#eb6834', 'Für kalte Abende auf dem Sofa'),
    ('Sport',        '#eb6834', 'Zum Laufen, Radfahren und Trainieren'),
    ('Roadtrip',     '#2a78d6', 'Für lange Autofahrten'),
    ('Sommer',       '#eda100', 'Sonne, Wärme, Urlaubsgefühl'),
    ('Mitsingen',    '#e34948', 'Laut mitsingen, der Text sitzt'),
    ('Aufwachen',    '#1baf7a', 'Für einen guten Start in den Tag'),
    ('Einschlafen',  '#6250d6', 'Leise und sanft zum Einschlafen')
ON CONFLICT DO NOTHING;

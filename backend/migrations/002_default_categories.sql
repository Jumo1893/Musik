-- Ein paar Kategorien als Startpunkt. Sie lassen sich in der App frei umbenennen,
-- umfärben oder löschen.

INSERT INTO categories (name, color, description) VALUES
    ('melancholisch', '#2a78d6', 'Ruhig, traurig, sehnsüchtig'),
    ('aufpushend',    '#eb6834', 'Treibt an und macht wach'),
    ('entspannt',     '#1baf7a', 'Zum Runterkommen'),
    ('fröhlich',      '#eda100', 'Gute Laune'),
    ('romantisch',    '#e87ba4', 'Für zu zweit'),
    ('Fokus',         '#008300', 'Zum konzentrierten Arbeiten'),
    ('nachdenklich',  '#6250d6', 'Zum Zuhören und Grübeln'),
    ('Party',         '#e34948', 'Zum Tanzen und Feiern')
ON CONFLICT DO NOTHING;

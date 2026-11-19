-- Kurze Liste je Hauptgenre: Die Genre-Auswahl im Song-Dialog zeigt unter einem aufgeklappten
-- Hauptgenre zuerst nur bekannte Untergenres (5 bis 25 je Hauptgenre); die übrigen der
-- Genre-Liste kommen mit „Mehr anzeigen“ dazu.
--
-- Die Auswahl gilt je Hauptgenre und Untergenre: Synth-Pop steht bei Pop und bei Electronic
-- vorn, Emo Rap nur bei Hip-Hop, obwohl er laut Liste auch zu Electronic und Rock gehört.
-- Hauptgenres mit wenigen Untergenres (Sonstige, Bühne & Film, Religiöse Musik) zeigen alle.

ALTER TABLE genre_parents ADD COLUMN featured boolean NOT NULL DEFAULT false;

CREATE TEMPORARY TABLE featured_list (main text NOT NULL, genres text[] NOT NULL) ON COMMIT DROP;

INSERT INTO featured_list (main, genres) VALUES
    ('Pop', ARRAY[
        'Alternative Pop', 'Art Pop', 'Bedroom Pop', 'Britpop', 'Chanson', 'Dance-Pop', 'Deutschpop',
        'Disco', 'Dream Pop', 'Electropop', 'Europop', 'Hyperpop', 'Indie Pop', 'J-Pop', 'K-Pop',
        'Latin Pop', 'Pop Rap', 'Pop Rock', 'Pop Soul', 'Pop-Punk', 'Power Pop', 'Schlager',
        'Soft Rock', 'Synth-Pop']),
    ('Rock', ARRAY[
        'Alternative Rock', 'Blues Rock', 'Classic Rock', 'Death Metal', 'Emo', 'Folk Rock',
        'Garage Rock', 'Glam Rock', 'Grunge', 'Hard Rock', 'Heavy Metal', 'Indie Rock', 'Metalcore',
        'Neue Deutsche Härte', 'New Wave', 'Nu Metal', 'Pop Rock', 'Pop-Punk', 'Post-Punk',
        'Progressive Rock', 'Psychedelic Rock', 'Punk Rock', 'Rock and Roll', 'Soft Rock',
        'Thrash Metal']),
    ('Hip-Hop', ARRAY[
        'Alternative Hip-Hop', 'Boom Bap', 'Classic Hip-Hop', 'Cloud Rap', 'Conscious Hip-Hop',
        'Deutschrap', 'Drill', 'East Coast Hip-Hop', 'Emo Rap', 'G-Funk', 'Gangsta Rap',
        'Hardcore Hip-Hop', 'Jazz Rap', 'Lofi Hip-Hop', 'Pop Rap', 'Southern Hip-Hop', 'Trap',
        'Trip Hop', 'Underground Hip-Hop', 'West Coast Hip-Hop']),
    ('Electronic', ARRAY[
        'Ambient', 'Breakbeat', 'Chill-Out', 'Deep House', 'Downtempo', 'Drum and Bass', 'Dubstep',
        'EDM', 'Electro', 'Electronica', 'Electropop', 'Eurodance', 'Future Bass', 'Hardstyle',
        'House', 'Intelligent Dance Music (IDM)', 'Neue Deutsche Welle', 'Progressive House',
        'Synth-Pop', 'Synthwave', 'Tech House', 'Techno', 'Trance', 'Trip Hop', 'Tropical House']),
    ('R&B & Soul', ARRAY[
        'Alternative R&B', 'Blue-Eyed Soul', 'Contemporary R&B', 'Disco', 'Doo-Wop', 'Funk', 'Gospel',
        'Neo Soul', 'New Jack Swing', 'Northern Soul', 'Psychedelic Soul', 'Quiet Storm', 'Retro-Soul',
        'Rhythm and Blues', 'Soul']),
    ('Jazz', ARRAY[
        'Acid Jazz', 'Bebop', 'Big Band', 'Bossa Nova', 'Cool Jazz', 'Dixieland', 'Free Jazz',
        'Gypsy Jazz', 'Hard Bop', 'Jazz Fusion', 'Jazz-Funk', 'Latin Jazz', 'Modal Jazz', 'Nu Jazz',
        'Smooth Jazz', 'Soul Jazz', 'Swing', 'Vocal Jazz']),
    ('Blues', ARRAY[
        'Blues Rock', 'Boogie-Woogie', 'British Blues', 'Chicago Blues', 'Country Blues', 'Delta Blues',
        'Desert Blues', 'Electric Blues', 'Jazz Blues', 'Jump Blues', 'Rhythm and Blues', 'Soul Blues',
        'Swamp Blues', 'Texas Blues']),
    ('Country', ARRAY[
        'Alternative Country', 'Americana', 'Bluegrass', 'Bro-Country', 'Classic Country',
        'Country Folk', 'Country Pop', 'Country Rap', 'Country Rock', 'Honky Tonk', 'Nashville Sound',
        'Neotraditional Country', 'Outlaw Country', 'Rockabilly', 'Western Swing']),
    ('Folk', ARRAY[
        'American Folk Revival', 'Americana', 'Anti-Folk', 'Celtic Music', 'Fado', 'Folk Metal',
        'Folk Pop', 'Folk Punk', 'Folk Rock', 'Freak Folk', 'Indie Folk', 'Neofolk', 'Polka',
        'Protest Song', 'Psychedelic Folk', 'Singer-Songwriter', 'Volkstümliche Musik']),
    ('Latin', ARRAY[
        'Bachata', 'Bolero', 'Bossa Nova', 'Calypso', 'Cha-Cha-Chá', 'Cumbia', 'Flamenco',
        'Latin Hip-Hop', 'Latin Pop', 'Latin Rock', 'Latin Trap', 'Mambo', 'Mariachi', 'Merengue',
        'Música Popular Brasileira', 'Reggaeton', 'Salsa', 'Samba', 'Tango', 'Urbano']),
    ('Reggae', ARRAY[
        'Dancehall', 'Dub', 'Lovers Rock', 'Mento', 'Ragga', 'Reggae Fusion', 'Reggae Rock',
        'Reggaeton', 'Rocksteady', 'Roots Reggae', 'Ska', 'Ska Punk']),
    ('Klassik', ARRAY[
        'Baroque Music', 'Classical Crossover', 'Classical Period', 'Contemporary Classical Music',
        'Early Music', 'Impressionism', 'Indian Classical Music', 'Minimal Music', 'Modernism',
        'Neoclassicism', 'Opera', 'Renaissance Music', 'Romantic Music']),
    ('Weltmusik', ARRAY[
        'Afrobeat', 'Afrobeats', 'Amapiano', 'Arabic Music', 'Balkan Brass', 'Balkan Music', 'Bhangra',
        'Filmi', 'Gamelan', 'Gypsy Music', 'Highlife', 'Kizomba', 'Klezmer', 'Raï', 'Soukous']),
    ('Avantgarde & Experimental', ARRAY[
        'Avant-Garde Jazz', 'Avant-Garde Metal', 'Drone', 'Experimental Electronic',
        'Experimental Hip-Hop', 'Experimental Rock', 'Industrial', 'Instrumental', 'Lo-Fi',
        'Musique Concrète', 'Noise', 'Psychedelic Music']),
    ('Religiöse Musik', ARRAY[
        'Buddhist Music', 'Christian Music', 'Hindu Music', 'Islamic Music', 'Jewish Music',
        'Neopagan Music', 'Rastafarian Music', 'Shinto Music', 'Sikh Music', 'Taoist Music',
        'Zoroastrian Music']),
    ('Bühne & Film', ARRAY[
        'Incidental Music', 'Musical Theatre', 'Opera', 'Soundtrack', 'Video Game Music']),
    ('Sonstige', ARRAY[
        'A Cappella', 'Barbershop Music', 'Children''s Music', 'Christmas Music',
        'Collegiate a Cappella', 'Comedy']);

-- Jeder Eintrag muss ein Untergenre seines Hauptgenres sein, sonst bricht die Migration ab.
DO $$
DECLARE
    missing text;
BEGIN
    SELECT string_agg(f.main || ' / ' || t.genre, ', ')
      INTO missing
      FROM featured_list f
     CROSS JOIN LATERAL unnest(f.genres) AS t(genre)
     WHERE NOT EXISTS (
         SELECT 1
           FROM genre_parents p
           JOIN genres g ON g.id = p.genre_id
           JOIN genres m ON m.id = p.main_genre_id
          WHERE g.name = t.genre
            AND m.name = f.main
            AND m.is_main);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Kurze Liste nennt Genres, die nicht zum Hauptgenre gehören: %', missing;
    END IF;
END
$$;

UPDATE genre_parents p
   SET featured = true
  FROM featured_list f
 CROSS JOIN LATERAL unnest(f.genres) AS t(genre)
  JOIN genres g ON g.name = t.genre
  JOIN genres m ON m.name = f.main AND m.is_main
 WHERE p.genre_id = g.id
   AND p.main_genre_id = m.id;

# Ideen als User Stories

Stand 20.11.2026 · Grundlage: Branch `feature/song-hinzufuegen` (Datenbank bis Migration 008 „Mitsingen“) · Die offenen Prüfpunkte zu A5, A9 und A10 sind geklärt, siehe [Prüfungen vom 20.11.2026](#prüfungen-vom-20112026).

Die Stories sind nach Bereichen gruppiert, der Schwerpunkt liegt auf **Song hinzufügen**. Jede Story hat eine Priorität (hoch / mittel / niedrig) und eine grobe Größe:

- **S**: ein überschaubarer Schritt, meist nur Oberfläche oder ein Endpunkt
- **M**: mehrere Teile (Oberfläche, API, eventuell Migration, Tests)
- **L**: eigener kleiner Arbeitsablauf mit Verarbeitung im Hintergrund

## Überblick

| ID | Story | Priorität | Größe |
|---|---|---|---|
| | **Song hinzufügen** | | |
| A1 | Dubletten schon bei der Suche erkennen | hoch | S |
| A2 | Eingaben beim Schließen nicht verlieren | hoch | S |
| A3 | Schnellerfassung: nach dem Treffer nur noch das Persönliche | hoch | M |
| A4 | Song per Link übernehmen | hoch | M |
| A5 | Links zu den anderen Plattformen automatisch ergänzen | hoch | M |
| A6 | Vorschläge aus ähnlichen Songs der Bibliothek | mittel | M |
| A7 | Erscheinungsjahr der Erstveröffentlichung | mittel | S |
| A8 | Bessere Trefferliste der Online-Suche | mittel | S–M |
| A9 | Reinhören im Dialog | mittel | M |
| A10 | Viele Songs auf einmal: Textliste oder CSV | mittel | L |
| A11 | Album oder Interpret durchgehen | mittel | M |
| A12 | Beim Anlegen direkt in Playlists legen | mittel | S |
| A13 | Merkliste für unterwegs | mittel | M |
| A14 | YouTube-Importe aus dem iTunes-Katalog vervollständigen | mittel | M |
| A15 | Tonart und „Explicit“ mitnehmen | niedrig | S |
| A16 | Sprache und „Instrumental“ | niedrig | S–M |
| A17 | Apple-Music-Playlist per Link übernehmen | mittel | M |
| | **Bibliothek pflegen** | | |
| B1 | Schnell nachpflegen, Song für Song | hoch | M |
| B2 | Kategorie „Mitsingen“ in die neue Skala überführen | hoch | S |
| B3 | Mehr Filter, Sortierungen und Spalten in der Songliste | mittel | M |
| B4 | Mehrere Songs auf einmal bearbeiten | mittel | M |
| B5 | Playlists eines Songs sehen, Song zu Playlist hinzufügen | mittel | S |
| | **Playlists und Generator** | | |
| C1 | Tempo (BPM) im Generator | mittel | S |
| C2 | Songs im Vorschlag festhalten | mittel | S |
| C3 | Mehr Abwechslung zwischen Playlists | mittel | S |
| C4 | Playlist ausgehend von einem Song | mittel | M |
| C5 | Playlist per Ziehen umsortieren | mittel | S |
| C6 | Energie- und Tempoverlauf einer Playlist | niedrig | S |
| C7 | Playlist auffrischen, Verknüpfung behalten | niedrig | S |
| C8 | Intelligente Playlists | niedrig | M–L |
| | **Kategorien, Auswertung, Betrieb** | | |
| D1 | Sicherung aus der App und automatisch | hoch | M |
| D2 | Kategorien gruppieren und sortieren | mittel | M |
| D3 | Kategorien zusammenführen | niedrig | S |
| D4 | Auswertung anklickbar | mittel | S |
| D5 | Nur neue „Mag ich“-Videos zeigen | niedrig | S |
| D6 | Zugriff aus dem Heimnetz absichern | niedrig | S |

## Empfohlene Reihenfolge

1. **Schnelle Gewinne:** A1, A2, B2, C1. Klein, sofort spürbar, keine neuen Online-Dienste.
2. **Song hinzufügen spürbar schneller:** A3, A4, A5. Zusammen ergeben sie den neuen Ablauf „Link einfügen oder suchen → Treffer prüfen → nur noch Kategorien und Skalen wählen → speichern“.
3. **Bibliothek vollständig machen:** B1 (vor allem für die Mitsingen-Angabe, die allen bisherigen Songs fehlt) und D1 als Sicherheitsnetz für die gepflegten Daten.
4. Danach nach Lust und Laune: A6, A10 mit A17, B3/B4, C2 bis C5.

## Für alle Stories

- **Online-Dienste:** Wie bei Tempo und Genres wird nur ein Treffer übernommen, bei dem Titel und Interpret passen (Regeln in `songMatching.ts`), und nur in leere Felder. Selbst eingetragene Werte bleiben. Jeder neue Dienst kommt in den README-Abschnitt „Was nach außen geht“. Fällt ein Dienst aus, funktioniert alles andere weiter.
- **Datenbank:** Neue Spalten oder Tabellen kommen als neue Migration; die nächste freie Nummer ist 009.
- **Tests:** API-Tests laufen nur gegen die Test-Datenbank des getrennten Stacks (`-p musiktest`, Port 5433), nie gegen die echte Bibliothek auf Port 8090.

---

## A · Song hinzufügen

### A1 · Dubletten schon bei der Suche erkennen

Priorität hoch · Größe S

> Als Nutzer möchte ich schon in der Trefferliste und beim Eintippen sehen, dass ein Song bereits in meiner Bibliothek ist, damit ich keine Dubletten anlege und nicht erst nach dem Ausfüllen eine Fehlermeldung bekomme.

**Heute:** Geprüft wird erst beim Speichern, und nur auf genau gleichen Titel, Interpreten und Album (`songs_unique_track`). „Hurt“ von der Single und „Hurt“ vom Album, oder „Hurt (Remastered)“, landen unbemerkt doppelt in der Bibliothek. Ein exaktes Duplikat fällt erst auf, wenn Kategorien und Bewertung schon gewählt sind.

**Akzeptanzkriterien**

1. In der Trefferliste der Online-Suche trägt jeder Treffer, der zu einem vorhandenen Song passt, den Hinweis „Schon in deiner Bibliothek“.
2. „Passt“ heißt: gleicher Interpret (ohne Gastinterpreten, „The“ egal) und gleicher Titel ohne Zusätze wie „feat.“, „Remastered“ oder „Radio Edit“. Das Album spielt keine Rolle. Ein Remix oder eine Live-Fassung gilt nicht als derselbe Song, wenn der vorhandene Song keiner ist.
3. Wird ein solcher Treffer gewählt, oder passen eingetippter Titel und Interpret beim Verlassen des Feldes zu einem vorhandenen Song, erscheint über dem Formular: „‚Hurt‘ von Johnny Cash hast du schon (American IV, hinzugefügt am 3. Mai 2026)“ mit den Knöpfen **„Vorhandenen Song öffnen“** und **„Trotzdem anlegen“**.
4. „Vorhandenen Song öffnen“ wechselt den Dialog zu „Song bearbeiten“ für diesen Song. Noch nicht gespeicherte Eingaben werden vorher abgefragt (siehe A2).
5. Beim Bearbeiten zählt der Song selbst nicht als Dublette.
6. Scheitert das Speichern trotzdem an einem exakten Duplikat (HTTP 409), nennt die Meldung den vorhandenen Song und bietet ebenfalls „Vorhandenen Song öffnen“ an.
7. Ist ein eingefügter YouTube- oder Apple-Music-Link schon an einem Song gespeichert, gilt das immer als Dublette.

**Hinweise zur Umsetzung**

- Alle Songs sind im Frontend schon geladen (`useSongs`). Die Prüfung kann ohne neuen Endpunkt im Browser laufen.
- Die Vergleichsregeln gibt es im Backend bereits (`simplify`, `coreTitle`, `artistScore`, `isOtherVersion` in `songMatching.ts`). Sie sollten ins Frontend gespiegelt oder in ein gemeinsames Modul gezogen werden, damit beide Seiten gleich urteilen.
- Die 409-Antwort könnte die ID des vorhandenen Songs mitliefern (`existingSongId`).

### A2 · Eingaben beim Schließen nicht verlieren

Priorität hoch · Größe S

> Als Nutzer möchte ich gewarnt werden, bevor ein Dialog mit ungespeicherten Eingaben zugeht, damit ein versehentliches Escape nicht meine ganze Einordnung löscht.

**Heute:** Escape, das X und „Abbrechen“ schließen den Song-Dialog sofort, auch wenn Kategorien, Skalen und Notizen schon ausgefüllt sind.

**Akzeptanzkriterien**

1. Weicht das Formular vom Ausgangszustand ab (neuer Song: leeres Formular; Bearbeiten: gespeicherter Stand), fragt Schließen per Escape, X oder „Abbrechen“ nach: „Änderungen verwerfen?“ mit **„Weiter bearbeiten“** (hat den Fokus) und **„Verwerfen“**.
2. Ohne Änderungen schließt der Dialog wie bisher sofort.
3. Nach „Speichern & weiterer Song“ gilt das frisch geleerte Formular als Ausgangszustand.
4. Ein übernommener Treffer der Online-Suche zählt als Änderung.

**Hinweise zur Umsetzung**

- `Modal` überlässt Escape schon dem Aufrufer (`onClose`). Der Song-Dialog braucht nur den Vergleich mit dem Ausgangszustand und den vorhandenen `ConfirmDialog`.
- Ausbaustufe: den Entwurf eines neuen Songs in `sessionStorage` halten und beim nächsten Öffnen „Entwurf von eben fortsetzen?“ anbieten.

### A3 · Schnellerfassung: nach dem Treffer nur noch das Persönliche

Priorität hoch · Größe M

> Als Nutzer möchte ich nach der Übernahme eines Treffers nur noch ausfüllen, was nur ich wissen kann (Kategorien, Bewertung, Energie, Mitsingen), damit ein Song in unter einer halben Minute erfasst ist.

**Heute:** Nach dem Klick auf einen Treffer stehen Titel, Interpret, Album, Genres, Dauer, Jahr und Tempo fertig im Formular. Für die eigentliche Einordnung muss man an diesen Feldern vorbei nach unten scrollen; Links, Cover und Notizen folgen danach. Der Dialog ist lang, auf kleinen Bildschirmen erst recht.

**Akzeptanzkriterien**

1. Nach der Übernahme eines Treffers (oder eines Links, A4) fasst eine **Karte** die Angaben zusammen: Cover, Titel, Interpret · Album · Jahr, Dauer, Tempo, Genres als Chips und die Plattform-Links als Symbole (vorhanden oder fehlt). Laufende Abfragen (Tempo, Genres, Links) zeigen sich dort als kleiner Hinweis „sucht …“.
2. Der Knopf **„Angaben bearbeiten“** klappt die Felder auf. Felder mit Fehlern sind immer aufgeklappt.
3. Direkt unter der Karte folgen Kategorien, Bewertung, Energie und Mitsingen. Notizen sowie „Links & Cover“ sind eingeklappt und zeigen eingeklappt, was fehlt („YouTube-Link fehlt“).
4. Wer ohne Treffer von Hand einträgt, sieht das vollständige Formular wie heute. Beim Bearbeiten eines vorhandenen Songs bleibt es ebenfalls beim vollständigen Formular.
5. Tastatur: **Strg+Enter** speichert, **Strg+Umschalt+Enter** speichert und öffnet den nächsten Song. Die Kürzel stehen im Tooltip der Knöpfe.
6. Auf schmalen Bildschirmen (Handy) passen Karte und Skalen ohne seitliches Scrollen.

**Hinweise zur Umsetzung**

- Betrifft nur `SongFormDialog.tsx` und das Stylesheet; Daten und API bleiben gleich.
- Passt gut zu A6: Die Vorschläge erscheinen genau in dem Bereich, der jetzt im Mittelpunkt steht.

### A4 · Song per Link übernehmen

Priorität hoch · Größe M

> Als Nutzer möchte ich einen Link aus Apple Music, YouTube oder YouTube Music in das Suchfeld einfügen, damit der Song ohne Tippen erkannt wird, so wie ich Songs ohnehin über „Teilen → Link kopieren“ weitergebe.

**Akzeptanzkriterien**

1. Das Suchfeld oben im Dialog erkennt einen eingefügten Link von selbst; ein eigener Knopf ist nicht nötig.
2. **Apple Music** (`music.apple.com/…/album/…?i=<Track-ID>` oder `…/song/…/<Track-ID>`): Die App holt den Song über die Track-ID aus dem iTunes-Katalog und übernimmt ihn wie einen Treffer der Suche. Gespeichert wird der bereinigte Link.
3. **YouTube und YouTube Music** (`youtube.com/watch?v=…`, `youtu.be/…`, `music.youtube.com/watch?v=…`, auch mit `&list=…` oder `&t=…`): Die App liest Videotitel und Kanal, zerlegt den Titel wie beim YouTube-Import in Interpret und Titel und sucht damit im iTunes-Katalog. Der beste passende Treffer wird vorgeschlagen („Ist es dieser?“), die übrigen stehen darunter. Der YouTube-Link kommt in jedem Fall ins YouTube-Feld, ohne Playlist- und Zeitangabe.
4. Findet der Katalog nichts Passendes, werden Titel und Interpret aus dem Video eingetragen und zum Prüfen markiert.
5. Ein Album- oder Playlist-Link ohne einzelnen Song führt zu einem verständlichen Hinweis (später zu A11 bzw. A10).
6. Unbekannter Link: „Diesen Link kenne ich nicht. Es funktionieren Links von Apple Music, YouTube und YouTube Music.“
7. Die Dublettenprüfung aus A1 greift auch hier.

**Hinweise zur Umsetzung**

- Neuer Endpunkt, etwa `GET /api/lookup/link?url=…`.
- Apple: `https://itunes.apple.com/lookup?id=<Track-ID>&country=<ITUNES_COUNTRY>` antwortet in derselben Form wie die Suche; `mapItunesTrack` passt.
- YouTube ohne Konto und ohne Kontingent: oEmbed (`https://www.youtube.com/oembed?url=…&format=json`) liefert Titel und Kanal. Mit verbundenem Konto ginge auch `videos.list` (1 Einheit), das zusätzlich die Dauer liefert.
- Titel zerlegen: `youtubeText.ts`; Video-ID: `youtubeIds.ts` bzw. `extractYoutubeId` im Frontend.
- README „Was nach außen geht“ um oEmbed ergänzen.

### A5 · Links zu den anderen Plattformen automatisch ergänzen

Priorität hoch · Größe M

> Als Nutzer möchte ich, dass beim Anlegen eines Songs der YouTube-Link automatisch gefunden wird (er gilt auch für YouTube Music), damit ich nicht für jeden Song einzeln suchen und Links kopieren muss, auch ohne YouTube-Konto und ohne Tageskontingent.

**Heute:** Ein Treffer der Online-Suche bringt nur den Apple-Music-Link mit. Für YouTube sucht man selbst oder verbraucht mit verbundenem Konto eine der 100 Suchen pro Tag.

**Geprüft am 20.11.2026:** Der ursprünglich geplante Dienst song.link (Odesli) fällt aus. Seine offene Schnittstelle ist seit dem 31.07.2026 abgeschaltet; eine Anfrage ohne Schlüssel endet mit `401 PUBLIC_API_ACCESS_DEPRECATED`. Neue Schlüssel vergibt der Anbieter nicht mehr, nur „bei berechtigtem, dauerhaftem Bedarf“ eine Freischaltung auf Antrag. Stattdessen kommen diese Quellen in Frage, getestet mit sechs bekannten Songs (Hurt, Mr. Brightside, Atemlos durch die Nacht, Blinding Lights, Was du Liebe nennst, Wonderwall):

| Quelle | Art | Ergebnis im Test | Grenzen |
|---|---|---|---|
| Wikidata, Eigenschaft P1651 „YouTube-Video-ID“ | offiziell, ohne Schlüssel | 4 von 6 mit gültigem offiziellem Musikvideo; 1 ID zeigte auf ein gelöschtes Video | nur Songs mit eigenem Wikidata-Eintrag, also vor allem Hits |
| MusicBrainz, Links „free streaming“ an der Aufnahme | offiziell, ohne Schlüssel, 1 Anfrage pro Sekunde | 2 von 6 (Musikvideo, offizielles Audio, auch music.youtube.com) | lückenhaft, aber eine gute Ergänzung: Wikidata und MusicBrainz zusammen fanden für alle 6 einen gültigen Link |
| Suche von YouTube Music (interne Schnittstelle `youtubei/v1/search`) | inoffiziell, ohne Schlüssel und Konto | Treffer 1 war genau der gesuchte Song: „Hurt · Johnny Cash · American IV · 3:37“ (offizieller Audio-Track) | keine öffentliche Schnittstelle, kann sich jederzeit ändern; automatisierter Zugriff ist in den YouTube-Nutzungsbedingungen nicht vorgesehen |
| YouTube-Suche der App (Data API) | offiziell, nur mit verbundenem Konto | wie heute | 100 Suchen pro Tag |

**Akzeptanzkriterien**

1. Sobald Titel und Interpret feststehen (Treffer übernommen oder eingetippt) und das YouTube-Feld leer ist, sucht die App einen YouTube-Link in dieser Reihenfolge: Wikidata, MusicBrainz, YouTube-Music-Suche. Die erste Quelle mit einem passenden, gültigen Treffer gewinnt.
2. Bei Wikidata und MusicBrainz muss der Eintrag zu Titel und Interpret passen (Regeln aus `songMatching.ts`). Bei der YouTube-Music-Suche muss zusätzlich die Dauer passen (höchstens 5 Sekunden Abweichung, wenn die Dauer bekannt ist), und Remixe oder Live-Fassungen zählen nur, wenn genau so eine gesucht ist.
3. Jede gefundene Video-ID wird vor dem Übernehmen kurz geprüft (oEmbed); gelöschte oder private Videos werden übersprungen.
4. Gefüllt wird nur ein leeres YouTube-Feld. Unter dem Feld steht die Quelle („gefunden über Wikidata“, „… über YouTube Music“) mit Link zum Video. Ein selbst eingetragener Link wird nie ersetzt.
5. Findet keine Quelle etwas, bleibt das Feld leer, und der „Suchen“-Knopf funktioniert wie heute (mit Konto: Suche in der App).
6. Für vorhandene Songs ohne YouTube-Link gibt es auf der Seite „YouTube“ die Aktion **„Fehlende YouTube-Links ergänzen“**. Sie läuft im Hintergrund mit Fortschritt; die Funde landen in der vorhandenen Prüfliste von „Links suchen“ und werden erst nach Bestätigung gespeichert.
7. Die inoffizielle YouTube-Music-Suche lässt sich abschalten (etwa `YOUTUBE_MUSIC_SEARCH=off` in der `.env`); dann gelten nur die offiziellen Quellen.
8. Fällt eine Quelle aus, geht es mit der nächsten weiter; alles andere funktioniert wie bisher.

**Hinweise zur Umsetzung**

- **Wikidata:** eine SPARQL-Abfrage an `https://query.wikidata.org/sparql`: Song mit `rdfs:label` = Titel (deutsch oder englisch), Interpret über `wdt:P175`, dazu `wdt:P1651`. Braucht einen aussagekräftigen User-Agent. Liefert meist das offizielle Musikvideo.
- **MusicBrainz:** Die Genre-Suche findet die Aufnahme ohnehin. Ihre Links holt eine zusätzliche Anfrage `recording/<MBID>?inc=url-rels` (Typ „free streaming“). Die vorhandene Warteschlange mit einer Anfrage pro Sekunde reicht.
- **YouTube Music:** `POST https://music.youtube.com/youtubei/v1/search` mit dem Client `WEB_REMIX` und dem Filter „Songs“ (so wie die Bibliothek ytmusicapi). Die Antwort enthält Titel, Interpret, Album, Dauer und Video-ID. Wie bei songbpm.com tolerant auswerten und bei Fehlern still aufgeben; eine Anfrage pro Song, im Hintergrund mit Pausen.
- **Prüfen der Video-ID:** `https://www.youtube.com/oembed?url=…&format=json` antwortet bei gelöschten Videos mit 404 (getestet).
- Der Gegenweg (YouTube-Link → Apple-Music-Link) braucht keinen weiteren Dienst: iTunes-Suche mit Titel und Interpret aus oEmbed (siehe A4 und A14).
- README „Was nach außen geht“ um Wikidata und YouTube Music ergänzen; gesendet werden Titel und Interpret.
- Nicht empfohlen: die weiterhin erreichbaren Seiten von song.link auszulesen. Der Anbieter hat den maschinellen Zugang bewusst beendet.

### A6 · Vorschläge aus ähnlichen Songs der Bibliothek

Priorität mittel · Größe M

> Als Nutzer möchte ich beim Einordnen Vorschläge für Kategorien, Energie und Mitsingen sehen, die sich aus meinen schon eingeordneten Songs ergeben, damit ich einheitlich einordne und weniger überlegen muss.

**Akzeptanzkriterien**

1. Sobald Interpret und Genres bekannt sind, zeigt der Bereich „Kategorien“ bis zu fünf Vorschläge als gestrichelte Chips. Ein Klick wählt den Vorschlag; von selbst ausgewählt wird nie etwas.
2. Jeder Vorschlag nennt im Tooltip seinen Grund, etwa „4 von 5 Songs von Johnny Cash sind melancholisch“ oder „häufig bei Alternative Rock“.
3. Bei Energie und Mitsingen zeigt ein dezenter Hinweis die übliche Stufe ähnlicher Songs („ähnliche Songs: meist 2“), ohne etwas vorzubelegen.
4. Grundlage ist eine nachvollziehbare Rechnung, keine KI: gleicher Interpret zählt stark, gemeinsame Untergenres mittel, gleiches Hauptgenre mit ähnlichem Tempo (±10 BPM) schwach. Es zählen nur Songs, die die jeweilige Angabe haben.
5. Vorgeschlagen wird erst ab zwei passenden Songs, und nur wenn mindestens die Hälfte davon die Kategorie trägt. Gibt es keine Vorschläge, erscheint nichts.
6. Funktioniert ohne Internet.

**Hinweise zur Umsetzung**

- Rein im Frontend (alle Songs sind geladen), als reine Funktion in `lib/` mit Tests in `lib.test.ts`.
- Dieselbe Rechnung lässt sich in B1 (Nachpflegen) und beim Sammelimport (A10) wiederverwenden.

### A7 · Erscheinungsjahr der Erstveröffentlichung

Priorität mittel · Größe S

> Als Nutzer möchte ich als Erscheinungsjahr das Jahr der ersten Veröffentlichung sehen, nicht das einer Compilation oder Neuauflage, damit Jahrzehnte-Auswertung und Jahr-Filter des Generators stimmen.

**Heute:** Das Jahr kommt aus dem gewählten iTunes-Treffer. Ist das ein „Best of“, ein Sampler oder ein Remaster, steht dort zum Beispiel 2011 statt 1983.

**Akzeptanzkriterien**

1. Die Genre-Suche auf MusicBrainz liefert zusätzlich das Jahr der frühesten Veröffentlichung (Single, EP oder Album; Sampler, Live- und Remix-Alben zählen nicht).
2. Ist dieses Jahr früher als das eingetragene und stammt das eingetragene noch unverändert aus dem Treffer, wird es ersetzt. Unter dem Feld steht „Erstveröffentlichung laut MusicBrainz (Treffer: 2011)“, ein Klick stellt den alten Wert wieder her.
3. Ein selbst eingetragenes Jahr wird nie ersetzt.
4. Beim Nachtragen im Hintergrund (YouTube-Import) werden leere Jahre ebenso gefüllt.
5. Für die vorhandene Bibliothek gibt es die einmalige Aktion „Erscheinungsjahre prüfen“: eine Liste der Songs, bei denen MusicBrainz ein früheres Jahr kennt, zum Übernehmen einzeln oder für alle.

**Hinweise zur Umsetzung**

- `pickReleaseGroups` in `genreLookup.ts` sucht schon die früheste Single/EP und das früheste Album heraus, ohne Sampler, Live- und Remix-Alben. Das Jahr fällt also ohne zusätzliche Anfrage ab und muss nur in `GenreMatch` mitgegeben werden (etwa als `firstReleaseYear`).

### A8 · Bessere Trefferliste der Online-Suche

Priorität mittel · Größe S–M

> Als Nutzer möchte ich in der Trefferliste schneller die richtige Fassung finden, damit ich nicht versehentlich Karaoke-, Cover- oder Sampler-Versionen übernehme.

**Akzeptanzkriterien**

1. Die Suche startet von selbst, sobald man kurz (etwa 400 ms) nicht tippt und mindestens drei Zeichen eingegeben hat. Enter sucht weiterhin sofort.
2. Mit den Pfeiltasten wählt man einen Treffer, Enter übernimmt ihn.
3. Treffer tragen Kennzeichen: „Schon in deiner Bibliothek“ (A1), „Sampler“, „Live“, „Remix“, „Explicit“.
4. Karaoke-, Tribute- und Cover-Fassungen („Karaoke“, „Originally Performed by“, „Made Famous by“, Interpret passt nicht zur Suche) rutschen ans Ende.
5. Unter der Liste lädt „Mehr Treffer“ weitere (heute fest 12).

**Hinweise zur Umsetzung**

- Die iTunes-Antwort enthält schon `collectionArtistName` (bei Samplern „Various Artists“), `trackExplicitness`, `trackId` und `collectionId`. `mapItunesTrack` übernimmt sie bisher nicht.
- `isOtherVersion` aus `songMatching.ts` erkennt Remix, slowed usw. bereits.
- Die iTunes-API erlaubt nur etwa 20 Anfragen pro Minute. Deshalb die Verzögerung beim Tippen und keine Suche pro Tastendruck.

### A9 · Reinhören im Dialog

Priorität mittel · Größe M

> Als Nutzer möchte ich einen Song im Dialog kurz anhören können, damit ich Energie und Mitsingen sicher einschätze und die richtige Fassung erkenne, ohne die App zu wechseln.

**Akzeptanzkriterien**

1. Jeder Treffer der Online-Suche hat einen Abspielknopf für die 30-Sekunden-Hörprobe von Apple. Es läuft immer nur eine Hörprobe; Schließen des Dialogs stoppt sie.
2. Im Formular steht der Abspielknopf neben dem Cover, sobald eine Hörprobe bekannt ist, auch beim Bearbeiten, wenn ein Apple-Music-Link gespeichert ist.
3. Hat ein Song nur einen YouTube-Link, öffnet „Im Dialog abspielen“ einen eingebetteten YouTube-Player (datensparsame Variante über youtube-nocookie.com) in einem einklappbaren Bereich.
4. Nichts wird heruntergeladen oder gespeichert; die Hörprobe kommt direkt von Apple. Das passt zum Grundsatz „keine Audiodateien“.

**Hinweise zur Umsetzung**

- iTunes liefert `previewUrl` in Suche und Lookup, etwa `https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview…/….plus.aac.p.m4a`: 30 Sekunden, ohne Weiterleitung. Für gespeicherte Songs lässt sie sich über die Track-ID aus dem Apple-Music-Link (`?i=…`) nachschlagen (siehe A4).
- **Sicherheitsregeln, geprüft am 20.11.2026** mit einer Testseite unter den Kopfzeilen der App: Heute blockiert die Content-Security-Policy beides („Loading media … violates default-src 'self'“, „Framing 'https://www.youtube-nocookie.com/' violates …“). Mit diesen zwei Ergänzungen in `frontend/nginx/default.conf.template` laufen Hörprobe und Player:

  ```
  media-src 'self' https://audio-ssl.itunes.apple.com; frame-src https://www.youtube-nocookie.com;
  ```

- **YouTube braucht den Referrer:** Die App schickt für alle Seiten `Referrer-Policy: no-referrer`. Damit zeigt der eingebettete Player nur „Video player configuration error – Error 153“. Abhilfe, ohne die Regel für die ganze App zu lockern: am iframe `referrerpolicy="strict-origin-when-cross-origin"` setzen. So getestet: Der Player lädt, das Video spielt (stumm per Autoplay geprüft). YouTube erfährt dabei nur die Herkunft der App, etwa `http://localhost:8090`.
- Getestet im Chromium-Browser der Claude-App; Firefox und Safari sind nicht geprüft.
- README „Was nach außen geht“ ergänzen: Abspielen lädt von Apple bzw. YouTube.

### A10 · Viele Songs auf einmal: Textliste oder CSV

Priorität mittel · Größe L

> Als Nutzer möchte ich eine Liste von Songs (aus einer Notiz, einer Tabelle oder einem Export) auf einmal übernehmen, damit ich größere Mengen nicht einzeln suchen und anlegen muss.

**Akzeptanzkriterien**

1. Neben „Song hinzufügen“ gibt es **„Mehrere hinzufügen“**.
2. **Textliste:** ein Song pro Zeile. Erkannt werden „Interpret – Titel“, „Interpret - Titel“, „Titel von Interpret“, „Titel by Interpret“, Tabulator-getrennte Spalten und Links (wie in A4).
3. **CSV:** Die eigene Exportdatei der App wird vollständig wieder eingelesen (Kategorien über ihren Namen, Bewertung, Energie, Mitsingen, Links, Notizen). Bei fremden CSV-Dateien ordnet man die Spalten einmal zu (Titel, Interpret, Album …).
4. Die App sucht jede Zeile im iTunes-Katalog und zeigt eine Prüfliste wie beim YouTube-Import: Eingabezeile, bester Treffer (Cover, Titel, Interpret, Album, Jahr) und ein Status: **eindeutig** (angehakt), **unsicher** (Auswahl unter mehreren Treffern), **nicht gefunden** (so übernehmen oder weglassen), **schon in der Bibliothek** (nicht angehakt).
5. Gemeinsame Kategorien für alle neuen Songs sind wählbar, wie beim YouTube-Import.
6. „23 Songs übernehmen“ legt die Songs an. Tempo, Genres und Links (A5) werden im Hintergrund nachgetragen.
7. Danach führt **„Jetzt einordnen“** direkt in B1, und zwar nur mit diesen Songs.
8. Bis zu 200 Zeilen pro Durchgang. Die Suche zeigt ihren Fortschritt, und man darf die Seite währenddessen verlassen.

**Hinweise zur Umsetzung**

- Wegen der iTunes-Grenze (etwa 20 Anfragen pro Minute) als Auftrag im Backend mit Fortschritt, nach dem Muster der YouTube-Übertragung (`/api/youtube/jobs/:id`). 200 Zeilen dauern damit rund 10 Minuten.
- Die Prüfliste des YouTube-Imports (`YoutubeImportPage.tsx`) sollte ein gemeinsamer Baustein werden, damit A10 und A11 dieselbe Oberfläche nutzen.
- **Apple-Music-Playlists, geprüft am 20.11.2026:** Die Apple-Music-App für Windows kann keine Playlists exportieren. Apples Anleitung für die Windows-App hat dazu kein Kapitel, Nutzer in der Apple Community bestätigen das, und iTunes verwaltet neben den neuen Apps nur noch Podcasts und Hörbücher. Den Export als Textdatei gibt es nur noch in der Musik-App auf dem Mac („Ablage → Mediathek → Playlist exportieren“). Unter Windows ist A17 der bessere Weg (Playlist über ihren Teilen-Link übernehmen).
- Der CSV-Import sollte außerdem Dateien von Fremddiensten wie TuneMyMusic („Apple Music to File“) verstehen. Dafür braucht der Dienst allerdings Zugriff auf das Apple-Music-Konto; kostenlos laut einem Testbericht bis 500 Songs.

### A11 · Album oder Interpret durchgehen

Priorität mittel · Größe M

> Als Nutzer möchte ich von einem Treffer aus das ganze Album oder die bekanntesten Songs des Interpreten sehen und mehrere auf einmal übernehmen, damit ich ein Lieblingsalbum in einem Schritt erfasse.

**Akzeptanzkriterien**

1. In der Trefferliste und auf der Karte (A3) gibt es „Ganzes Album“ und „Mehr von diesem Interpreten“.
2. „Ganzes Album“ zeigt die Titelliste (Nummer, Titel, Dauer). Songs, die schon in der Bibliothek sind, sind markiert und nicht wählbar.
3. „Mehr von diesem Interpreten“ zeigt seine bekanntesten Songs aus dem Katalog, ebenfalls mit Markierung.
4. Mehrfachauswahl, gemeinsame Kategorien und Übernahme wie in A10. Der gerade bearbeitete Song wird mit seinen Eingaben normal gespeichert.

**Hinweise zur Umsetzung**

- iTunes: `lookup?id=<collectionId>&entity=song` liefert die Titelliste; Songs eines Interpreten über `search?term=…&entity=song&attribute=artistTerm`.

### A12 · Beim Anlegen direkt in Playlists legen

Priorität mittel · Größe S

> Als Nutzer möchte ich einen neuen Song schon im Dialog einer oder mehreren Playlists hinzufügen, damit ich nicht danach zur Playlist wechseln und ihn dort suchen muss.

**Akzeptanzkriterien**

1. Im Dialog gibt es „Zu Playlists hinzufügen“ mit einer Auswahl der gespeicherten Playlists (zuletzt geänderte zuerst, mit Suchfeld).
2. Beim Speichern wird der Song ans Ende jeder gewählten Playlist gehängt.
3. Bei „Speichern & weiterer Song“ bleibt die Auswahl für den nächsten Song stehen. So lässt sich eine Playlist in einem Rutsch füllen.
4. Beim Bearbeiten zeigt dieselbe Stelle, in welchen Playlists der Song schon ist (siehe B5).
5. Ist eine Playlist mit YouTube verknüpft, steht dabei: „Kommt beim nächsten Abgleich auf YouTube“.

**Hinweise zur Umsetzung**

- Statt die ganze Songliste der Playlist per `PUT` zu ersetzen, besser ein Endpunkt zum Anhängen (`POST /api/playlists/:id/songs`) oder `playlistIds` beim Speichern des Songs in derselben Transaktion.

### A13 · Merkliste für unterwegs

Priorität mittel · Größe M

> Als Nutzer möchte ich einen Song, den ich gerade irgendwo höre, in Sekunden vormerken können, auch am Handy, damit ich ihn später in Ruhe vollständig erfasse und nicht vergesse.

**Akzeptanzkriterien**

1. Eine **Merkliste** (eigene Seite oder Reiter auf „Songs“) hat oben ein einziges Feld für freien Text („Interpret – Titel“) oder einen Link. Enter merkt vor.
2. Vorgemerkte Einträge sind keine Songs: Sie erscheinen nicht in Songliste, Auswertung und Generator.
3. Jeder Eintrag zeigt, wann er vorgemerkt wurde, und hat **„Erfassen“** (öffnet den Song-Dialog mit dem Text in der Suche bzw. dem erkannten Link aus A4; nach dem Speichern verschwindet der Eintrag) und **„Löschen“**.
4. Die Navigation zeigt die Zahl offener Einträge.
5. Die Seite ist fürs Handy gemacht: großes Feld, mit einer Hand bedienbar, ohne Zoomen.

**Hinweise zur Umsetzung**

- Neue Tabelle, etwa `merkliste (id, text, created_at)`.
- Vom Handy erreichbar ist die App mit `WEB_BIND=0.0.0.0`; dann D6 bedenken.
- Ausbaustufe: Als installierbare Web-App mit „Teilen“-Ziel könnte man direkt aus Apple Music, YouTube oder Shazam an die App teilen. Das setzt HTTPS voraus und geht im Heimnetz mit `http://192.168.…` nicht ohne Weiteres, etwa nur mit einem lokalen Reverse-Proxy samt Zertifikat.

### A14 · YouTube-Importe aus dem iTunes-Katalog vervollständigen

Priorität mittel · Größe M

> Als Nutzer möchte ich, dass aus YouTube übernommene Songs automatisch Album, Jahr, Cover und Apple-Music-Link bekommen, damit sie genauso vollständig sind wie von Hand angelegte.

**Heute:** Übernommene Videos bekommen Titel, Interpret, Dauer des Videos, YouTube-Link und das Vorschaubild des Videos als Cover. Tempo und Genres werden nachgetragen, Album, Jahr und Apple-Music-Link bleiben leer.

**Akzeptanzkriterien**

1. Nach einem YouTube-Import sucht die App im Hintergrund jeden neuen Song im iTunes-Katalog und übernimmt einen Treffer nur, wenn Titel und Interpret passen. Bei mehreren gewinnt die passendere Dauer.
2. Gefüllt werden nur leere Felder: Album, Jahr, Apple-Music-Link. Das Cover wird ersetzt, solange es noch das YouTube-Vorschaubild ist (16:9 mit Rändern), sonst nicht.
3. Die Dauer bleibt, wie sie ist; sie wird nur gefüllt, wenn sie fehlt.
4. Im Song-Dialog eines vorhandenen Songs gibt es **„Angaben online ergänzen“**. Die Aktion zeigt, was sich ändern würde (vorher → nachher), und übernimmt erst nach Bestätigung.
5. Für die vorhandene Bibliothek gibt es die einmalige Aktion „Fehlende Angaben aus dem Katalog ergänzen“ mit Fortschritt.

**Hinweise zur Umsetzung**

- Gleiches Muster wie Tempo und Genres (`SongQueue`), Pause wegen der iTunes-Grenze etwa 3 Sekunden.
- Lässt sich mit A5 verbinden: Über den neuen Apple-Music-Link findet song.link danach die übrigen Links.

### A15 · Tonart und „Explicit“ mitnehmen

Priorität niedrig · Größe S

> Als Nutzer möchte ich Angaben, die die Online-Quellen ohnehin liefern, auch gespeichert haben, damit ich sie später für Playlists nutzen kann.

**Akzeptanzkriterien**

1. **Tonart:** Die Tempo-Suche auf songbpm.com liefert die Tonart (etwa „A“ oder „C♯/D♭“) schon mit. Sie wird wie das Tempo nur in ein leeres Feld gespeichert und im Dialog neben dem Tempo angezeigt.
2. **Explicit:** Der iTunes-Treffer sagt, ob der Text als explizit gilt. Die App speichert das als Kennzeichen (ja, nein, unbekannt), das sich im Dialog ändern lässt.
3. Generator: Option „ohne explizite Texte“, etwa für Familienfeiern oder das Büro.
4. Später denkbar: Reihenfolge „harmonische Übergänge“ anhand der Tonart (Quintenzirkel).

**Hinweise zur Umsetzung**

- `BpmMatch.key` gibt es schon, es wird nur nicht gespeichert. `trackExplicitness` liefert die iTunes-API (`explicit`, `cleaned`, `notExplicit`).
- Zwei neue Spalten in einer Migration.

### A16 · Sprache und „Instrumental“

Priorität niedrig · Größe S–M

> Als Nutzer möchte ich festhalten, in welcher Sprache ein Song gesungen wird oder ob er instrumental ist, damit ich etwa eine Playlist mit deutschen Mitsing-Songs oder eine Fokus-Playlist ohne Gesang erzeugen kann.

**Akzeptanzkriterien**

1. Im Dialog gibt es eine schnelle Auswahl: Deutsch, Englisch, Instrumental, andere Sprache (mit Freitext). Keine Angabe ist erlaubt.
2. Ist es naheliegend, erscheint ein Vorschlag, der nichts von selbst setzt: Genres wie Deutschrap, Deutschpop, Schlager oder Neue Deutsche Welle legen „Deutsch“ nahe.
3. Songliste, Generator und Auswertung können nach Sprache filtern bzw. zählen.

**Hinweise zur Umsetzung**

- MusicBrainz kennt bei Veröffentlichungen die Sprache der Texte. Ob sie in den Suchergebnissen der Aufnahmen mitkommt, wäre zu prüfen; sonst bleibt es bei der Genre-Regel und der eigenen Auswahl.

### A17 · Apple-Music-Playlist per Link übernehmen

Priorität mittel · Größe M

> Als Nutzer von Apple Music möchte ich eine meiner Playlists über ihren Teilen-Link in die App holen, damit ich bestehende Playlists nicht Song für Song nachbauen muss, auch unter Windows, wo die Apple-Music-App keine Playlists exportieren kann.

**Geprüft am 20.11.2026:** Die öffentliche Seite einer geteilten Playlist enthält die Songliste samt Apple-Track-IDs. Bei Apples eigenen Playlists stehen sie als strukturierte Daten in der Seite (`application/ld+json`, Typ `MusicPlaylist`), bei eigenen Playlists (`pl.u-…`) in den eingebetteten Seitendaten (`serialized-server-data`, Songs mit `storeAdamID`). Eine einzige iTunes-Abfrage mit allen IDs liefert dann die vollständigen Angaben: 100 IDs ergaben 100 Songs in gut einer Sekunde. Grenze: Bei Apples Playlist „10 Jahre Apple Music: Top Songs“ (laut Apple 500 Songs) enthielt die Seite nur 300.

**Akzeptanzkriterien**

1. „Mehrere hinzufügen“ (A10) und das Suchfeld im Song-Dialog (A4) erkennen Links der Form `music.apple.com/<land>/playlist/<name>/pl.…`.
2. Die App liest Name und Songs der Playlist und zeigt die Prüfliste aus A10: jeder Song mit Cover, Titel, Interpret, Album und Jahr. Songs, die schon in der Bibliothek sind, sind markiert und nicht angehakt.
3. Die Option **„Auch als Playlist anlegen“** ist vorausgewählt. Sie legt in der App eine Playlist mit demselben Namen und derselben Reihenfolge an, mit den neuen und den schon vorhandenen Songs.
4. Gemeinsame Kategorien für die neuen Songs sind wählbar. Tempo, Genres und YouTube-Links werden im Hintergrund ergänzt (A5).
5. Enthält die Seite genau 300 Songs, weist die App darauf hin, dass längere Playlists abgeschnitten sein können.
6. Bei einer nicht geteilten Playlist oder einem kaputten Link erklärt die App, was zu tun ist: „Diese Playlist ist nicht öffentlich. In Apple Music ‚Teilen → Link kopieren‘ wählen.“
7. Ausbaustufe: Die App merkt sich den Link an der Playlist. „Mit Apple Music abgleichen“ holt später nur neue Songs dazu.

**Hinweise zur Umsetzung**

- Die Seite mit gewöhnlichem Browser-User-Agent abrufen. Die IDs am besten unabhängig vom Seitenaufbau einsammeln: alle Song-Links der Seite (`/song/<name>/<ID>` und `/album/<name>/<ID>?i=<ID>`) in ihrer Reihenfolge, doppelte weg. Das klappt für beide Seitenformen und übersteht kleinere Umbauten besser als das Auslesen bestimmter JSON-Felder.
- Danach `https://itunes.apple.com/lookup?id=<ID1>,<ID2>,…&country=<ITUNES_COUNTRY>` in Paketen zu 100 IDs (getestet); `mapItunesTrack` passt.
- Eine offizielle Schnittstelle ist das nicht (die verlangt die kostenpflichtige Entwickler-Mitgliedschaft). Wie bei songbpm.com kann eine Änderung der Seite das Einlesen stoppen; dann sagt die App das und verweist auf die Textliste (A10).
- README „Was nach außen geht“: Der Playlist-Link geht an Apple.
- Offizielle Alternative für die ganze Mediathek ist die Datenkopie unter privacy.apple.com. Sie enthält laut älteren Beschreibungen „Apple Music Library Tracks“ und „Apple Music Library Playlists“ als JSON, dauert aber bis zu sieben Tage, und ihr Aufbau ist nicht dokumentiert. Erst mit einem echten Export prüfen, bevor man dafür einen Import baut.

---

## B · Bibliothek pflegen

### B1 · Schnell nachpflegen, Song für Song

Priorität hoch · Größe M

> Als Nutzer möchte ich fehlende Angaben in einem Rutsch nachtragen, Song für Song und mit der Tastatur, damit meine Bibliothek schnell vollständig ist und der Generator besser trifft.

**Heute:** Allen Songs aus der Zeit vor dem Mitsingen-Feld fehlt diese Angabe; aus YouTube übernommene Songs haben weder Bewertung noch Energie. Nachtragen heißt für jeden Song: Dialog öffnen, nach unten scrollen, klicken, speichern, schließen.

**Akzeptanzkriterien**

1. Einstieg über „Nachpflegen“ auf der Songliste, über jede Zeile von „Vollständigkeit der Angaben“ in der Auswertung („Mitsingen nachpflegen – 183 Songs“) und nach einem Sammelimport (A10).
2. Vorab wählt man, was ergänzt werden soll (Mitsingen, Energie, Bewertung, Kategorien; mehrere möglich) und für welche Songs: alle, denen eine dieser Angaben fehlt, oder die aktuelle Auswahl der Songliste.
3. Für jeden Song gibt es eine Karte: großes Cover, Titel, Interpret, Jahr, Genres, Tempo, vorhandene Kategorien und Abspielknöpfe (Apple Music, YouTube; mit A9 direkt in der Karte).
4. Tastatur: **1–5** setzt die aktive Skala, **Tab** wechselt zur nächsten, **Enter** speichert und geht weiter, **→** überspringt, **←** geht zurück, **Esc** beendet.
5. Jede Karte wird sofort gespeichert; wer abbricht, verliert nichts.
6. Der Fortschritt steht als „37 von 183“ mit Balken da, am Ende eine Zusammenfassung („179 ergänzt, 4 übersprungen“).
7. Die Reihenfolge ist wählbar: nach Interpret (ähnliche Songs hintereinander, das hilft beim einheitlichen Einschätzen) oder zufällig.
8. Mit A6 zeigt die Karte die Vorschläge aus ähnlichen Songs.

**Hinweise zur Umsetzung**

- Ein `PATCH /api/songs/:id`, das nur die geänderten Felder schreibt, ist hier sicherer als das vollständige `PUT`: Es überschreibt nichts, wenn im Hintergrund gerade Tempo oder Genres nachgetragen werden.

### B2 · Kategorie „Mitsingen“ in die neue Skala überführen

Priorität hoch · Größe S

> Als Nutzer möchte ich die alte Kategorie „Mitsingen“ in die neue Mitsingen-Skala überführen, damit ich nicht zwei Angaben für dasselbe pflege und meine bisherige Einordnung nicht verloren geht.

**Heute:** Migration 005 hat die Start-Kategorie „Mitsingen“ („Laut mitsingen, der Text sitzt“) angelegt, seit Migration 008 gibt es die Skala von 1 bis 5. Songs mit der Kategorie haben noch keinen Wert auf der Skala.

**Akzeptanzkriterien**

1. Gibt es die Kategorie „Mitsingen“ noch und hängt sie an Songs, bietet die Kategorien-Seite (oder einmalig ein Hinweis auf der Songliste) an: „23 Songs mit der Kategorie ‚Mitsingen‘ auf die Mitsingen-Skala übertragen?“
2. Die Stufe ist wählbar; vorgeschlagen wird 5 „lauthals mitsingen“, passend zur Beschreibung der Kategorie.
3. Übertragen wird nur auf Songs, die noch keinen Mitsingen-Wert haben; vorhandene Werte bleiben.
4. Danach ist wählbar, ob die Kategorie bleibt oder gelöscht wird. Beim Löschen werden gespeicherte Generator-Kriterien, die die Kategorie verlangen, auf „Mitsingen ab Stufe X“ umgestellt, damit „Mit diesen Kriterien neu erzeugen“ weiter funktioniert.
5. Eine Zusammenfassung nennt, was geändert wurde.

**Hinweise zur Umsetzung**

- Bewusst als Aktion in der App statt als Migration: Die Kategorie kann umbenannt, umgedeutet oder gelöscht worden sein, und die Stufe soll der Nutzer wählen.

### B3 · Mehr Filter, Sortierungen und Spalten in der Songliste

Priorität mittel · Größe M

> Als Nutzer möchte ich die Songliste nach allen gepflegten Angaben filtern und sortieren, damit ich gezielt Songs finde („alle Rocksongs der 90er mit 5 Sternen“) und Lücken sehe.

**Heute:** Es gibt die Freitextsuche, Kategorien, „ohne Kategorie“ und acht Sortierungen. Energie, Mitsingen, Tempo und Genres sind in der Liste weder zu sehen noch zu filtern.

**Akzeptanzkriterien**

1. Ein aufklappbarer Bereich „Weitere Filter“ bietet: Genre (Haupt- und Untergenres wie im Generator), Mindestbewertung, Energie von–bis, Mitsingen von–bis, Jahr bzw. Jahrzehnt, Tempo von–bis, Link vorhanden oder fehlt je Plattform und „Angabe fehlt“ (Bewertung, Energie, Mitsingen, Genre, Dauer, Jahr).
2. Aktive Filter stehen als entfernbare Chips über der Liste; „Filter zurücksetzen“ leert alle.
3. Alle Filter stehen in der Adresse (wie heute `?kategorie=`), damit Zurück-Taste, Lesezeichen und Links aus der Auswertung (D4) funktionieren.
4. Neue Sortierungen: Energie, Mitsingen, Tempo, zuletzt bearbeitet.
5. Über „Spalten“ lassen sich Energie, Mitsingen, Tempo, Jahr und Genres einblenden; der Browser merkt sich die Wahl.
6. Bewertung, Energie und Mitsingen lassen sich in diesen Spalten direkt anklicken und ändern, ohne den Dialog zu öffnen.
7. „Als Playlist speichern“ legt aus der gefilterten Liste eine Playlist an, in der angezeigten Reihenfolge.

### B4 · Mehrere Songs auf einmal bearbeiten

Priorität mittel · Größe M

> Als Nutzer möchte ich mehrere Songs auswählen und gemeinsam ändern, damit ich etwa allen Songs eines Albums die Kategorie „Roadtrip“ gebe, ohne jeden einzeln zu öffnen.

**Akzeptanzkriterien**

1. Jede Zeile hat ein Auswahlkästchen; dazu „alle sichtbaren auswählen“ und Umschalt-Klick für Bereiche.
2. Bei einer Auswahl erscheint eine Aktionsleiste: Kategorie hinzufügen, Kategorie entfernen, Genre hinzufügen, Bewertung / Energie / Mitsingen setzen, zu Playlist hinzufügen, löschen.
3. Geändert wird nur das gewählte Feld, alles andere bleibt.
4. Löschen fragt nach und nennt die Zahl der Songs und der betroffenen Playlists.
5. Nach dem Ändern erscheint „12 Songs geändert“ mit „Rückgängig“ für einige Sekunden.
6. Die Auswahl bleibt beim Filtern erhalten und ist als Zahl sichtbar („12 ausgewählt“).

**Hinweise zur Umsetzung**

- Ein Endpunkt für Sammeländerungen in einer Transaktion, etwa `PATCH /api/songs` mit `{ ids, changes }`.

### B5 · Playlists eines Songs sehen, Song zu Playlist hinzufügen

Priorität mittel · Größe S

> Als Nutzer möchte ich sehen, in welchen Playlists ein Song steckt, und ihn direkt aus der Songliste einer Playlist hinzufügen, damit ich nicht zwischen den Seiten hin- und herspringen muss.

**Akzeptanzkriterien**

1. Der Dialog „Song bearbeiten“ zeigt „In Playlists: Sommer 2026, Roadtrip“ mit Links zu den Playlists.
2. In der Songliste gibt es je Zeile „Zu Playlist hinzufügen …“ (Auswahl wie in A12).
3. Die Rückfrage beim Löschen eines Songs nennt die betroffenen Playlists und hebt mit YouTube verknüpfte hervor.

---

## C · Playlists und Generator

### C1 · Tempo (BPM) im Generator

Priorität mittel · Größe S

> Als Nutzer möchte ich Playlists nach Tempo zusammenstellen, damit zum Beispiel eine Laufplaylist zu meinem Schritt passt. Das Tempo wird ja schon automatisch gepflegt.

**Heute:** Das Tempo wird beim Anlegen nachgeschlagen, der Generator verwendet es aber nicht.

**Akzeptanzkriterien**

1. Neuer Filter „Tempo (BPM) von–bis“. Songs ohne Tempo erfüllen einen gesetzten Bereich nicht, wie bei der Energie.
2. Option „halbes und doppeltes Tempo mitzählen“: Ein Song mit 85 BPM passt dann zu 160–180, weil man beim Laufen auf jeden zweiten Schlag tritt.
3. Schnellwahl-Knöpfe, etwa „Gehen 100–120“, „Joggen 150–165“, „Laufen 165–180“.
4. Neue Reihenfolge „Tempo aufsteigend“.
5. Die Beschreibung der Kriterien nennt das Tempo („Tempo 160–180 BPM“), gespeicherte Playlists merken es sich.
6. Die Auswertung zeigt eine Verteilung nach Tempo in 10er-Schritten.

**Hinweise zur Umsetzung**

- `bpm` in `GeneratorSong`, `bpmMin`, `bpmMax` und `bpmHalfDouble` in den Kriterien (Schema, `describeCriteria`), Tests in `generator.test.ts`. Gespeicherte Kriterien ohne die neuen Felder müssen weiter gelten, wie beim Mitsingen.

### C2 · Songs im Vorschlag festhalten

Priorität mittel · Größe S

> Als Nutzer möchte ich einzelne Songs im Vorschlag festhalten, damit „Neu mischen“ nur den Rest austauscht.

**Akzeptanzkriterien**

1. Jeder Song im Vorschlag hat ein Stecknadel-Symbol. Festgehaltene Songs bleiben beim Neu-Mischen und beim Ändern der Kriterien drin.
2. Passt ein festgehaltener Song nicht mehr zu geänderten Kriterien, bleibt er trotzdem und ist mit „passt nicht mehr“ markiert.
3. Festgehaltene Songs zählen zur Ziel-Dauer.
4. „Song hinzufügen“ im Vorschlag (Auswahl wie auf der Playlist-Seite) hält den Song automatisch fest.

**Hinweise zur Umsetzung**

- Analog zu `excludeSongIds`: `pinnedSongIds` in den Kriterien.

### C3 · Mehr Abwechslung zwischen Playlists

Priorität mittel · Größe S

> Als Nutzer möchte ich, dass neue Playlists nicht immer dieselben Songs enthalten, damit auch der Rest meiner Bibliothek zum Zug kommt.

**Akzeptanzkriterien**

1. Option „Abwechslung“ (standardmäßig an): Songs aus Playlists der letzten 14 Tage werden seltener gewählt, je kürzer her, desto seltener, aber nicht ausgeschlossen.
2. Option „ohne Songs aus Playlist …“, etwa um einen zweiten, ergänzenden Teil zu erzeugen.
3. Unter dem Vorschlag steht: „5 Songs waren in den letzten zwei Wochen schon dabei“.

**Hinweise zur Umsetzung**

- Die Bewertung in `generatePlaylist` bekommt einen Abzug; Grundlage sind `playlist_songs` und `playlists.created_at`.

### C4 · Playlist ausgehend von einem Song

Priorität mittel · Größe M

> Als Nutzer möchte ich von einem Song aus „mehr davon“ erzeugen, damit ich ohne Kriterien-Einstellen eine passende Playlist bekomme.

**Akzeptanzkriterien**

1. Im Song-Dialog und in der Songliste gibt es „Playlist von diesem Song aus“.
2. Der Generator öffnet sich vorbelegt: die Kategorien des Songs (eine davon muss passen), Energie ±1, die Hauptgenres des Songs. Alles bleibt änderbar.
3. Der Startsong steht an Position 1 und ist festgehalten (C2).
4. Sortiert wird nach Ähnlichkeit: gemeinsame Kategorien, gemeinsame Untergenres, ähnliches Tempo, ähnliche Energie, gleiches Jahrzehnt.
5. Der Namensvorschlag lautet „Wie ‚Hurt‘“.

### C5 · Playlist per Ziehen umsortieren

Priorität mittel · Größe S

> Als Nutzer möchte ich Songs einer Playlist mit Maus oder Finger an eine andere Stelle ziehen, damit ich lange Playlists nicht Schritt für Schritt mit Pfeilen umsortieren muss.

**Akzeptanzkriterien**

1. Jede Zeile hat einen Griff zum Ziehen. Das funktioniert mit Maus und Touch, und die Liste scrollt am Rand mit.
2. Die Pfeile bleiben für Tastatur und Screenreader; dazu kommt „An Position …“.
3. Die neue Reihenfolge wird sofort gespeichert. Bei einer verknüpften YouTube-Playlist steht dabei: „Wird beim nächsten Abgleich übertragen“.
4. Im Vorschlag des Generators geht das genauso.

### C6 · Energie- und Tempoverlauf einer Playlist

Priorität niedrig · Größe S

> Als Nutzer möchte ich den Verlauf von Energie und Tempo über eine Playlist sehen, damit ich erkenne, ob der Spannungsbogen stimmt.

**Akzeptanzkriterien**

1. Über der Songliste einer Playlist und im Vorschlag steht ein kleines Liniendiagramm: Energie je Position (1–5), wahlweise das Tempo als zweite Linie. Fehlende Werte bleiben als Lücke.
2. Zeigen auf einen Punkt nennt den Song, ein Klick springt zur Zeile.
3. Daneben stehen Ø Energie, Ø Tempo und wie viele Songs keine Energie-Angabe haben.

### C7 · Playlist auffrischen, Verknüpfung behalten

Priorität niedrig · Größe S

> Als Nutzer möchte ich eine erzeugte Playlist mit ihren Kriterien neu befüllen, ohne eine neue Playlist anzulegen, damit etwa meine „Fokus“-Playlist in YouTube Music jede Woche frisch ist und trotzdem dieselbe bleibt.

**Heute:** „Mit diesen Kriterien neu erzeugen“ führt zum Generator, und der speichert immer als neue Playlist. Eine YouTube-Verknüpfung hängt aber an der alten.

**Akzeptanzkriterien**

1. Beim Speichern aus dem Generator mit Vorlage gibt es zusätzlich „Bestehende Playlist ersetzen“.
2. Name, Beschreibung und YouTube-Verknüpfung bleiben; nur Songs und Reihenfolge ändern sich. Beim nächsten Abgleich zieht YouTube nach.
3. Auf der Playlist-Seite gibt es zusätzlich „Duplizieren“.

### C8 · Intelligente Playlists

Priorität niedrig · Größe M–L

> Als Nutzer möchte ich Playlists, die sich selbst aktualisieren („alle 5-Sterne-Songs“, „in den letzten 30 Tagen hinzugefügt“, „Mitsingen ab 4“), damit ich sie nicht pflegen muss.

**Akzeptanzkriterien**

1. Beim Anlegen wählbar: „Intelligente Playlist“ mit Regeln aus den Filtern des Generators, dazu „hinzugefügt in den letzten N Tagen“, Sortierung und Höchstzahl.
2. Der Inhalt wird beim Öffnen neu berechnet; Liste, Dauer und Export zeigen den aktuellen Stand.
3. Der YouTube-Abgleich überträgt den Stand zum Zeitpunkt des Abgleichs.
4. „In normale Playlist umwandeln“ friert den aktuellen Inhalt ein.

---

## D · Kategorien, Auswertung, Betrieb

### D1 · Sicherung aus der App und automatisch

Priorität hoch · Größe M

> Als Nutzer möchte ich meine Bibliothek ohne Kommandozeile sichern und wiederherstellen können und zusätzlich automatisch gesichert wissen, damit Monate an Einordnung nie verloren gehen.

**Heute:** Gesichert wird nur mit den `pg_dump`-Befehlen aus dem README, und nur, wenn man daran denkt.

**Akzeptanzkriterien**

1. Eine Seite „Sicherung“ (oder „Einstellungen“) bietet **„Sicherung herunterladen“**: eine JSON-Datei mit Songs, Kategorien, eigenen Genres und Playlists samt Kriterien und Reihenfolge, ohne YouTube-Zugangsdaten. Dateiname etwa `musik-sicherung-2026-11-20.json`.
2. **„Sicherung einspielen“** zeigt erst eine Vorschau (Anzahl Songs, Kategorien, Playlists) und bietet dann „Zusammenführen“ (Vorhandenes bleibt, Neues kommt dazu) oder „Ersetzen“. Ersetzen fragt deutlich nach und legt vorher automatisch eine Sicherung des aktuellen Stands an.
3. **Automatisch:** einmal täglich eine Sicherung in den Ordner `backups/`. Die letzten 14 bleiben, ältere werden gelöscht.
4. Die Seite zeigt „Letzte automatische Sicherung: heute, 3:00 Uhr“ und warnt, wenn die letzte älter als zwei Tage ist.
5. Ein Test spielt eine Sicherung in eine leere Datenbank ein und vergleicht das Ergebnis.

**Hinweise zur Umsetzung**

- Automatisch etwa als zusätzlicher kleiner Dienst in `docker-compose.yml`, der `pg_dump` zeitgesteuert in ein eingebundenes `./backups` schreibt (der Ordner ist schon von Git ausgenommen).
- Die JSON-Sicherung ist unabhängig vom Datenbankschema lesbar und taugt auch für einen Umzug.

### D2 · Kategorien gruppieren und sortieren

Priorität mittel · Größe M

> Als Nutzer möchte ich meine Kategorien in Gruppen wie „Stimmung“ und „Anlass“ ordnen und ihre Reihenfolge bestimmen, damit ich bei über 20 Kategorien im Song-Dialog schneller die richtige finde.

**Akzeptanzkriterien**

1. Eine Kategorie kann zu einer Gruppe gehören (frei benennbar, Vorschläge „Stimmung“ und „Anlass“).
2. Für die Start-Kategorien gibt es einen Vorschlag, den der Nutzer einmal bestätigt: Stimmungen wie melancholisch, verträumt, episch → „Stimmung“; Sport, Roadtrip, Sommer, Party, Fokus, Aufwachen, Einschlafen → „Anlass“.
3. Die Reihenfolge innerhalb einer Gruppe lässt sich per Ziehen festlegen oder automatisch nach Häufigkeit.
4. Song-Dialog, Filter der Songliste und Generator zeigen die Chips gruppiert mit kleiner Überschrift.
5. Ohne Gruppen sieht alles aus wie heute.

**Hinweise zur Umsetzung**

- Migration: `categories.group_name` und `categories.position`.

### D3 · Kategorien zusammenführen

Priorität niedrig · Größe S

> Als Nutzer möchte ich zwei Kategorien zusammenführen, damit ich Doppelungen („fröhlich“ und „gute Laune“) bereinigen kann, ohne Songs einzeln umzuhängen.

**Akzeptanzkriterien**

1. Auf der Kategorien-Seite gibt es „Zusammenführen mit …“. Alle Songs der einen Kategorie bekommen die andere, danach wird die erste gelöscht.
2. Gespeicherte Generator-Kriterien, die die gelöschte Kategorie nennen, zeigen danach auf die verbliebene.
3. Die Rückfrage nennt die Zahlen („18 Songs, davon 5 schon in beiden“).

### D4 · Auswertung anklickbar

Priorität mittel · Größe S (setzt B3 voraus)

> Als Nutzer möchte ich von jedem Balken der Auswertung zu den passenden Songs springen, damit aus einer Erkenntnis direkt eine Handlung wird („Welche 12 Songs sind aus den 70ern?“).

**Akzeptanzkriterien**

1. Ein Klick auf einen Balken (Kategorie, Interpret, Haupt- und Untergenre, Jahrzehnt, Songlänge, Bewertung, Energie, Mitsingen, jeweils auch „ohne“) öffnet die Songliste mit genau diesem Filter.
2. Ein Klick auf eine häufige Kategorie-Kombination öffnet die Songs mit beiden Kategorien.
3. Jede Zeile von „Vollständigkeit der Angaben“ verlinkt auf die Songs ohne diese Angabe und auf „Nachpflegen“ (B1). Heute gibt es das nur für Kategorien.

### D5 · Nur neue „Mag ich“-Videos zeigen

Priorität niedrig · Größe S

> Als Nutzer möchte ich beim Übernehmen meiner „Mag ich“-Videos nur sehen, was seit dem letzten Mal neu ist, damit ich nicht jedes Mal dieselben Videos ohne Musik abwähle.

**Akzeptanzkriterien**

1. Videos, die beim Import bewusst nicht übernommen wurden, merkt sich die App und blendet sie beim nächsten Mal aus. „Auch abgelehnte zeigen“ holt sie zurück.
2. Die YouTube-Seite zeigt „12 neue Videos seit dem letzten Import“.

**Hinweise zur Umsetzung**

- Neue Tabelle für abgelehnte Video-IDs. Vorhandene Songs erkennt der Import schon.

### D6 · Zugriff aus dem Heimnetz absichern

Priorität niedrig · Größe S

> Als Nutzer möchte ich die App mit einem Passwort schützen können, wenn ich sie im Heimnetz freigebe (etwa für die Merkliste am Handy), damit nicht jeder im WLAN meine Bibliothek ändern oder über mein YouTube-Konto Playlists anlegen kann.

**Akzeptanzkriterien**

1. Ist in der `.env` ein Passwort gesetzt (etwa `APP_PASSWORD`), fragt die App auf jedem Gerät einmal danach und merkt sich die Anmeldung für 90 Tage.
2. Ohne gesetztes Passwort verhält sich alles wie heute.
3. Das README erklärt, wann das sinnvoll ist (bei `WEB_BIND=0.0.0.0`).

---

## Weitere Ideen, nur angerissen

- **Interpreten-Seite:** alle Songs eines Interpreten, Ø Bewertung, häufigste Kategorien, „Mehr von diesem Interpreten“ (A11).
- **Zeitverlauf in der Auswertung:** Songs pro Monat hinzugefügt; wie sich Genres und Energie über die Zeit verschieben.
- **„Was höre ich jetzt?“:** Stimmung wählen und einen (oder fünf) passende Songs direkt abspielen.
- **Einschätzung per KI** (optional, mit eigenem API-Schlüssel): Stimmung und Energie bekannter Songs vorschlagen lassen. Das widerspricht allerdings dem Grundsatz, möglichst wenig nach außen zu geben; A6 ist die lokale Alternative.

---

## Prüfungen vom 20.11.2026

| Punkt | Ergebnis | Folge |
|---|---|---|
| song.link-Schnittstelle für A5 | Seit 31.07.2026 abgeschaltet: `401 PUBLIC_API_ACCESS_DEPRECATED`, keine neuen Schlüssel, Freischaltung nur auf Antrag bei „berechtigtem, dauerhaftem Bedarf“ | A5 nutzt jetzt Wikidata und MusicBrainz (offiziell, zusammen 6 von 6 Testsongs), dazu die inoffizielle Suche von YouTube Music als abschaltbaren Rückfall |
| Playlist-Export der Apple-Music-App unter Windows (A10) | Gibt es nicht; iTunes verwaltet neben den neuen Apps nur noch Podcasts und Hörbücher; Export als Text nur noch in der Musik-App auf dem Mac | Neue Story A17: Playlist über ihren Teilen-Link übernehmen (getestet mit Apples und eigenen Playlists, bis 300 Songs); zusätzlich CSV aus Fremddiensten |
| Sicherheitsregeln für Hörprobe und YouTube-Player (A9) | Heute blockiert; mit `media-src` und `frame-src` frei. Der Player braucht wegen `Referrer-Policy: no-referrer` zusätzlich `referrerpolicy` am iframe, sonst „Error 153“ | Genaue Angaben in A9 |

Quellen:

- [Abkündigung der Songlink-/Odesli-Schnittstelle](https://linktree.notion.site/API-d0ebe08a5e304a55928405eb682f6741)
- [Apple Music User Guide for Windows](https://support.apple.com/guide/music-windows/welcome/windows) (kein Kapitel zum Export)
- [Apple: Apple Music, Apple TV, Apple Devices und iTunes für Windows](https://support.apple.com/118290) (iTunes nur noch für Podcasts und Hörbücher)
- [Apple Community: „Export a playlist from the Apple Music app on Windows?“](https://discussions.apple.com/thread/255833478)
- [Apple: Playlists in iTunes auf dem PC sichern](https://support.apple.com/guide/itunes/save-a-copy-of-your-playlists-itns2998/windows) (gilt nur für iTunes)
- [TuneMyMusic: Apple Music to File](https://www.tunemymusic.com/transfer/apple-music-to-file)
- [PlaylistGo: Testbericht zu TuneMyMusic](https://www.playlistgo.io/reviews/tunemymusic-alternative/) (Grenze von 500 Songs in der kostenlosen Fassung)

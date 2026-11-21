# Ideen als User Stories

Stand 21.11.2026 · Grundlage: Branch `feature/song-hinzufuegen-stories` (Datenbank bis Migration 011 „Sprache“) · Umgesetzt und deshalb entfernt: A1–A7, A9, A13, A15 und A16 (je ein Commit auf dem Branch). Dabei neu entstanden: A18–A21, B6 und C9, siehe auch [Prüfungen vom 21.11.2026](#prüfungen-vom-21112026).

Die Stories sind nach Bereichen gruppiert, der Schwerpunkt liegt auf **Song hinzufügen**. Jede Story hat eine Priorität (hoch / mittel / niedrig) und eine grobe Größe:

- **S**: ein überschaubarer Schritt, meist nur Oberfläche oder ein Endpunkt
- **M**: mehrere Teile (Oberfläche, API, eventuell Migration, Tests)
- **L**: eigener kleiner Arbeitsablauf mit Verarbeitung im Hintergrund

## Überblick

| ID | Story | Priorität | Größe |
|---|---|---|---|
| | **Song hinzufügen** | | |
| A8 | Bessere Trefferliste der Online-Suche | mittel | S–M |
| A10 | Viele Songs auf einmal: Textliste oder CSV | mittel | L |
| A11 | Album oder Interpret durchgehen | mittel | M |
| A12 | Beim Anlegen direkt in Playlists legen | mittel | S |
| A14 | YouTube-Importe aus dem iTunes-Katalog vervollständigen | mittel | M |
| A17 | Apple-Music-Playlist per Link übernehmen | mittel | M |
| A18 | YouTube-Links: Rückfall über die Suche von YouTube Music (Entscheidung offen) | niedrig | S–M |
| A19 | Entwurf eines neuen Songs fortsetzen | niedrig | S |
| A20 | Aus anderen Apps direkt in die Merkliste teilen | niedrig | M |
| A21 | Tonart und „Explicit“ für vorhandene Songs nachtragen | mittel | S–M |
| | **Bibliothek pflegen** | | |
| B1 | Schnell nachpflegen, Song für Song | hoch | M |
| B2 | Kategorie „Mitsingen“ in die neue Skala überführen | hoch | S |
| B3 | Mehr Filter, Sortierungen und Spalten in der Songliste | mittel | M |
| B4 | Mehrere Songs auf einmal bearbeiten | mittel | M |
| B5 | Playlists eines Songs sehen, Song zu Playlist hinzufügen | mittel | S |
| B6 | Genre-Erkennung: Stimmungs-Tags nicht als Genre werten | mittel | S |
| | **Playlists und Generator** | | |
| C1 | Tempo (BPM) im Generator | mittel | S |
| C2 | Songs im Vorschlag festhalten | mittel | S |
| C3 | Mehr Abwechslung zwischen Playlists | mittel | S |
| C4 | Playlist ausgehend von einem Song | mittel | M |
| C5 | Playlist per Ziehen umsortieren | mittel | S |
| C6 | Energie- und Tempoverlauf einer Playlist | niedrig | S |
| C7 | Playlist auffrischen, Verknüpfung behalten | niedrig | S |
| C8 | Intelligente Playlists | niedrig | M–L |
| C9 | Harmonische Übergänge nach Tonart | niedrig | M |
| | **Kategorien, Auswertung, Betrieb** | | |
| D1 | Sicherung aus der App und automatisch | hoch | M |
| D2 | Kategorien gruppieren und sortieren | mittel | M |
| D3 | Kategorien zusammenführen | niedrig | S |
| D4 | Auswertung anklickbar | mittel | S |
| D5 | Nur neue „Mag ich“-Videos zeigen | niedrig | S |
| D6 | Zugriff aus dem Heimnetz absichern | niedrig | S |

## Empfohlene Reihenfolge

1. **Vor dem nächsten Update der echten App:** D1 (Sicherung). Live läuft Migration 009; mit diesem Branch kommen 010 und 011 dazu (auf einer Kopie der Bibliothek getestet).
2. **Schnelle Gewinne:** B2, C1, B6 und A21. Klein, sofort spürbar; A21 füllt die neuen Angaben aus A15 für alle vorhandenen Songs.
3. **Bibliothek vollständig machen:** B1 (Mitsingen und Sprache fehlen allen bisherigen Songs).
4. Danach nach Lust und Laune: A10 mit A17, A11, A8, B3/B4, C2 bis C5.
5. **Entscheidung offen:** A18 (inoffizielle Schnittstelle von YouTube Music).

## Für alle Stories

- **Online-Dienste:** Wie bei Tempo und Genres wird nur ein Treffer übernommen, bei dem Titel und Interpret passen (Regeln in `backend/src/services/songMatching.ts`, für Dubletten gespiegelt in `frontend/src/lib/songMatching.ts`), und nur in leere Felder. Selbst eingetragene Werte bleiben. Jeder neue Dienst kommt in den README-Abschnitt „Was nach außen geht“. Fällt ein Dienst aus, funktioniert alles andere weiter.
- **Datenbank:** Neue Spalten oder Tabellen kommen als neue Migration; die nächste freie Nummer ist 012.
- **Aufträge über die ganze Bibliothek:** `LibraryJobs` mit `/api/jobs` (seit A5 und A7) übernimmt Fortschritt, Anhalten und die Fundliste; die Oberfläche hält `useLibraryJob`. Für A10, A14 und A21 wiederverwenden.
- **Tests:** API-Tests laufen nur gegen die Test-Datenbank des getrennten Stacks (`-p musiktest`, Port 5433), nie gegen die echte Bibliothek auf Port 8090.

---

## A · Song hinzufügen

### A8 · Bessere Trefferliste der Online-Suche

Priorität mittel · Größe S–M

> Als Nutzer möchte ich in der Trefferliste schneller die richtige Fassung finden, damit ich nicht versehentlich Karaoke-, Cover- oder Sampler-Versionen übernehme.

**Akzeptanzkriterien**

1. Die Suche startet von selbst, sobald man kurz (etwa 400 ms) nicht tippt und mindestens drei Zeichen eingegeben hat. Enter sucht weiterhin sofort.
2. Mit den Pfeiltasten wählt man einen Treffer, Enter übernimmt ihn.
3. Treffer tragen weitere Kennzeichen neben „Schon in deiner Bibliothek“: „Sampler“, „Live“, „Remix“, „Explicit“.
4. Karaoke-, Tribute- und Cover-Fassungen („Karaoke“, „Originally Performed by“, „Made Famous by“, Interpret passt nicht zur Suche) rutschen ans Ende.
5. Unter der Liste lädt „Mehr Treffer“ weitere (heute fest 12).

**Hinweise zur Umsetzung**

- Die iTunes-Antwort enthält schon `collectionArtistName` (bei Samplern „Various Artists“), `trackId` und `collectionId`; `mapItunesTrack` übernimmt sie bisher nicht. „Explicit“ bringt der Treffer seit A15 als `explicit` mit.
- `isOtherVersion` aus `songMatching.ts` erkennt Remix, slowed usw. bereits.
- Die iTunes-API erlaubt nur etwa 20 Anfragen pro Minute. Deshalb die Verzögerung beim Tippen und keine Suche pro Tastendruck.

### A10 · Viele Songs auf einmal: Textliste oder CSV

Priorität mittel · Größe L

> Als Nutzer möchte ich eine Liste von Songs (aus einer Notiz, einer Tabelle oder einem Export) auf einmal übernehmen, damit ich größere Mengen nicht einzeln suchen und anlegen muss.

**Akzeptanzkriterien**

1. Neben „Song hinzufügen“ gibt es **„Mehrere hinzufügen“**.
2. **Textliste:** ein Song pro Zeile. Erkannt werden „Interpret – Titel“, „Interpret - Titel“, „Titel von Interpret“, „Titel by Interpret“, Tabulator-getrennte Spalten und Links (wie im Suchfeld des Song-Dialogs).
3. **CSV:** Die eigene Exportdatei der App wird vollständig wieder eingelesen (Kategorien über ihren Namen, Bewertung, Energie, Mitsingen, Tonart, Explicit, Sprache, Links, Notizen). Bei fremden CSV-Dateien ordnet man die Spalten einmal zu (Titel, Interpret, Album …).
4. Die App sucht jede Zeile im iTunes-Katalog und zeigt eine Prüfliste wie beim YouTube-Import: Eingabezeile, bester Treffer (Cover, Titel, Interpret, Album, Jahr) und ein Status: **eindeutig** (angehakt), **unsicher** (Auswahl unter mehreren Treffern), **nicht gefunden** (so übernehmen oder weglassen), **schon in der Bibliothek** (nicht angehakt).
5. Gemeinsame Kategorien für alle neuen Songs sind wählbar, wie beim YouTube-Import.
6. „23 Songs übernehmen“ legt die Songs an. Tempo, Genres, Jahr und YouTube-Links (wie im Song-Dialog über Wikidata und MusicBrainz) werden im Hintergrund nachgetragen.
7. Danach führt **„Jetzt einordnen“** direkt in B1, und zwar nur mit diesen Songs.
8. Bis zu 200 Zeilen pro Durchgang. Die Suche zeigt ihren Fortschritt, und man darf die Seite währenddessen verlassen.

**Hinweise zur Umsetzung**

- Wegen der iTunes-Grenze (etwa 20 Anfragen pro Minute) als Auftrag im Backend mit Fortschritt (`LibraryJobs`, `/api/jobs`). 200 Zeilen dauern damit rund 10 Minuten. Links in der Liste erkennt `parseMusicLink` (`linkLookup.ts`).
- Die Prüfliste des YouTube-Imports (`YoutubeImportPage.tsx`) sollte ein gemeinsamer Baustein werden, damit A10 und A11 dieselbe Oberfläche nutzen.
- **Apple-Music-Playlists, geprüft am 20.11.2026:** Die Apple-Music-App für Windows kann keine Playlists exportieren. Apples Anleitung für die Windows-App hat dazu kein Kapitel, Nutzer in der Apple Community bestätigen das, und iTunes verwaltet neben den neuen Apps nur noch Podcasts und Hörbücher. Den Export als Textdatei gibt es nur noch in der Musik-App auf dem Mac („Ablage → Mediathek → Playlist exportieren“). Unter Windows ist A17 der bessere Weg (Playlist über ihren Teilen-Link übernehmen).
- Der CSV-Import sollte außerdem Dateien von Fremddiensten wie TuneMyMusic („Apple Music to File“) verstehen. Dafür braucht der Dienst allerdings Zugriff auf das Apple-Music-Konto; kostenlos laut einem Testbericht bis 500 Songs.

### A11 · Album oder Interpret durchgehen

Priorität mittel · Größe M

> Als Nutzer möchte ich von einem Treffer aus das ganze Album oder die bekanntesten Songs des Interpreten sehen und mehrere auf einmal übernehmen, damit ich ein Lieblingsalbum in einem Schritt erfasse.

**Akzeptanzkriterien**

1. In der Trefferliste und auf der Karte der Schnellerfassung gibt es „Ganzes Album“ und „Mehr von diesem Interpreten“.
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

- Gleiches Muster wie Tempo und Genres (`SongQueue`), Pause wegen der iTunes-Grenze etwa 3 Sekunden; die einmalige Aktion als Auftrag über `/api/jobs`.
- Ein neuer Apple-Music-Link bringt Hörprobe (A9) und „Explicit“ (A15) mit; das Jahr der Erstveröffentlichung (A7) kommt schon mit den Genres.

### A17 · Apple-Music-Playlist per Link übernehmen

Priorität mittel · Größe M

> Als Nutzer von Apple Music möchte ich eine meiner Playlists über ihren Teilen-Link in die App holen, damit ich bestehende Playlists nicht Song für Song nachbauen muss, auch unter Windows, wo die Apple-Music-App keine Playlists exportieren kann.

**Geprüft am 20.11.2026:** Die öffentliche Seite einer geteilten Playlist enthält die Songliste samt Apple-Track-IDs. Bei Apples eigenen Playlists stehen sie als strukturierte Daten in der Seite (`application/ld+json`, Typ `MusicPlaylist`), bei eigenen Playlists (`pl.u-…`) in den eingebetteten Seitendaten (`serialized-server-data`, Songs mit `storeAdamID`). Eine einzige iTunes-Abfrage mit allen IDs liefert dann die vollständigen Angaben: 100 IDs ergaben 100 Songs in gut einer Sekunde. Grenze: Bei Apples Playlist „10 Jahre Apple Music: Top Songs“ (laut Apple 500 Songs) enthielt die Seite nur 300.

**Akzeptanzkriterien**

1. „Mehrere hinzufügen“ (A10) und das Suchfeld im Song-Dialog erkennen Links der Form `music.apple.com/<land>/playlist/<name>/pl.…`. Heute antwortet das Suchfeld darauf mit „Ganze Playlists lassen sich hier noch nicht übernehmen“ (`parseMusicLink` in `linkLookup.ts` erkennt sie schon).
2. Die App liest Name und Songs der Playlist und zeigt die Prüfliste aus A10: jeder Song mit Cover, Titel, Interpret, Album und Jahr. Songs, die schon in der Bibliothek sind, sind markiert und nicht angehakt.
3. Die Option **„Auch als Playlist anlegen“** ist vorausgewählt. Sie legt in der App eine Playlist mit demselben Namen und derselben Reihenfolge an, mit den neuen und den schon vorhandenen Songs.
4. Gemeinsame Kategorien für die neuen Songs sind wählbar. Tempo, Genres und YouTube-Links (über Wikidata und MusicBrainz) werden im Hintergrund ergänzt.
5. Enthält die Seite genau 300 Songs, weist die App darauf hin, dass längere Playlists abgeschnitten sein können.
6. Bei einer nicht geteilten Playlist oder einem kaputten Link erklärt die App, was zu tun ist: „Diese Playlist ist nicht öffentlich. In Apple Music ‚Teilen → Link kopieren‘ wählen.“
7. Ausbaustufe: Die App merkt sich den Link an der Playlist. „Mit Apple Music abgleichen“ holt später nur neue Songs dazu.

**Hinweise zur Umsetzung**

- Die Seite mit gewöhnlichem Browser-User-Agent abrufen. Die IDs am besten unabhängig vom Seitenaufbau einsammeln: alle Song-Links der Seite (`/song/<name>/<ID>` und `/album/<name>/<ID>?i=<ID>`) in ihrer Reihenfolge, doppelte weg. Das klappt für beide Seitenformen und übersteht kleinere Umbauten besser als das Auslesen bestimmter JSON-Felder.
- Danach `https://itunes.apple.com/lookup?id=<ID1>,<ID2>,…&country=<ITUNES_COUNTRY>` in Paketen zu 100 IDs (getestet); `mapItunesTrack` passt.
- Eine offizielle Schnittstelle ist das nicht (die verlangt die kostenpflichtige Entwickler-Mitgliedschaft). Wie bei songbpm.com kann eine Änderung der Seite das Einlesen stoppen; dann sagt die App das und verweist auf die Textliste (A10).
- README „Was nach außen geht“: Der Playlist-Link geht an Apple.
- Offizielle Alternative für die ganze Mediathek ist die Datenkopie unter privacy.apple.com. Sie enthält laut älteren Beschreibungen „Apple Music Library Tracks“ und „Apple Music Library Playlists“ als JSON, dauert aber bis zu sieben Tage, und ihr Aufbau ist nicht dokumentiert. Erst mit einem echten Export prüfen, bevor man dafür einen Import baut.

### A18 · YouTube-Links: Rückfall über die Suche von YouTube Music

Priorität niedrig · Größe S–M · **Entscheidung offen**

> Als Nutzer möchte ich, dass die App auch für weniger bekannte Songs einen YouTube-Link findet, damit ich nicht von Hand suchen muss, wenn Wikidata und MusicBrainz nichts wissen.

**Heute:** Seit A5 sucht der Song-Dialog (wie auch „Fehlende YouTube-Links ergänzen“ auf der Seite „YouTube“) bei Wikidata und MusicBrainz. Beide kennen vor allem bekannte Songs. Der in A5 geplante dritte Weg über die Suche von YouTube Music fehlt: Beim Entwickeln am 21.11.2026 wurde der Zugriff auf diese inoffizielle Schnittstelle (`youtubei/v1/search`) nicht freigegeben, ihre Antworten sind deshalb ungeprüft.

**Akzeptanzkriterien**

1. Finden Wikidata und MusicBrainz nichts, fragt die App die Suche von YouTube Music (Filter „Songs“).
2. Übernommen wird nur ein Treffer, bei dem Titel, Interpret und Fassung passen (`sameSong` aus `songMatching.ts`) und die Dauer höchstens 5 Sekunden abweicht, wenn sie bekannt ist.
3. Wie bei den anderen Quellen: Prüfung über oEmbed, Quelle unter dem Feld („gefunden über YouTube Music“), nur leere Felder.
4. Abschaltbar mit `YOUTUBE_MUSIC_SEARCH=off` in der `.env`; dann gelten nur die offiziellen Quellen.

**Hinweise zur Umsetzung**

- Vorher entscheiden: Automatisierter Zugriff ist in den YouTube-Nutzungsbedingungen nicht vorgesehen, und die Schnittstelle kann sich jederzeit ändern (siehe Prüfungen vom 20.11.2026). Der Standard sollte deshalb eher „aus“ sein.
- Als dritte Quelle in `YoutubeLinkService` (`backend/src/services/youtubeLinks.ts`) nach `#fromMusicBrainz` einhängen; die Antwort tolerant auswerten wie bei songbpm.com.
- README „Was nach außen geht“ ergänzen.

### A19 · Entwurf eines neuen Songs fortsetzen

Priorität niedrig · Größe S

> Als Nutzer möchte ich nach einem versehentlichen „Verwerfen“ oder einem Neuladen der Seite meinen halb ausgefüllten Song wiederfinden, damit keine Einordnung verloren geht.

**Heute:** Seit A2 fragt der Dialog vor dem Schließen nach („Änderungen verwerfen?“). Lädt die Seite neu oder war „Verwerfen“ zu schnell geklickt, ist der Entwurf weg. (War als Ausbaustufe von A2 notiert.)

**Akzeptanzkriterien**

1. Solange „Song hinzufügen“ ungespeicherte Angaben hat, liegt der Entwurf im `sessionStorage` des Browsers, nicht auf dem Server.
2. Beim nächsten Öffnen von „Song hinzufügen“ erscheint „Entwurf von eben fortsetzen? „Hurt“ von Johnny Cash, vor 3 Minuten“ mit „Fortsetzen“ und „Verwerfen“.
3. Nach dem Speichern ist der Entwurf weg; Entwürfe älter als ein Tag verfallen.
4. Das Bearbeiten vorhandener Songs bleibt außen vor.

**Hinweise zur Umsetzung**

- `FormState` in `SongFormDialog.tsx` lässt sich direkt speichern; `sameForm` entscheidet schon heute, ob es ungespeicherte Angaben gibt.

### A20 · Aus anderen Apps direkt in die Merkliste teilen

Priorität niedrig · Größe M

> Als Nutzer möchte ich einen Song am Handy direkt aus Apple Music, YouTube oder Shazam über „Teilen“ an die App schicken, damit ich ihn nicht erst kopieren und in die Merkliste einfügen muss.

**Heute:** Die Merkliste (A13) nimmt Text und Links über ein Eingabefeld an; vom Handy erreichbar ist sie mit `WEB_BIND=0.0.0.0`. (War als Ausbaustufe von A13 notiert.)

**Akzeptanzkriterien**

1. Die App lässt sich als Web-App auf dem Startbildschirm installieren (Manifest, Symbol, Name „Musik“).
2. Im „Teilen“-Menü der anderen Apps erscheint „Musik“; der geteilte Link oder Text landet als Eintrag in der Merkliste, mit kurzer Bestätigung „Vorgemerkt“.
3. Ohne Installation bleibt alles wie heute.

**Hinweise zur Umsetzung**

- Web Share Target (`share_target` im Manifest) und Service Worker setzen HTTPS voraus. Im Heimnetz (`http://192.168.…`) geht das nur mit einem lokalen Reverse-Proxy samt Zertifikat; vorher D6 (Passwort) umsetzen.
- Den Endpunkt gibt es schon: `POST /api/merkliste`.

### A21 · Tonart und „Explicit“ für vorhandene Songs nachtragen

Priorität mittel · Größe S–M

> Als Nutzer möchte ich, dass auch meine schon erfassten Songs eine Tonart und die Angabe zu expliziten Texten bekommen, damit „Ohne explizite Texte“ im Generator für die ganze Bibliothek gilt.

**Heute:** Seit A15 kommen Tonart (songbpm.com) und „Explicit“ (Apple) beim Anlegen im Dialog mit. Allen Songs aus der Zeit davor fehlen beide Angaben; „Ohne explizite Texte“ lässt sie deshalb drin.

**Akzeptanzkriterien**

1. Eine Aktion „Fehlende Angaben nachtragen“ (etwa bei „Vollständigkeit der Angaben“ in der Auswertung) geht die Bibliothek im Hintergrund durch, mit Fortschritt und Anhalten.
2. „Explicit“ kommt über die Track-ID aus dem gespeicherten Apple-Music-Link (eine iTunes-Abfrage für bis zu 100 Songs), die Tonart von songbpm.com (eine Anfrage pro Song, mit Pausen).
3. Gefüllt werden nur leere Angaben; eine Zusammenfassung nennt, was ergänzt wurde.
4. „Vollständigkeit der Angaben“ zeigt auch Tonart und „Explicit“.

**Hinweise zur Umsetzung**

- `LibraryJobs` und `/api/jobs` (A5, A7) übernehmen Fortschritt und Anhalten; `lookupItunes` (A4) nimmt bis zu 100 Track-IDs je Abfrage.
- Die iTunes-Suche liefert bei expliziten Songs meist die entschärfte Fassung („cleaned“); sie zählt als explizit (siehe Prüfungen vom 21.11.2026). Für den Lookup per Track-ID gilt dasselbe.

---

## B · Bibliothek pflegen

### B1 · Schnell nachpflegen, Song für Song

Priorität hoch · Größe M

> Als Nutzer möchte ich fehlende Angaben in einem Rutsch nachtragen, Song für Song und mit der Tastatur, damit meine Bibliothek schnell vollständig ist und der Generator besser trifft.

**Heute:** Allen Songs aus der Zeit vor dem Mitsingen-Feld fehlt diese Angabe; aus YouTube übernommene Songs haben weder Bewertung noch Energie. Nachtragen heißt für jeden Song: Dialog öffnen, nach unten scrollen, klicken, speichern, schließen.

**Akzeptanzkriterien**

1. Einstieg über „Nachpflegen“ auf der Songliste, über jede Zeile von „Vollständigkeit der Angaben“ in der Auswertung („Mitsingen nachpflegen – 183 Songs“) und nach einem Sammelimport (A10).
2. Vorab wählt man, was ergänzt werden soll (Mitsingen, Energie, Bewertung, Sprache, Kategorien; mehrere möglich) und für welche Songs: alle, denen eine dieser Angaben fehlt, oder die aktuelle Auswahl der Songliste.
3. Für jeden Song gibt es eine Karte: großes Cover, Titel, Interpret, Jahr, Genres, Tempo, vorhandene Kategorien und Reinhören direkt in der Karte (`PreviewButton` und `YoutubeEmbed` aus A9).
4. Tastatur: **1–5** setzt die aktive Skala, **Tab** wechselt zur nächsten, **Enter** speichert und geht weiter, **→** überspringt, **←** geht zurück, **Esc** beendet.
5. Jede Karte wird sofort gespeichert; wer abbricht, verliert nichts.
6. Der Fortschritt steht als „37 von 183“ mit Balken da, am Ende eine Zusammenfassung („179 ergänzt, 4 übersprungen“).
7. Die Reihenfolge ist wählbar: nach Interpret (ähnliche Songs hintereinander, das hilft beim einheitlichen Einschätzen) oder zufällig.
8. Die Karte zeigt die Vorschläge aus ähnlichen Songs (`librarySuggestions` aus A6) und den Sprach-Vorschlag (`suggestLanguage` aus A16).

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

**Heute:** Es gibt die Freitextsuche, Kategorien, „ohne Kategorie“, die Sprache (seit A16, auch „ohne Angabe“) und acht Sortierungen. Energie, Mitsingen, Tempo und Genres sind in der Liste weder zu sehen noch zu filtern.

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

### B6 · Genre-Erkennung: Stimmungs-Tags nicht als Genre werten

Priorität mittel · Größe S

> Als Nutzer möchte ich, dass die automatisch übernommenen Genres stimmen, damit Filter, Generator und Auswertung nach Genre nicht danebenliegen.

**Heute:** Beim Testen am 21.11.2026 brachte MusicBrainz für „Wonderwall“ von Oasis „Romantic Music“ (Hauptgenre Klassik) und für „Folsom Prison Blues“ von Johnny Cash „Klassik“ neben Country. Ursache im ersten Fall: Die Genre-Liste führt „romantic“ als andere Schreibweise von „Romantic Music“ (die Epoche der Klassik), MusicBrainz-Nutzer taggen damit aber die Stimmung.

**Akzeptanzkriterien**

1. Tags, die meist eine Stimmung oder Wertung meinen („romantic“, „classic“, „chill“, „epic“ …), führen nicht mehr zu einem Genre.
2. Ein Hauptgenre, das nur wenige Stimmen trägt und nicht zu den übrigen passt (Klassik neben Rock oder Country), wird höchstens vorgeschlagen, nicht übernommen.
3. Tests mit beiden Beispielen.

**Hinweise zur Umsetzung**

- Die anderen Schreibweisen stehen in `genre_aliases` (Migration 006); Änderungen kommen als neue Migration. Die Auswahl steckt in `chooseGenres` in `genreLookup.ts`.
- Woher „Klassik“ bei „Folsom Prison Blues“ kommt, ist noch offen (vermutlich ein Tag wie „classic“ oder „classical“).
- Bereits übernommene Genres ändert das nicht; dafür eignet sich B4 (mehrere Songs auf einmal bearbeiten).

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

### C9 · Harmonische Übergänge nach Tonart

Priorität niedrig · Größe M

> Als Nutzer möchte ich, dass aufeinanderfolgende Songs einer Playlist harmonisch zueinander passen, damit die Übergänge weicher klingen, wie bei einem DJ-Set.

**Heute:** Seit A15 kennt die App die Tonart vieler Songs (von songbpm.com, etwa „A“ oder „C♯/D♭“). Der Generator nutzt sie nicht. (War in A15 als „später denkbar“ notiert.)

**Akzeptanzkriterien**

1. Neue Reihenfolge „Harmonisch“: Aufeinanderfolgende Songs liegen im Quintenzirkel nah beieinander (gleiche Tonart, Quinte, Quarte oder Paralleltonart).
2. Songs ohne Tonart kommen dorthin, wo sie am wenigsten stören; die Beschreibung des Vorschlags nennt ihre Zahl.
3. Gespeicherte Playlists merken sich die Reihenfolge wie die übrigen.

**Hinweise zur Umsetzung**

- songbpm.com unterscheidet Dur und Moll nicht immer erkennbar; Schreibweisen wie „C♯/D♭“ und „Am“ vorher vereinheitlichen (etwa als Camelot-Schlüssel).
- `arrange` in `generator.ts`, neuer Wert in `PLAYLIST_ORDERS` und `ORDER_OPTIONS`.

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

1. Ein Klick auf einen Balken (Kategorie, Interpret, Haupt- und Untergenre, Jahrzehnt, Songlänge, Bewertung, Energie, Mitsingen, Sprache, jeweils auch „ohne“) öffnet die Songliste mit genau diesem Filter.
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
- **Einschätzung per KI** (optional, mit eigenem API-Schlüssel): Stimmung und Energie bekannter Songs vorschlagen lassen. Das widerspricht allerdings dem Grundsatz, möglichst wenig nach außen zu geben; die Vorschläge aus ähnlichen Songs der Bibliothek (seit A6) sind die lokale Alternative.

---

## Prüfungen vom 21.11.2026

Beim Umsetzen von A1–A7, A9, A13, A15 und A16:

| Punkt | Ergebnis | Folge |
|---|---|---|
| Sprache der Texte bei MusicBrainz (A16) | Die Aufnahmesuche liefert keine Sprache mit (`text-representation` fehlt in den Treffern) | Die Sprache schlägt die App nur nach Genre und Titel vor |
| Erstveröffentlichung bei MusicBrainz (A7) | Bei bekannten Songs liefert die Aufnahmesuche vor allem Live- und Sampler-Fassungen, die Originalsingle fehlt oft unter den 25 Treffern; dazu antwortet MusicBrainz zeitweise mit 503 | Zusätzlich eine Suche nach Singles und EPs mit dem Titel; scheitert sie, gibt es kein Jahr statt eines geratenen |
| „Explicit“ bei iTunes (A15) | Die Suche liefert bei expliziten Songs meist die entschärfte Fassung („cleaned“), auch mit `explicit=Yes` | „cleaned“ zählt als explizit |
| Suche von YouTube Music (A5) | Zugriff auf die interne Schnittstelle beim Entwickeln nicht freigegeben, Antworten ungeprüft | Neue Story A18, Entscheidung offen |
| Gebauter Container (A9) | Hörprobe von `audio-ssl.itunes.apple.com` und Player von `youtube-nocookie.com` laufen unter den neuen Regeln `media-src` und `frame-src` ohne Fehler | – |
| Migrationen 010 und 011 | Auf einer Kopie der echten Bibliothek (37 Songs, Stand 009) eingespielt: sauber, alle Songs unverändert, neue Angaben leer | Vor dem Update der echten App trotzdem sichern (D1 bzw. README) |

## Prüfungen vom 20.11.2026

| Punkt | Ergebnis | Folge |
|---|---|---|
| song.link-Schnittstelle für A5 (umgesetzt) | Seit 31.07.2026 abgeschaltet: `401 PUBLIC_API_ACCESS_DEPRECATED`, keine neuen Schlüssel, Freischaltung nur auf Antrag bei „berechtigtem, dauerhaftem Bedarf“ | A5 nutzt jetzt Wikidata und MusicBrainz (offiziell, zusammen 6 von 6 Testsongs); der Rückfall über die inoffizielle Suche von YouTube Music ist noch offen (A18) |
| Playlist-Export der Apple-Music-App unter Windows (A10) | Gibt es nicht; iTunes verwaltet neben den neuen Apps nur noch Podcasts und Hörbücher; Export als Text nur noch in der Musik-App auf dem Mac | Neue Story A17: Playlist über ihren Teilen-Link übernehmen (getestet mit Apples und eigenen Playlists, bis 300 Songs); zusätzlich CSV aus Fremddiensten |
| Sicherheitsregeln für Hörprobe und YouTube-Player (A9, umgesetzt) | Heute blockiert; mit `media-src` und `frame-src` frei. Der Player braucht wegen `Referrer-Policy: no-referrer` zusätzlich `referrerpolicy` am iframe, sonst „Error 153“ | So umgesetzt in A9 (`frontend/nginx/default.conf.template`, `YoutubeEmbed`) |

Quellen:

- [Abkündigung der Songlink-/Odesli-Schnittstelle](https://linktree.notion.site/API-d0ebe08a5e304a55928405eb682f6741)
- [Apple Music User Guide for Windows](https://support.apple.com/guide/music-windows/welcome/windows) (kein Kapitel zum Export)
- [Apple: Apple Music, Apple TV, Apple Devices und iTunes für Windows](https://support.apple.com/118290) (iTunes nur noch für Podcasts und Hörbücher)
- [Apple Community: „Export a playlist from the Apple Music app on Windows?“](https://discussions.apple.com/thread/255833478)
- [Apple: Playlists in iTunes auf dem PC sichern](https://support.apple.com/guide/itunes/save-a-copy-of-your-playlists-itns2998/windows) (gilt nur für iTunes)
- [TuneMyMusic: Apple Music to File](https://www.tunemymusic.com/transfer/apple-music-to-file)
- [PlaylistGo: Testbericht zu TuneMyMusic](https://www.playlistgo.io/reviews/tunemymusic-alternative/) (Grenze von 500 Songs in der kostenlosen Fassung)

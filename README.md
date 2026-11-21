# Musik

Eine App, in der ich meine beliebte Musik speichern und richtig analysieren kann und damit die richtigen Playlists erstellen kann.

Gespeichert werden nur Angaben und Links zu den Songs – **keine Audiodateien**. Angehört wird auf Apple Music, YouTube oder YouTube Music; zum kurzen Reinhören spielt der Song-Dialog die 30-Sekunden-Hörprobe von Apple oder das YouTube-Video direkt ab.

## Was die App kann

- **Songs** mit Titel, Interpret, Album, Dauer, Jahr, Genres, BPM, Tonart, Bewertung (1–5 Sterne), Energie (1–5), Mitsingen (1–5: von „lieber zuhören“ bis „lauthals mitsingen“), der Angabe, ob der Text explizit ist, Notizen und Cover.
- **Genres mit Haupt- und Untergenres**: 17 grobe Hauptgenres (Pop, Rock, Hip-Hop, Electronic, R&B & Soul, Jazz …) und rund 1.250 Untergenres wie Alternative Rock, Punk Rock oder Dance-Pop, nach der Wikipedia-Liste [List of music genres and styles](https://en.wikipedia.org/wiki/List_of_music_genres_and_styles). Ein Untergenre bringt sein Hauptgenre mit (Alternative Rock → Rock), manche gehören zu zweien (Pop Rock → Pop und Rock). Ein Song kann mehrere Genres haben. Im Song-Dialog steht die Auswahl als Baum: Ein Klick auf ein Hauptgenre zeigt seine bekanntesten Untergenres (10 bis 25, dazu die schon genutzten), „Mehr anzeigen“ den Rest; das Kästchen vor einem Hauptgenre wählt das Hauptgenre selbst. Tippen durchsucht die ganze Liste, auch nach anderen Schreibweisen („rap“ findet Hip-Hop). Was die Liste nicht kennt, wird als eigenes Genre angelegt und dem Hauptgenre zugeordnet, das im Namen steckt („New wave pop“ → Pop). Generator und Auswertung arbeiten mit Haupt- und Untergenres.
  Die Online-Suche holt die Angaben samt Cover und Apple-Music-Link aus dem iTunes-Katalog, sodass meist nur noch Kategorien und Bewertung fehlen.
  Tempo (BPM) und Genres schlägt der Song-Dialog automatisch nach, sobald Titel und Interpret feststehen: Tempo und Tonart auf [songbpm.com](https://songbpm.com), die Genres auf [MusicBrainz](https://musicbrainz.org). Ob der Text als explizit gilt, bringt ein Treffer von Apple mit (eine entschärfte Fassung zählt als explizit, weil das Original es ist); im Dialog lässt es sich ändern. Übernommen wird nur ein Treffer, bei dem Titel und Interpret passen, und nur in leere Felder – selbst eingetragene Werte bleiben. Weitere Genres von MusicBrainz stehen als Vorschläge unter dem Feld. Von MusicBrainz kommt auch das Jahr der Erstveröffentlichung (Single, EP oder Album, ohne Sampler, Live- und Remix-Alben): Stammt das Jahr des Treffers von einer Compilation oder Neuauflage, ersetzt der Dialog es und bietet das alte zum Zurückholen an. Bei Songs aus einem YouTube-Import werden Tempo, Genres und fehlende Jahre im Hintergrund nachgetragen. Für die vorhandene Bibliothek prüft „Erscheinungsjahre prüfen“ (unter Auswertung → Jahrzehnte) alle Jahre auf einmal.
- **Merkliste** für unterwegs: einen gerade gehörten Song in Sekunden vormerken („Interpret – Titel“ oder ein Link), am Handy mit einer Hand. „Erfassen“ öffnet später den Song-Dialog mit dem vorgemerkten Text; nach dem Speichern verschwindet der Eintrag. Vorgemerktes zählt nicht als Song. Vom Handy erreichbar ist die App mit `WEB_BIND=0.0.0.0` (siehe [Einstellungen](#einstellungen)).
- **Kategorien** wie „melancholisch“ oder „aufpushend“: frei anlegbar, farbig, beliebig viele pro Song. 20 Kategorien sind als Startpunkt angelegt – Stimmungen wie „verträumt“ oder „episch“ und Anlässe wie „Sport“, „Roadtrip“ oder „Einschlafen“.
- **Links zu Apple Music, YouTube und YouTube Music** an jedem Song. Ist ein Link gespeichert, führt der Knopf direkt zum Song, sonst zur Suche auf der Plattform. Ein YouTube-Link genügt auch für YouTube Music. Den YouTube-Link sucht der Song-Dialog selbst bei [Wikidata](https://www.wikidata.org) und MusicBrainz, ohne YouTube-Konto; für vorhandene Songs gibt es auf der Seite „YouTube“ die Aktion „Fehlende YouTube-Links ergänzen“.
- **Auswertung**: Kennzahlen und Diagramme zu Kategorien, Interpreten, Genres, Jahrzehnten, Songlänge, Bewertung, Energie und Mitsingen, häufige Kategorie-Kombinationen und ein Überblick, wo noch Angaben fehlen.
- **Playlists**: Der Generator stellt aus gewünschten und ausgeschlossenen Kategorien, Ziel-Dauer, Energie, Mitsingen, Bewertung, Jahr und Genre einen Vorschlag zusammen, auf Wunsch ohne explizite Texte – wahlweise gemischt, aufbauend, ausklingend oder als Bogen. Vorschläge lassen sich neu mischen, einzelne Songs austauschen, gespeicherte Playlists von Hand umsortieren und ergänzen.
- **Mitnehmen**: Playlist auf YouTube als Wiedergabeliste öffnen, als Textliste kopieren oder als CSV exportieren (auch die ganze Songliste).
- **YouTube-Konto** (optional, siehe [YouTube verbinden](#youtube-verbinden)):
  - Playlists der App im eigenen YouTube-Konto anlegen und später abgleichen. Sie erscheinen auch in YouTube Music.
  - Eigene YouTube-Playlists und „Mag ich“-Videos als Songs übernehmen; vorhandene Songs werden erkannt und verknüpft.
  - Für Songs ohne YouTube-Link zusätzlich die YouTube-Suche fragen und die Treffer gesammelt prüfen (ohne Konto suchen Wikidata und MusicBrainz).

## Starten

Voraussetzung ist Podman (oder Docker) mit Compose.

```bash
podman compose up -d --build
```

Danach läuft die App unter <http://localhost:8090>. Mit `docker compose` funktioniert alles genauso.

| Zweck | Befehl |
|---|---|
| Anhalten (Daten bleiben erhalten) | `podman compose down` |
| Nach Änderungen am Code neu bauen | `podman compose up -d --build` |
| Protokolle ansehen | `podman compose logs -f backend` |
| Alles löschen, **auch die Datenbank** | `podman compose down -v` |

## Erste Schritte

1. **Songs → Song hinzufügen**: Titel und Interpret ins Suchfeld tippen oder einen Link aus Apple Music, YouTube oder YouTube Music einfügen („Teilen → Link kopieren“), Treffer anklicken. Danach fasst eine Karte die Angaben zusammen; es bleiben nur Kategorien, Bewertung, Energie und Mitsingen. Strg+Enter speichert, „Speichern & weiterer Song“ (Strg+Umschalt+Enter) hält den Dialog für den nächsten Song offen. Ist ein Song schon in der Bibliothek, sagt der Dialog das schon in der Trefferliste.
2. Für YouTube den Link zum Video einfügen. Ohne verbundenes Konto öffnet der Knopf „Suchen“ neben dem Feld die passende Suche zum Kopieren; mit verbundenem Konto zeigt er die Treffer direkt im Dialog.
3. **Playlists → Playlist erzeugen**: Kategorien und Wunschdauer wählen, Vorschlag prüfen, speichern.
4. **Auswertung** zeigt, wie sich die Bibliothek zusammensetzt. Je vollständiger Kategorien, Bewertung und Energie gepflegt sind, desto treffsicherer wird der Generator.

## Streaming-Plattformen: was geht und was nicht

| Plattform | Ohne Konto | Mit verbundenem Konto | Nicht eingebaut |
|---|---|---|---|
| Apple Music | Songsuche im iTunes-Katalog füllt das Formular und liefert den direkten Link; sonst Link zur Suche | – | Playlists im eigenen Konto anlegen oder auslesen – dafür verlangt Apple eine kostenpflichtige Entwickler-Mitgliedschaft (MusicKit) |
| YouTube | Direkter Link oder Suche; eine Playlist öffnet sich als Wiedergabeliste (höchstens 50 Songs) | Playlists im Konto anlegen und abgleichen, eigene Playlists und „Mag ich“-Videos übernehmen, fehlende Links suchen | – |
| YouTube Music | Direkter Link (auch abgeleitet aus dem YouTube-Link) oder Suche | Angelegte Playlists erscheinen auch dort in der Bibliothek (mit ihren Musikvideos) | Eine eigene Schnittstelle für YouTube Music gibt es nicht |

## YouTube verbinden

Damit die App in deinem YouTube-Konto Playlists anlegen und lesen darf, braucht sie eigene Zugangsdaten von Google. Das ist einmalig und kostenlos und dauert etwa zehn Minuten. Dieselbe Anleitung zeigt die App auf der Seite **YouTube**, solange noch nichts eingerichtet ist. Die Menüpunkte der Google Cloud Console heißen je nach Spracheinstellung englisch oder deutsch ähnlich.

1. In der [Google Cloud Console](https://console.cloud.google.com/) ein Projekt anlegen, z. B. „Musik“.
2. Unter **APIs & Services → Library** die **YouTube Data API v3** suchen und aktivieren (**Enable**).
3. Unter **Google Auth Platform** auf **Get started**: App-Name (z. B. „Musik“) und deine E-Mail-Adresse eintragen, als Zielgruppe **External** wählen, die Richtlinie bestätigen.
4. Unter **Audience → Test users** deine eigene Google-Adresse hinzufügen.
5. Unter **Clients → Create client** den Typ **Web application** wählen und bei **Authorized redirect URIs** genau diese Adresse eintragen:

   ```
   http://localhost:8090/api/youtube/callback
   ```

   Bei anderem `WEB_PORT` entsprechend; die App zeigt die richtige Adresse auf der Seite „YouTube“ an.
6. Client-ID und Client-Secret in die Datei `.env` im Projektordner eintragen (Vorlage `.env.example`). Das Secret zeigt Google nur direkt nach dem Anlegen vollständig an.

   ```
   YOUTUBE_CLIENT_ID=…
   YOUTUBE_CLIENT_SECRET=…
   ```

7. Die App neu starten und auf der Seite **YouTube** auf „Mit YouTube verbinden“ klicken:

   ```bash
   podman compose up -d
   ```

Google zeigt beim Verbinden einen Hinweis, dass die App nicht von Google überprüft wurde. Für eine selbst eingerichtete App ist das normal und lässt sich bestätigen. Verbinden klappt nur auf dem Rechner, auf dem die App läuft, weil Google danach zu `localhost` zurückspringt. Wenn die App einmal verbunden ist, lassen sich die Funktionen auch von anderen Geräten nutzen.

**Verbindung läuft nach 7 Tagen ab?** Solange die App bei Google den Status „Testing“ hat, gilt jede Freigabe nur 7 Tage. Dann zeigt die App „Neu verbinden“, ein Klick genügt. Wer das nicht möchte, veröffentlicht die App unter **Audience → Publish app**. Bei weniger als 100 Nutzern ist das ohne Überprüfung durch Google möglich; der Hinweis beim Verbinden bleibt.

### Kontingent

Google begrenzt die Nutzung je Projekt und Tag. Die App zählt mit und zeigt den Stand auf der Seite „YouTube“.

| Aktion | Kosten |
|---|---|
| Playlists und Videos lesen | 1 Einheit je Seite (bis zu 50 Einträge) |
| Playlist anlegen, Song hinzufügen, verschieben oder entfernen | je 50 Einheiten |
| Video suchen | 1 von 100 Suchen pro Tag (eigenes Kontingent) |

Pro Tag stehen 10.000 Einheiten zur Verfügung, das reicht zum Beispiel für rund 190 übertragene Songs. Das Kontingent wird um Mitternacht pazifischer Zeit zurückgesetzt, in Deutschland meist um 9 Uhr. Beim Abgleichen ändert die App nur, was sich wirklich geändert hat.

### Gut zu wissen

- **Abgleichen** passt die Playlist auf YouTube an den Stand in der App an. Videos, die nur auf YouTube in dieser Playlist stehen, werden dort entfernt. „Verknüpfung lösen“ beendet den Abgleich, die Playlist auf YouTube bleibt.
- **Übernommene Playlists** sind nicht verknüpft: Änderungen in der App wirken sich nicht auf die ursprüngliche YouTube-Playlist aus.
- **Songs ohne YouTube-Link** fehlen in der YouTube-Playlist. Vor dem Übertragen lassen sich passende Videos suchen.
- **Trennen** widerruft den Zugang der App bei Google. Alternativ geht das unter [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- Zu einem Google-Konto ohne YouTube-Kanal lassen sich keine Playlists anlegen. Einen Kanal legt man auf youtube.com über das Profilbild an.

### Wenn etwas nicht klappt

| Meldung | Ursache und Lösung |
|---|---|
| `Error 400: redirect_uri_mismatch` bei Google | Die Rücksprungadresse beim OAuth-Client stimmt nicht genau mit der Adresse auf der Seite „YouTube“ überein. Eintragen, ein paar Minuten warten, erneut verbinden. |
| `Error 403: access_denied` bei Google | Die verwendete Google-Adresse fehlt unter **Audience → Test users** (solange die App im Status „Testing“ ist). |
| „Stimmen YOUTUBE_CLIENT_ID und YOUTUBE_CLIENT_SECRET?“ | Client-ID oder Secret in der `.env` falsch. Ein neues Secret gibt es in der Cloud Console über **Add secret**. Danach `podman compose up -d`. |
| „Tageskontingent aufgebraucht“ | Bis zum Zurücksetzen warten (siehe oben). |

## Einstellungen

Ohne weiteres Zutun gelten sinnvolle Standardwerte. Zum Ändern `.env.example` nach `.env` kopieren und anpassen:

| Variable | Standard | Bedeutung |
|---|---|---|
| `WEB_PORT` | `8090` | Port der App im Browser |
| `WEB_BIND` | `127.0.0.1` | `127.0.0.1`: nur von diesem Rechner erreichbar. `0.0.0.0`: auch aus dem Heimnetz, etwa vom Handy |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | `musik` | Zugangsdaten der Datenbank; gelten ab dem ersten Start |
| `ITUNES_COUNTRY` | `de` | Land des Katalogs für Online-Suche, Apple-Music-Links und YouTube-Suche |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` | leer | Zugangsdaten für die YouTube-Anbindung |
| `APP_URL` | `http://localhost:<WEB_PORT>` | Adresse der App im Browser; daraus ergibt sich die Rücksprungadresse für Google |
| `DB_PORT` | `5433` | Nur für die Entwicklung: Port der Datenbank auf dem Rechner |

Die App hat keine Anmeldung. Wer sie mit `WEB_BIND=0.0.0.0` öffnet, sollte das nur in einem vertrauten Netz tun – mit verbundenem YouTube-Konto kann dann jeder im Netz Playlists in diesem Konto anlegen. Die Datenbank ist von außen nicht erreichbar. Damit fremde Webseiten im selben Browser nichts auslösen können, nimmt die API nur JSON-Anfragen an. Läuft die App nur lokal, antwortet sie außerdem nur unter `localhost` und `127.0.0.1`.

## Daten sichern und wiederherstellen

Die Datenbank liegt im Volume `musik_db-data`. Eine Sicherung als SQL-Datei (der Ordner `backups/` ist von Git ausgenommen):

```bash
podman compose exec db pg_dump -U musik -d musik --clean --if-exists -f /tmp/musik-backup.sql
```

```bash
podman compose cp db:/tmp/musik-backup.sql ./backups/musik-backup.sql
```

Wiederherstellen (ersetzt den aktuellen Stand):

```bash
podman compose cp ./backups/musik-backup.sql db:/tmp/musik-backup.sql
```

```bash
podman compose exec db psql -U musik -d musik -f /tmp/musik-backup.sql
```

Unter Git Bash auf Windows vorher `export MSYS_NO_PATHCONV=1` setzen, sonst wird `/tmp/…` in einen Windows-Pfad umgeschrieben.

## Entwicklung

### Aufbau

```
docker-compose.yml               Datenbank, API und Weboberfläche
docker-compose.dev.yml           Zusatz: Datenbank auf dem Rechner erreichbar machen
docker-compose.fake-google.yml   Zusatz: Google-Nachbau zum Ausprobieren der YouTube-Funktionen
backend/                         REST-API: Node.js, Express, TypeScript
  migrations/                    SQL-Dateien für das Datenbankschema
  src/routes/                    Endpunkte
  src/services/                  Datenzugriff, Genre-Liste, Playlist-Generator, Suche (iTunes, BPM, MusicBrainz), YouTube
  src/testing/                   Google-Nachbau für Tests
frontend/                        Weboberfläche: React, TypeScript, Vite
  src/pages/                     Songs, Merkliste, Kategorien, Playlists, Generator, Auswertung, YouTube
  src/components/                Dialoge, Diagramme, Bausteine
  src/lib/                       Formate, Links, CSV, Filter
  nginx/                         Ausliefern der App und Weiterreichen von /api
```

### Lokal entwickeln

Nur die Datenbank im Container, API und Oberfläche direkt mit Node.js (ab Version 22.12):

```bash
podman compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
```

```bash
cd backend
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

Die Oberfläche läuft dann unter <http://localhost:5173> und lädt bei Änderungen neu; Anfragen an `/api` gehen an die API auf Port 3001. Für die YouTube-Anbindung in diesem Aufbau als Rücksprungadresse `http://localhost:5173/api/youtube/callback` beim OAuth-Client eintragen.

### YouTube-Funktionen ohne Google-Konto ausprobieren

`backend/src/testing/fakeGoogle.ts` baut die benötigten Teile von Google nach (Anmeldung, Playlists, Suche). Mit `docker-compose.fake-google.yml` läuft eine komplette Test-App mit eigener Datenbank daneben, die echte Bibliothek bleibt unberührt:

```bash
WEB_PORT=8091 podman compose -p musiktest -f docker-compose.yml -f docker-compose.fake-google.yml up -d --build
```

Die Test-App ist dann unter <http://localhost:8091> erreichbar; „Mit YouTube verbinden“ führt zur nachgebauten Anmeldeseite. Aufräumen:

```bash
podman compose -p musiktest down -v
```

### Tests

```bash
cd backend
npm test
```

```bash
cd frontend
npm test
```

Die Backend-Tests prüfen den Generator, die Eingabeprüfung, die YouTube-Hilfsfunktionen (Titel zerlegen, Treffer bewerten, Playlists abgleichen) und – gegen eine echte PostgreSQL – die ganze API einschließlich Anmeldung und Übertragung gegen den Google-Nachbau. Dafür muss eine Datenbank auf Port 5433 laufen, zum Beispiel die eines Test-Projekts:

```bash
podman compose -p musiktest -f docker-compose.yml -f docker-compose.dev.yml up -d db
```

Jeder Lauf legt eine eigene Wegwerf-Datenbank an. Ohne erreichbare Datenbank werden die API-Tests übersprungen. `npm run typecheck` prüft in beiden Ordnern die Typen.

### Datenbankschema ändern

Eine neue Datei in `backend/migrations/` anlegen, zum Beispiel `004_meine_aenderung.sql`. Beim nächsten Start der API werden alle noch nicht eingespielten Dateien in Namensreihenfolge ausgeführt, jede in einer eigenen Transaktion. Bereits eingespielte Dateien nicht mehr ändern.

### API

| Methode und Pfad | Zweck |
|---|---|
| `GET /api/health` | Läuft die API, erreicht sie die Datenbank? |
| `GET /api/config` | Einstellungen für die Oberfläche |
| `GET`, `POST /api/songs` · `GET`, `PUT`, `DELETE /api/songs/:id` | Songs |
| `POST /api/songs/release-years` | Geprüfte Erscheinungsjahre übernehmen (`{ changes: [{ songId, releaseYear }] }`) |
| `GET`, `POST /api/categories` · `PUT`, `DELETE /api/categories/:id` | Kategorien |
| `GET`, `POST /api/merkliste` · `DELETE /api/merkliste/:id` | Merkliste (vorgemerkte Songs, neueste zuerst) |
| `GET`, `POST /api/playlists` · `GET`, `PUT`, `DELETE /api/playlists/:id` | Playlists |
| `POST /api/playlists/generate` | Vorschlag für eine Playlist, ohne zu speichern |
| `POST`, `DELETE /api/playlists/:id/youtube` | Playlist ins YouTube-Konto übertragen (läuft im Hintergrund) bzw. Verknüpfung lösen |
| `GET /api/stats` | Kennzahlen für die Auswertung |
| `GET /api/lookup/itunes?term=…` | Songsuche im iTunes-Katalog |
| `GET /api/lookup/link?url=…` | Song an seinem Link erkennen: Apple Music über die Track-ID, YouTube und YouTube Music über Titel und Kanal des Videos samt Katalogsuche |
| `GET /api/lookup/bpm?title=…&artist=…&duration=…` | Tempo auf songbpm.com (`{ "match": null }`, wenn unbekannt) |
| `GET /api/lookup/genres?title=…&artist=…&duration=…` | Genres auf MusicBrainz (`{ "match": null }`, wenn unbekannt) |
| `GET /api/lookup/youtube?title=…&artist=…&duration=…` | YouTube-Link über Wikidata und MusicBrainz, geprüft über oEmbed (`{ "match": null }`, wenn unbekannt) |
| `POST /api/jobs` · `GET /api/jobs/latest?kind=…` · `GET`, `DELETE /api/jobs/:id` | Aufträge über die ganze Bibliothek im Hintergrund (`youtube-links`: fehlende YouTube-Links suchen, `release-years`: Erscheinungsjahre mit MusicBrainz vergleichen); DELETE hält einen laufenden an bzw. vergisst einen fertigen |
| `GET /api/genres` | Haupt- und Untergenres der Genre-Liste samt eigenen Genres der Bibliothek; `featuredIn` nennt die Hauptgenres, in deren kurzer Liste ein Untergenre steht |
| `GET /api/youtube/status` | Verbindung und Kontingent |
| `GET /api/youtube/connect` · `GET /api/youtube/callback` | Anmeldung bei Google (im Browser) |
| `POST /api/youtube/disconnect` | Verbindung trennen und Zugang widerrufen |
| `GET /api/youtube/search?q=…&title=…&artist=…&duration=…` | Videos suchen und bewerten |
| `GET /api/youtube/playlists` · `GET /api/youtube/playlists/:id` | Eigene Playlists bzw. Vorschau zum Übernehmen (`mag-ich` für „Mag ich“-Videos) |
| `POST /api/youtube/import` | Videos als Songs übernehmen, auf Wunsch als Playlist |
| `POST /api/youtube/links` | Gefundene Videos als YouTube-Link der Songs speichern |
| `GET /api/youtube/jobs/:id` | Fortschritt einer Übertragung |

## Was nach außen geht

- Die Online-Suche schickt den eingetippten Suchbegriff an die iTunes Search API von Apple.
- Ein ins Suchfeld eingefügter Link geht je nach Plattform weiter: Bei Apple Music fragt das Backend die Track-ID bei der iTunes Search API ab, bei YouTube und YouTube Music schickt es den Link zum Video an die oEmbed-Schnittstelle von YouTube (liefert Titel und Kanal, ohne Konto und ohne Kontingent) und sucht danach mit Interpret und Titel im iTunes-Katalog.
- Für Genres und das Jahr der Erstveröffentlichung schickt das Backend Interpret und Titel an die Suche von MusicBrainz (öffentliche Web-API ohne Schlüssel, höchstens eine Anfrage pro Sekunde) – beim Anlegen im Song-Dialog, für neu übernommene YouTube-Songs und bei „Erscheinungsjahre prüfen“.
- Für das Tempo schickt das Backend Interpret und Titel an die Suche von songbpm.com – ebenfalls beim Anlegen im Song-Dialog und für neu übernommene YouTube-Songs. songbpm.com hat keine offizielle Schnittstelle; ausgewertet wird die Ergebnisseite. Ändert die Seite ihren Aufbau, findet die App kein Tempo mehr, alles andere funktioniert weiter.
- Für YouTube-Links ohne Konto schickt das Backend den Titel des Songs an den SPARQL-Dienst von Wikidata (Eigenschaft „YouTube-Video-ID“) und fragt bei MusicBrainz die Links der gefundenen Aufnahme ab (nur deren ID). Jedes gefundene Video prüft es über die oEmbed-Schnittstelle von YouTube, gelöschte und private Videos werden übersprungen. Das passiert im Song-Dialog und bei „Fehlende YouTube-Links ergänzen“.
- Cover werden beim Anzeigen direkt von der gespeicherten Bildadresse geladen (bei Treffern aus der Online-Suche von Apple, bei übernommenen Videos von YouTube).
- Ein Klick auf einen Plattform-Link öffnet die jeweilige Seite in einem neuen Tab.
- Reinhören im Song-Dialog lädt die Hörprobe direkt von Apple (audio-ssl.itunes.apple.com); für gespeicherte Songs fragt das Backend dafür die Track-ID aus dem Apple-Music-Link bei der iTunes Search API ab. Hat ein Song nur einen YouTube-Link, lädt „Im Dialog abspielen“ den Player von youtube-nocookie.com; YouTube erfährt dabei die Adresse der App (etwa `http://localhost:8090`), weil der Player sonst nicht startet.
- Mit verbundenem YouTube-Konto spricht das Backend mit Google: Anmeldung, Lesen der eigenen Playlists, Suchen von Videos (Interpret und Titel des Songs) und Anlegen bzw. Ändern der übertragenen Playlists. Die Zugangsdaten liegen in der eigenen Datenbank und verlassen den Rechner nur in Richtung Google.

Sonst bleibt alles auf dem eigenen Rechner.

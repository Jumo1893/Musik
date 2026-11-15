# Musik

Eine App, in der ich meine beliebte Musik speichern und richtig analysieren kann und damit die richtigen Playlists erstellen kann.

Gespeichert werden nur Angaben und Links zu den Songs – **keine Audiodateien**. Angehört wird auf Apple Music, YouTube oder YouTube Music.

## Was die App kann

- **Songs** mit Titel, Interpret, Album, Dauer, Jahr, Genre, BPM, Bewertung (1–5 Sterne), Energie (1–5), Notizen und Cover.
  Die Online-Suche holt die Angaben samt Cover und Apple-Music-Link aus dem iTunes-Katalog, sodass meist nur noch Kategorien und Bewertung fehlen.
- **Kategorien** wie „melancholisch“ oder „aufpushend“: frei anlegbar, farbig, beliebig viele pro Song. Acht Kategorien sind als Startpunkt angelegt.
- **Links zu Apple Music, YouTube und YouTube Music** an jedem Song. Ist ein Link gespeichert, führt der Knopf direkt zum Song, sonst zur Suche auf der Plattform. Ein YouTube-Link genügt auch für YouTube Music.
- **Auswertung**: Kennzahlen und Diagramme zu Kategorien, Interpreten, Genres, Jahrzehnten, Songlänge, Bewertung und Energie, häufige Kategorie-Kombinationen und ein Überblick, wo noch Angaben fehlen.
- **Playlists**: Der Generator stellt aus gewünschten und ausgeschlossenen Kategorien, Ziel-Dauer, Energie, Bewertung, Jahr und Genre einen Vorschlag zusammen – wahlweise gemischt, aufbauend, ausklingend oder als Bogen. Vorschläge lassen sich neu mischen, einzelne Songs austauschen, gespeicherte Playlists von Hand umsortieren und ergänzen.
- **Mitnehmen**: Playlist auf YouTube als Wiedergabeliste öffnen, als Textliste kopieren oder als CSV exportieren (auch die ganze Songliste).

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

1. **Songs → Song hinzufügen**: Titel und Interpret ins Suchfeld tippen, Treffer anklicken, Kategorien, Bewertung und Energie wählen, speichern. „Speichern & weiterer Song“ hält den Dialog für den nächsten Song offen.
2. Für YouTube den Link zum Video einfügen – der Knopf „Suchen“ neben dem Feld öffnet die passende Suche zum Kopieren.
3. **Playlists → Playlist erzeugen**: Kategorien und Wunschdauer wählen, Vorschlag prüfen, speichern.
4. **Auswertung** zeigt, wie sich die Bibliothek zusammensetzt. Je vollständiger Kategorien, Bewertung und Energie gepflegt sind, desto treffsicherer wird der Generator.

## Streaming-Plattformen: was geht und was nicht

| Plattform | Eingebaut (ohne Konto oder Schlüssel) | Nicht eingebaut |
|---|---|---|
| Apple Music | Songsuche im iTunes-Katalog füllt das Formular und liefert den direkten Link; sonst Link zur Suche | Playlists im eigenen Konto anlegen oder auslesen – dafür verlangt Apple eine kostenpflichtige Entwickler-Mitgliedschaft (MusicKit) |
| YouTube | Direkter Link oder Suche; eine Playlist öffnet sich als Wiedergabeliste (höchstens 50 Songs), die sich dort mit „Speichern“ ins eigene Konto übernehmen lässt | Playlists direkt im Konto anlegen oder auslesen – dafür braucht es ein Google-Cloud-Projekt mit OAuth-Zugang zur YouTube Data API |
| YouTube Music | Direkter Link (auch abgeleitet aus dem YouTube-Link) oder Suche | Eine offizielle Schnittstelle gibt es nicht |

## Einstellungen

Ohne weiteres Zutun gelten sinnvolle Standardwerte. Zum Ändern `.env.example` nach `.env` kopieren und anpassen:

| Variable | Standard | Bedeutung |
|---|---|---|
| `WEB_PORT` | `8090` | Port der App im Browser |
| `WEB_BIND` | `127.0.0.1` | `127.0.0.1`: nur von diesem Rechner erreichbar. `0.0.0.0`: auch aus dem Heimnetz, etwa vom Handy |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | `musik` | Zugangsdaten der Datenbank; gelten ab dem ersten Start |
| `ITUNES_COUNTRY` | `de` | Land des Katalogs für Online-Suche und Apple-Music-Links |
| `DB_PORT` | `5433` | Nur für die Entwicklung: Port der Datenbank auf dem Rechner |

Die App hat keine Anmeldung. Wer sie mit `WEB_BIND=0.0.0.0` öffnet, sollte das nur in einem vertrauten Netz tun. Die Datenbank ist von außen nicht erreichbar.

## Daten sichern und wiederherstellen

Die Datenbank liegt im Volume `musik_db-data`. Eine Sicherung als SQL-Datei:

```bash
podman compose exec db pg_dump -U musik -d musik --clean --if-exists -f /tmp/musik-backup.sql
```

```bash
podman compose cp db:/tmp/musik-backup.sql ./musik-backup.sql
```

Wiederherstellen (ersetzt den aktuellen Stand):

```bash
podman compose cp ./musik-backup.sql db:/tmp/musik-backup.sql
```

```bash
podman compose exec db psql -U musik -d musik -f /tmp/musik-backup.sql
```

## Entwicklung

### Aufbau

```
docker-compose.yml       Datenbank, API und Weboberfläche
docker-compose.dev.yml   Zusatz: Datenbank auf dem Rechner erreichbar machen
backend/                 REST-API: Node.js, Express, TypeScript
  migrations/            SQL-Dateien für das Datenbankschema
  src/routes/            Endpunkte
  src/services/          Datenzugriff, Playlist-Generator, iTunes-Suche
frontend/                Weboberfläche: React, TypeScript, Vite
  src/pages/             Songs, Kategorien, Playlists, Generator, Auswertung
  src/components/        Dialoge, Diagramme, Bausteine
  src/lib/               Formate, Links, CSV, Filter
  nginx/                 Ausliefern der App und Weiterreichen von /api
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

Die Oberfläche läuft dann unter <http://localhost:5173> und lädt bei Änderungen neu; Anfragen an `/api` gehen an die API auf Port 3001.

### Tests

```bash
cd backend
npm test
```

```bash
cd frontend
npm test
```

Die Backend-Tests prüfen den Generator, die Eingabeprüfung und – gegen eine echte PostgreSQL – die ganze API. Dafür muss die Datenbank wie oben mit `docker-compose.dev.yml` laufen; jeder Lauf legt eine eigene Wegwerf-Datenbank an und rührt die Daten der App nicht an. Ohne erreichbare Datenbank werden die API-Tests übersprungen. `npm run typecheck` prüft in beiden Ordnern die Typen.

### Datenbankschema ändern

Eine neue Datei in `backend/migrations/` anlegen, zum Beispiel `003_meine_aenderung.sql`. Beim nächsten Start der API werden alle noch nicht eingespielten Dateien in Namensreihenfolge ausgeführt, jede in einer eigenen Transaktion. Bereits eingespielte Dateien nicht mehr ändern.

### API

| Methode und Pfad | Zweck |
|---|---|
| `GET /api/health` | Läuft die API, erreicht sie die Datenbank? |
| `GET /api/config` | Einstellungen für die Oberfläche |
| `GET`, `POST /api/songs` · `GET`, `PUT`, `DELETE /api/songs/:id` | Songs |
| `GET`, `POST /api/categories` · `PUT`, `DELETE /api/categories/:id` | Kategorien |
| `GET`, `POST /api/playlists` · `GET`, `PUT`, `DELETE /api/playlists/:id` | Playlists |
| `POST /api/playlists/generate` | Vorschlag für eine Playlist, ohne zu speichern |
| `GET /api/stats` | Kennzahlen für die Auswertung |
| `GET /api/lookup/itunes?term=…` | Songsuche im iTunes-Katalog |

## Was nach außen geht

- Die Online-Suche schickt den eingetippten Suchbegriff an die iTunes Search API von Apple.
- Cover werden beim Anzeigen direkt von der gespeicherten Bildadresse geladen (bei Treffern aus der Online-Suche von Apple).
- Ein Klick auf einen Plattform-Link öffnet die jeweilige Seite in einem neuen Tab.

Sonst bleibt alles auf dem eigenen Rechner.

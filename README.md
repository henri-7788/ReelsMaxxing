# ReelsMaxxing – Reels-Manager

Holt Videos aus themenpassenden Subreddits, bereitet sie als 9:16-Reel auf und stellt sie für
n8n bereit, das sie über die offizielle Instagram Graph API auf mehreren Accounts postet.

```
n8n (alle 15 min)
  ├─ GET  /api/due                      → welche Accounts haben gerade einen Posting-Slot?
  ├─ POST /api/accounts/{id}/prepare    → Reddit-Video suchen, laden, rendern → video_url + caption
  ├─ Instagram Graph API                → Container (REELS) anlegen, Status abwarten, veröffentlichen
  └─ POST /api/posts/{id}/result        → published / failed melden
Fehler → n8n-Error-Workflow → E-Mail
```

## Was der Container macht

* **Weboberfläche** (`/`): Dashboard mit Kennzahlen, Heatmap der Posting-Zeiten, Verlauf und
  Auslastung des Mini-PCs; dazu Accounts, Warteschlange (Pipeline), Kalender, Statistiken, Quellen,
  Logs, Einstellungen und System. Hell und Dunkel, Standard folgt dem Gerät. Gebaut mit Next.js
  ([`web/`](web)), Design nach [`UIDesign.md`](UIDesign.md).
* **Reddit**: offizielle API (App-only OAuth). Nimmt das Video mit den meisten Upvotes, das noch
  nie gepostet wurde (über alle Accounts hinweg, kein Video doppelt).
* **Rendering** (ffmpeg): 1080×1920, Original mittig auf unscharfem Hintergrund, Titel als Hook
  oben, sichtbare Quellenangabe `Video: u/<autor> · r/<subreddit>`, Lautstärke normalisiert
  (−14 LUFS), H.264/AAC nach Instagram-Vorgaben. Ein Video nach dem anderen, damit der
  Celeron N2930 nicht überlastet. Ca. 1–3 Minuten pro Reel.
* **Medien**: fertige Videos liegen unter `/media/<zufallsname>.mp4` (öffentlich, damit Instagram
  sie laden kann) und werden nach dem Posten bzw. nach 48 h gelöscht.

## Installation mit Portainer

1. **Reddit-App anlegen**: <https://www.reddit.com/prefs/apps> → „create app“ → Typ *script*.
   Client-ID (unter dem Namen) und Secret notieren.
2. **Stack anlegen**: Portainer → Stacks → Add stack → *Repository* →
   `https://github.com/henri-7788/ReelsMaxxing`, Compose-Pfad `docker-compose.yml`.
   Unter „Environment variables“ die Werte aus [`.env.example`](.env.example) eintragen
   (`API_KEY` z. B. mit `openssl rand -hex 32` erzeugen).
3. **Netzwerk zu n8n**: Läuft n8n in einem anderen Stack, im Compose die `networks`-Zeilen
   einkommentieren und den Netzwerknamen von n8n eintragen. n8n ruft dann
   `http://reels-manager:8080/api/...` auf (geht nicht über das Internet).
4. **Cloudflare Tunnel**: Public Hostname, z. B. `reels.deinedomain.de` → `http://reels-manager:8080`
   (bzw. `http://localhost:8090`, Host-Port über `HOST_PORT`, Standard 8090). Diesen Wert als `PUBLIC_BASE_URL` setzen.
5. **Schutz der Oberfläche**: In Cloudflare Zero Trust eine Access-Application für
   `reels.deinedomain.de` (nur deine E-Mail) und eine zweite für `reels.deinedomain.de/media`
   mit Policy **Bypass → Everyone**, sonst kann Instagram die Videos nicht laden.
   Zusätzlich oder alternativ geht `UI_USER`/`UI_PASSWORD` (Basic Auth).
6. **GPU-Encoding (optional)**: `ENCODER=vaapi` setzen und im Compose `devices: /dev/dri`
   einkommentieren. Klappt es nicht, wird automatisch auf CPU (libx264) zurückgefallen.

## Instagram-Accounts verbinden (Instagram Login)

Genutzt wird die **Instagram API mit Instagram Login** (`graph.instagram.com`). Eine Facebook-Seite
ist nicht nötig, jeder Account muss nur ein **Business- oder Creator-Account** und öffentlich sein.

1. <https://developers.facebook.com/apps> → App erstellen → Use Case **Other** → Typ **Business**.
2. Produkt **Instagram** hinzufügen → *API setup with Instagram login*.
3. Unter *Business login settings* eintragen (Domain = `PUBLIC_BASE_URL`):
   * OAuth redirect URI: `https://reels.deinedomain.de/api/instagram/callback`
   * Deauthorize callback URL: `https://reels.deinedomain.de/api/instagram/deauthorize`
   * Data deletion request URL: `https://reels.deinedomain.de/api/instagram/data-deletion`
4. Dort stehen auch **Instagram app ID** und **Instagram app secret** → im Stack als
   `IG_APP_ID` / `IG_APP_SECRET` setzen (nicht die Facebook-App-ID aus *App settings → Basic*).
5. Jeden Instagram-Account unter *App roles → Roles* als **Instagram Tester** einladen und die
   Einladung in der Instagram-App annehmen (Einstellungen → Website-Berechtigungen → Apps und
   Websites → Einladungen). Für eigene Accounts reicht damit *Standard Access*, ein App Review
   ist nicht nötig, die App kann im Entwicklungsmodus bleiben.
6. In der Oberfläche beim Account auf **Mit Instagram verbinden** klicken. Token (60 Tage) und
   User-ID werden gespeichert und automatisch erneuert, bevor sie ablaufen.

Die Callback-URLs liegen unter `/api/` und brauchen in Cloudflare Access **keine** Ausnahme
(der Redirect läuft in deinem eigenen, schon angemeldeten Browser). Sie sind durch den signierten
`state` bzw. Metas `signed_request` geschützt.

## API (für n8n)

Alle `/api`-Aufrufe brauchen den Header `X-API-Key: <API_KEY>`. Doku: `/api/docs`.

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/due` | Accounts mit fälligem Slot: `{"due":[{"account_id","name","slot"}]}` |
| POST | `/api/accounts/{id}/prepare` | Body `{"slot": "..."}` → `post_id, ig_user_id, access_token, graph_api_base, video_url, caption` oder `{"skipped": true, "reason": ...}` |
| POST | `/api/posts/{id}/result` | Body `{"status": "publishing|published|failed", "ig_media_id": "...", "error": "..."}` |
| POST | `/api/cleanup` | alte Medien löschen |

Ein Slot ist fällig, sobald seine Uhrzeit erreicht ist, für bis zu 90 Minuten
(`SLOT_WINDOW_MINUTES`). Pro Slot gibt es höchstens 2 Versuche.

## Weboberfläche (`web/`)

Next.js 16 + React 19 + Tailwind 4, Icons von `lucide-react`, Schrift Inter (selbst gehostet).
Die Oberfläche wird als **statischer Export** gebaut (`output: "export"`): Node.js läuft nur beim
Docker-Build (Stage 1), im fertigen Container liefert FastAPI nur noch HTML/JS/CSS aus. Der
Mini-PC hat zur Laufzeit also keinen zusätzlichen Prozess.

* Design-Tokens (Farben, Radien, Schatten, Light/Dark) stehen in `web/app/globals.css`, die
  Vorgaben dazu in [`UIDesign.md`](UIDesign.md).
* Rahmen (Sidebar, Topbar, Tab-Leiste am Handy): `web/components/shell/`. Diagramme als eigenes
  SVG ohne Chart-Bibliothek: `web/components/charts/`.
* Daten holt die Oberfläche über `/ui-api/...` (gleicher Schutz wie die Seiten: Cloudflare Access
  bzw. Basic Auth), u. a. `/ui-api/stats`, `/ui-api/system` und `/ui-api/settings`. Die n8n-API
  unter `/api/...` mit `X-API-Key` ist unverändert.
* Alte Links `/accounts/<id>` leiten auf `/account?id=<id>` um, `/posts` auf den Verlauf in der
  Warteschlange.

## Entwicklung

```bash
pip install -r requirements.txt pytest
DATA_DIR=./data API_KEY=dev uvicorn app.main:app --reload --port 8080
pytest

# Oberfläche mit Hot Reload (leitet /ui-api, /api, /media an :8080 weiter)
cd web && npm install && npm run dev        # http://localhost:3000
# oder einmal bauen und von FastAPI ausliefern lassen
cd web && npm run build && WEB_DIR=web/out uvicorn app.main:app --port 8080
```

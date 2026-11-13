# UIDesign – Reels-Manager

Design-Spezifikation für die Weboberfläche des Reels-Managers (`web/`). Grundlage ist ein
helles Analytics-Dashboard („Gotics“, Pinterest-Vorlage) mit Sidebar, Kennzahlen-Kacheln,
Heatmap, Linien-Chart und Donut. Die Vorlage wurde auf unseren Use Case umgebaut:

> Reddit-Videos aus themenpassenden Subreddits holen, als 9:16-Reel rendern (Zuschnitt,
> Hook-Text, Quellenangabe, Lautstärke) und über n8n + Instagram Graph API auf **mehreren
> Accounts** posten. Läuft als Docker-Stack über Portainer auf einem Mini-PC (Celeron N2930).

Dieses Dokument beschreibt **nur das Design**. Es ist keine Implementierung. Wo Daten gebraucht
werden, die das Backend heute noch nicht liefert, ist das mit **🔧 Backend fehlt** markiert.

---

## Inhalt

1. [Verhältnis zur bestehenden Oberfläche](#1-verhältnis-zur-bestehenden-oberfläche)
2. [Was aus der Vorlage übernommen, ersetzt oder ergänzt wird](#2-was-aus-der-vorlage-übernommen-ersetzt-oder-ergänzt-wird)
3. [Design-Tokens](#3-design-tokens)
4. [Layout und Raster](#4-layout-und-raster)
5. [App-Rahmen: Sidebar und Topbar](#5-app-rahmen-sidebar-und-topbar)
6. [Komponenten](#6-komponenten)
7. [Seiten](#7-seiten)
8. [Zustände: leer, laden, Fehler](#8-zustände-leer-laden-fehler)
9. [Light- und Dark-Theme](#9-light--und-dark-theme)
10. [Responsives Verhalten](#10-responsives-verhalten)
11. [Barrierefreiheit](#11-barrierefreiheit)
12. [Performance auf dem Mini-PC](#12-performance-auf-dem-mini-pc)
13. [Umsetzung im bestehenden Stack](#13-umsetzung-im-bestehenden-stack)
14. [Offene Punkte und Backend-Bedarf](#14-offene-punkte-und-backend-bedarf)

---

## 1. Verhältnis zur bestehenden Oberfläche

Die aktuelle Oberfläche (PR #4, „Liquid Glass“) ist ein **dunkles Glas-Design**: farbiger
Verlaufshintergrund (Pink/Orange/Violett/Cyan), schwebende Pill-Navigation oben mittig
(„Übersicht · Verlauf · + Account“), Glas-Karten mit `liquid-glass-react`, Akzentfarbe Pink
`#ff4f8b`. Screenshots liegen im Projektordner `liquid-glass-ui/`
(`uebersicht-desktop.png`, `account-desktop.png`, `uebersicht-handy.png`).

Das neue Design ist ein **ruhiges, flaches Dashboard** im Stil der Vorlage. Konkret weicht es so
von der bestehenden UI ab:

| Thema | Bestehend (Liquid Glass) | Neu (dieses Dokument) |
|---|---|---|
| Grundton | nur dunkel, bunter Verlaufshintergrund | Hell und Dunkel; **Standard folgt der Systemeinstellung** des Geräts; neutrale, flache Hintergründe wie in der Vorlage |
| Navigation | schwebende Glas-Pill oben mittig, 3 Links | **feste linke Sidebar** mit Gruppen, Badges, Account-Switcher; auf dem Handy Bottom-Tab-Bar |
| Kopfzeile | große Seitenüberschrift + Breadcrumb im Inhalt | **Topbar** mit Seitentitel, Suche, Benachrichtigungen, System-Status |
| Flächen | Glas mit Lichtbrechung (SVG-Filter), `.frost` | **weiße Karten mit 1-px-Rand**, kaum Schatten, kein Blur |
| Akzentfarbe | Pink `#ff4f8b`, Pink→Orange-Verlauf | **Blau `#235EE8`** und alle anderen Farben exakt aus der Vorlage; Orange `#FF835B` für Badges |
| Daten | Zahlen-Kacheln, Tabellen | zusätzlich **Heatmap, Linien-Chart, Pipeline, Kalender, Ring-Gauge** |
| Seiten | Übersicht, Verlauf, Account | Dashboard, Accounts, Account-Detail, Warteschlange, Kalender, Statistiken, Logs, Einstellungen, System |

Was **bleibt**:

* Stack: Next.js (statischer Export) + Tailwind 4, ausgeliefert von FastAPI, Daten über `/ui-api/...`.
* Inhalte und Begriffe der Account-Seite (Grundlagen, Instagram, Inhalt, Subreddits mit
  Sortierung/Zeitraum/Min. ▲/Min. s/Max. s/NSFW, Gefahrenzone, Caption-Platzhalter
  `{title} {author} {subreddit} {permalink} {hashtags}`).
* Status-Pills der Posts (`preview`, `rendering`, `ready`, `publishing`, `published`, `failed`) –
  nur neu eingefärbt (siehe [3.1](#31-farben)).
* Deutsche Oberfläche, `lang="de"`, Uhrzeiten im Format `HH:MM`.

**Liquid Glass entfällt** im neuen Design. Der Ordner `web/components/glass/` und die Abhängigkeit
`liquid-glass-react` werden bei der Umsetzung nicht mehr gebraucht. Gründe: Die Vorlage ist
bewusst flach, die SVG-Lichtbrechung kostet auf dem Celeron-Mini-PC bzw. schwachen Clients
Leistung, und in Safari/Firefox funktionierte sie ohnehin nur eingeschränkt. Es gibt **keine
Glas-Optik**, auch nicht im Dark-Theme: kein Blur, kein `backdrop-filter`, kein bunter
Hintergrund.

**Leitlinie:** Das Design folgt der Vorlage so genau wie möglich (Farben, Abstände, Radien,
Schrift, Aufbau der Karten). Abweichungen gibt es nur dort, wo der Use Case etwas verlangt, das
die Vorlage nicht zeigt (z. B. Fehlerzustände, Pipeline, Kalender). Neue Elemente werden aus den
Bausteinen der Vorlage zusammengesetzt.

---

## 2. Was aus der Vorlage übernommen, ersetzt oder ergänzt wird

### 2.1 Übernommen (Struktur)

* Linke Sidebar mit Logo, Nav-Items mit Icon, aktivem Zustand, Badge, aufklappbaren Gruppen,
  Abschnitt „Weitere“ (Vorlage: „Others“) und Theme-Umschalter Hell/Dunkel unten.
* Topbar mit Seitentitel, Suchfeld, Glocke mit rotem Punkt, Avatar.
* Eine Karte mit vier KPI-Kacheln im 2×2-Raster und grünen/roten Trend-Deltas.
* Heatmap „nach Tageszeit“ mit Legenden-Skala.
* Flächen-Linien-Chart mit Tooltip, Segmented Control „Tag / Monat / Jahr“ und Button
  „Bericht ansehen“.
* Ring-Gauge mit großer Zahl in der Mitte und Liste darunter.
* Karten-Kopf: Titel links, `⋯`-Menü rechts.

### 2.2 Ersetzt (passt nicht zum Use Case)

| Vorlage | Ersetzt durch | Begründung |
|---|---|---|
| Users / Revenue / Conv Rate / Session (KPIs) | Geplant heute · Gepostet (7 Tage) · Ø Views pro Reel · Fehlerquote | Wir verkaufen nichts, wir posten Reels |
| „User by time of day“ | **„Beste Posting-Zeiten“** (Ø Views je Wochentag × Stunde) | Gleiche Visualisierung, entscheidet über Posting-Slots |
| „Active Users“ Chart | **„Reels-Performance“** (Views / Likes / Posts über Zeit) | — |
| „Sessions by device“ Donut | **„Mini-PC“-Gauge** (CPU, RAM, Speicher, Render-Warteschlange) bzw. **Pipeline-Ring** | Geräteverteilung ist für uns irrelevant; Auslastung des Mini-PCs nicht |
| Customization, Realtime, Audience, Behavior, Conversion | Accounts, Warteschlange, Kalender, Statistiken, Logs | — |
| Help Center | **Hilfe & Doku** (Link auf README, `/api/docs`) | — |
| Avatar eines Nutzers | Avatar des **aktiven Instagram-Accounts** im Account-Switcher; oben rechts nur Initialen-Avatar mit Menü | Es gibt nur einen Bediener |

### 2.3 Ergänzt (fehlt in der Vorlage)

* **Account-Switcher** (oben in der Sidebar): filtert die ganze Oberfläche auf einen Account
  oder „Alle Accounts“.
* **Account-Karten** mit Status (aktiv / pausiert / Instagram fehlt / Token läuft ab / Fehler).
* **Subreddit-Quellen** pro Account mit Filtern und Trefferquote.
* **Pipeline / Warteschlange** mit Spalten Gefunden → Rendert → Bereit → Geplant → Wird gepostet →
  Gepostet / Fehler.
* **Kalender** (Woche/Monat) mit Slots pro Account.
* **Logs / Fehler**-Ansicht.
* **Einstellungen**: Reddit- und Instagram-Zugänge, Bearbeitungs-Presets (Zuschnitt, Hook,
  Quellenangabe, Lautstärke, Encoder), n8n/API-Schlüssel.
* **Mini-PC-Statusanzeige** (kompakt in der Topbar, ausführlich auf der System-Seite).
* **Video-Vorschau** im 9:16-Format (Modal/Drawer).
* Leere, Lade- und Fehlerzustände für jede Komponente.

---

## 3. Design-Tokens

Alle Werte als CSS-Variablen in `globals.css` (Tailwind-4-`@theme`), Light-Werte im `:root`,
Dark-Werte über `[data-theme="dark"]` bzw. `@media (prefers-color-scheme: dark)`. Namen sind semantisch (`--surface`, nicht `--white`).

### 3.1 Farben

Alle Light-Werte sind **direkt aus der Vorlage gemessen** (Pixelwerte des Screenshots, auf
saubere Hex-Werte gerundet). Es kommen keine Farben dazu, die die Vorlage nicht hat, mit einer
Ausnahme: Rot (`--danger`) für Fehler, weil die Vorlage keinen Fehlerzustand zeigt. Die
Dark-Werte sind aus denselben Tönen abgeleitet (die Vorlage zeigt nur den Umschalter, kein
dunkles Layout).

#### Primär (Blau der Vorlage)

| Token | Light | Dark | Herkunft in der Vorlage | Verwendung |
|---|---|---|---|---|
| `--primary-50` | `#F2F6FF` | `#14213D` | Hintergrund aktiver Nav-Eintrag „Dashboard“, Innenkreis des Donuts, hellste Heatmap-Zellen | aktiver Nav-Hintergrund, Heatmap Stufe 1, Hover-Flächen |
| `--primary-100` | `#EAF0FE` | `#1A2B52` | Hover-Band im „Active Users“-Chart | Tooltip-Band, ausgewählte Zeile |
| `--primary-200` | `#CBD8FA` | `#22407F` | Heatmap/Legende 200–400 | Heatmap Stufe 2 |
| `--primary-400` | `#7B9EF2` | `#3F6FE0` | Heatmap/Legende 400–600 | Heatmap Stufe 3, sekundäre Serie |
| `--primary-600` | `#235EE8` | `#5B8CF5` | Heatmap/Legende 600–800, Chart-Linie, Logo, Donut-Hauptsegment | **Hauptakzent**: Linien, aktiver Text, Primary-Button, Fokus, Heatmap Stufe 4 |
| `--primary-700` | `#1D4EC4` | `#8DB0FA` | Text des aktiven Nav-Eintrags, Wert im Tooltip | aktiver Text, Links, Primary-Button pressed |
| `--sky-400` | `#6CAEFA` | `#5AA2F5` | mittleres Donut-Segment, Icon „Mobile“ | zweites Ring-Segment, zweite Serie |
| `--sky-200` | `#A1E2FF` | `#3C9ACB` | hellstes Donut-Segment, Icon „Tablet“ | drittes Ring-Segment |

#### Neutrale (Grautöne der Vorlage, ohne Blaustich)

| Token | Light | Dark | Herkunft in der Vorlage | Verwendung |
|---|---|---|---|---|
| `--bg` | `#F3F4F8` | `#0E1015` | Hintergrund um das App-Fenster | Seitenhintergrund (außerhalb der Karten) |
| `--surface` | `#FFFFFF` | `#16191F` | Sidebar, Topbar, Karten | Karten, Sidebar, Topbar |
| `--surface-2` | `#F7F7F9` | `#1D2027` | Hintergrund des Hell/Dunkel-Umschalters, Segmented „Month“ | Eingabefelder, Tabellenkopf, Segmented-Control-Hintergrund |
| `--surface-hover` | `#F5F6F8` | `#22262E` | — | Zeilen-/Item-Hover |
| `--border` | `#EBEBEB` | `#2A2E37` | Kartenränder, Linie unter Topbar, Kreuz in der KPI-Karte | Kartenrand, Trennlinien |
| `--border-strong` | `#DFE2E7` | `#3A3F4A` | Rand Suchfeld, „View report“, Segmented Control | Input-Rand, Button-Outline |
| `--grid` | `#EBEBEB` | `#262A32` | gestrichelte Chart-Gitterlinien | Chart-Gitterlinien |
| `--text` | `#0B0B0F` | `#F2F3F5` | „Dashboard“, KPI-Werte, „10,739“, Prozentwerte rechts | Überschriften, große Zahlen |
| `--text-2` | `#3A3D42` | `#C3C7CF` | Nav-Einträge, Kartentitel-Nähe | Nav-Items, Fließtext |
| `--text-label` | `#575E66` | `#A3A9B3` | KPI-Labels „Users“, „Revenue“ | Labels |
| `--text-3` | `#939395` | `#7C818B` | Achsen, „from last week“, „OTHERS“, „APPEARANCE“, Platzhalter „Search here …“ | Achsen, Hinweise, Overlines |

#### Signalfarben

| Token | Light | Dark | Herkunft in der Vorlage | Verwendung |
|---|---|---|---|---|
| `--success` | `#22A35E` | `#4CC98A` | grüne Trend-Pfeile und Prozente | Trend ↑, „gepostet“, „aktiv“, System ok |
| `--success-bg` | `#EAF7F0` | `#13291E` | — (abgeleitet) | Pill-Hintergrund |
| `--warning` | `#FF835B` | `#FF9A78` | Badge „10“ bei Audience, Punkt an der Glocke | **Badges**, Glocken-Punkt, „Instagram fehlt“, „Token läuft ab“, „rendert“, CPU > 80 % |
| `--warning-bg` | `#FFF1EC` | `#2E1C16` | — (abgeleitet) | Pill-Hintergrund |
| `--danger` | `#E5484D` | `#F2777A` | **nicht in der Vorlage**, nötig für Fehler | Trend ↓, „Fehler“, Gefahrenzone |
| `--danger-bg` | `#FDEEEE` | `#2E1617` | — | Pill-Hintergrund |

**Zuordnung Post-Status → Farbe** (ersetzt `.s-*` in `globals.css`; nur Töne der Vorlage + Rot):

| Status (DB) | Label | Farbe | Punkt |
|---|---|---|---|
| `found` 🔧 | Gefunden | `--text-3` | statisch |
| `preview` | Vorschau | `--sky-400` | statisch |
| `rendering` | Rendert | `--warning` | pulsiert (1,2 s) |
| `ready` | Bereit | `--primary-600` | statisch |
| `scheduled` 🔧 | Geplant | `--primary-600` | Ring (hohl) |
| `publishing` | Wird gepostet | `--primary-600` | pulsiert |
| `published` | Gepostet | `--success` | statisch |
| `failed` | Fehler | `--danger` | statisch |
| `skipped` 🔧 | Übersprungen | `--text-3` | statisch |

Account-Farben: Jeder Account bekommt eine **Kennfarbe**, ebenfalls nur aus der Vorlage, in
dieser Reihenfolge nach Account-ID: `#235EE8`, `#6CAEFA`, `#FF835B`, `#22A35E`, `#7B9EF2`,
`#1D4EC4`, `#A1E2FF`, `#939395`. Sie wird nur für kleine Marker benutzt (Punkt im Kalender,
Linie im Vergleichs-Chart, Avatar-Ring), nie für Flächen.

Kontrast: Alle Text/Hintergrund-Paare erfüllen WCAG AA (4,5 : 1 für Text, 3 : 1 für große
Zahlen und UI-Ränder). `--text-3` nur für Text ≥ 12 px mit nicht kritischer Information; Weiß
auf `--warning` nur für die Badge-Zahl (fett, wie in der Vorlage).

### 3.2 Typografie

Schrift: **Inter** (variabel, selbst gehostet über `next/font/local`, kein Google-Fonts-Request),
Fallback `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
Zahlen immer mit `font-variant-numeric: tabular-nums`. Monospace (Platzhalter, Logs, IDs):
`ui-monospace, "JetBrains Mono", Menlo, monospace`.

| Rolle | Größe / Zeilenhöhe | Gewicht | Farbe | Beispiel |
|---|---|---|---|---|
| `display` | 32 / 40 px | 600 | `--text` | große Zahl im Gauge („10.739“) |
| `kpi` | 28 / 36 px | 500 | `--text` | KPI-Wert („284“) |
| `page-title` | 20 / 28 px | 600 | `--text` | „Dashboard“ in der Topbar |
| `card-title` | 15 / 22 px | 600 | `--text` | „Beste Posting-Zeiten“ |
| `body` | 14 / 20 px | 400 | `--text-2` | Fließtext, Tabellenzellen |
| `nav` | 14 / 20 px | 500 | `--text-2`, aktiv `--primary-600` | Sidebar-Einträge |
| `label` | 13 / 18 px | 500 | `--text-label` | Formular-Labels, KPI-Bezeichnung |
| `caption` | 12 / 16 px | 400 | `--text-3` | „von letzter Woche“, Achsen, Hinweise |
| `overline` | 11 / 16 px, `letter-spacing: .08em`, Großbuchstaben | 500 | `--text-3` | „WEITERE“, „DARSTELLUNG“, Tabellenkopf |
| `mono` | 12 / 18 px | 400 | `--text-2` | Logs, `{title}` |

Auf Handys (< 640 px): `kpi` 24/32, `page-title` 18/26, sonst unverändert.

### 3.3 Abstände

4-px-Raster. Tokens: `--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 ·
`--space-5` 20 · `--space-6` 24 · `--space-8` 32 · `--space-10` 40 · `--space-12` 48.

| Stelle | Wert |
|---|---|
| Innenabstand Karte | 24 px (Handy 16 px) |
| Abstand zwischen Karten (Grid-Gap) | 24 px (Handy 16 px) |
| Seitenrand des Inhaltsbereichs | 32 px (Tablet 24, Handy 16) |
| Abstand Karten-Titel → Inhalt | 20 px |
| Sidebar-Innenabstand | 16 px horizontal, 24 px oben |
| Nav-Item | 40 px hoch, 12 px Innenabstand links, 12 px Icon→Text |
| Abstand Nav-Gruppen | 24 px, dazwischen 1-px-Trennlinie |
| KPI-Zelle | 20 px Innenabstand, Icon → Label 12 px, Label → Wert 4 px, Wert → Delta 4 px |

### 3.4 Radien

| Token | Wert | Verwendung |
|---|---|---|
| `--radius-sm` | 6 px | Heatmap-Zellen, Checkbox, kleine Tags |
| `--radius-md` | 10 px | Buttons, Inputs, Nav-Items, Segmented Control, Tooltip |
| `--radius-lg` | 16 px | Karten, Modals, Drawer |
| `--radius-xl` | 20 px | äußerer App-Rahmen auf großen Bildschirmen (Vorlage: abgerundetes Browserfenster) |
| `--radius-full` | 999 px | Pills, Badges, Avatare, Icon-Kreise der KPIs |

### 3.5 Rahmen und Schatten

Die Vorlage arbeitet fast nur mit **Rändern**, kaum mit Schatten.

| Token | Wert | Verwendung |
|---|---|---|
| `--border-w` | 1 px solid `--border` | Karten, Sidebar-Rechtsrand, Topbar-Unterrand, Tabellenzeilen |
| `--shadow-xs` | `0 1px 2px rgb(15 23 42 / .04)` | Karten (Light) |
| `--shadow-sm` | `0 4px 12px rgb(15 23 42 / .08)` | Tooltip, Dropdown, Popover |
| `--shadow-lg` | `0 16px 40px rgb(15 23 42 / .16)` | Modal, Drawer, Account-Switcher-Menü |
| `--ring` | `0 0 0 3px rgb(37 99 235 / .25)` + Rand `--primary-600` | Fokus |

Im Dark-Theme entfallen `--shadow-xs`; Tiefe entsteht nur über `--surface` vs. `--bg` und Ränder.

### 3.6 Icons

Linien-Icons, 1,5 px Strich, 20 px in der Navigation, 18 px in Buttons, 16 px inline.
Empfehlung: **Lucide** (`lucide-react`, tree-shakeable, nur genutzte Icons landen im Bundle).

| Zweck | Icon |
|---|---|
| Dashboard | `layout-dashboard` |
| Accounts | `users` |
| Warteschlange | `list-video` |
| Kalender | `calendar-days` |
| Statistiken | `chart-line` |
| Quellen (Subreddits) | `rss` |
| Logs | `scroll-text` |
| Einstellungen | `settings` |
| System | `cpu` |
| Hilfe | `life-buoy` |
| Trend hoch / runter | `trending-up` / `trending-down` |
| Views / Likes / Kommentare | `eye` / `heart` / `message-circle` |

### 3.7 Bewegung

* Standard-Übergang: 150 ms `cubic-bezier(.2,.8,.2,1)` für Farbe, Hintergrund, Rand.
* Aufklappen (Nav-Gruppe, Accordion): 200 ms Höhe + Chevron-Drehung 180°.
* Drawer/Modal: 220 ms Einblenden + 8 px Versatz.
* Skeletons: Shimmer 1,4 s linear, unendlich.
* `prefers-reduced-motion: reduce` → alle Animationen aus, Pulsieren wird statisch.

---

## 4. Layout und Raster

```
┌──────────────┬──────────────────────────────────────────────────────────┐
│  Sidebar     │  Topbar (64 px)                                          │
│  248 px      ├──────────────────────────────────────────────────────────┤
│              │  Inhalt: 12-Spalten-Grid, Gap 24, max. 1440 px           │
│              │                                                          │
│              │  ┌───────────── 5 ──────────┐ ┌────────── 7 ──────────┐ │
│              │  │ KPI-Karte (2×2)          │ │ Heatmap Posting-Zeiten│ │
│              │  └──────────────────────────┘ └───────────────────────┘ │
│              │  ┌────────────────── 8 ───────────────┐ ┌──── 4 ─────┐ │
│              │  │ Reels-Performance (Chart)          │ │ Mini-PC     │ │
│              │  └────────────────────────────────────┘ └─────────────┘ │
│              │  ┌──────────────── 12 ──────────────────────────────┐   │
│              │  │ Pipeline (Kurzfassung) + Nächste Slots           │   │
│              │  └──────────────────────────────────────────────────┘   │
└──────────────┴──────────────────────────────────────────────────────────┘
```

* **Sidebar**: 248 px fest, volle Höhe, `position: sticky`.
* **Topbar**: 64 px, sticky, gehört zum Inhaltsbereich (nicht über der Sidebar).
* **Inhalt**: 12-Spalten-Grid, Gap 24 px, Seitenrand 32 px, `max-width: 1440px`, links bündig
  neben der Sidebar.
* Spaltenaufteilung wie in der Vorlage: Reihe 1 = 5 + 7, Reihe 2 = 8 + 4. Reihe 3 (neu) = 12.
* Karten einer Reihe haben **gleiche Höhe** (`align-items: stretch`).
* Auf sehr breiten Bildschirmen (≥ 1600 px) wird der ganze App-Rahmen wie in der Vorlage als
  abgerundete Fläche (`--radius-xl`, 24 px Abstand zum Fensterrand, `--bg` drumherum) gezeigt.
  Darunter füllt er das Fenster.

---

## 5. App-Rahmen: Sidebar und Topbar

### 5.1 Sidebar

Von oben nach unten:

1. **Logo-Zeile** (64 px hoch, bündig mit Topbar, Trennlinie darunter):
   Blauer Kreis 28 px (`--primary-600`) mit weißem Symbol wie in der Vorlage (dort ein Pfeil
   nach oben rechts; bei uns ein Play-Dreieck, ersetzt das pinke Quadrat aus `icon.svg`), daneben „Reels-Manager“ in `card-title`, 600.
2. **Account-Switcher** (neu, siehe [6.2](#62-account-switcher)).
3. **Hauptnavigation**:
   * Dashboard
   * Accounts ▾ (aufklappbar: Liste der Accounts mit Kennfarben-Punkt, darunter „+ Neuer Account“)
   * Warteschlange — **Badge** mit Anzahl „Fehler + wartet auf Freigabe“ (orange, wie „10“ in der
     Vorlage; rot, wenn mindestens ein Fehler < 24 h)
   * Kalender
   * Statistiken ▾ (Performance, Posting-Zeiten, Quellen)
   * Logs — Badge mit Fehleranzahl der letzten 24 h, nur wenn > 0
4. Trennlinie, Überschrift **WEITERE** (`overline`)
   * Einstellungen ▾ (Zugänge, Bearbeitung, Automatisierung, Darstellung)
   * System (Mini-PC)
   * Hilfe & Doku
5. Abstandhalter (`flex: 1`)
6. **Mini-PC-Kurzstatus** (neu): eine Zeile „● Mini-PC ok · CPU 23 %“ in `caption`; Punkt grün /
   orange / rot. Klick → System-Seite.
7. Überschrift **DARSTELLUNG** + **Theme-Umschalter** genau wie in der Vorlage (Segmented
   Control mit „☀ Hell“ / „☾ Dunkel“, siehe [6.10](#610-segmented-control)). Ohne eigene Wahl
   folgt das Theme der Systemeinstellung, und das passende Segment ist markiert. Ein Klick
   überschreibt das; „Systemstandard verwenden“ in Einstellungen → Darstellung setzt es zurück.

**Nav-Item-Zustände**

| Zustand | Hintergrund | Text/Icon | Sonstiges |
|---|---|---|---|
| normal | transparent | `--text-2` | |
| hover | `--surface-hover` | `--text` | |
| aktiv | `--primary-50` | `--primary-600`, 600 | `aria-current="page"` |
| fokus | wie hover | | `--ring` |
| Gruppe offen | | | Chevron 180° gedreht, Unterpunkte 32 px eingerückt, 36 px hoch, ohne Icon |
| deaktiviert | transparent | `--text-3` | z. B. Statistiken ohne Instagram-Token, Tooltip erklärt warum |

**Badge**: Pill, min. 22 × 20 px, `--warning` Hintergrund, weiße Zahl 12 px/600, rechtsbündig.
Ab 100 → „99+“.

### 5.2 Topbar

Höhe 64 px, `--surface`, Unterrand `--border`. Links → rechts:

1. **Seitentitel** (`page-title`). Auf Detailseiten mit Zurück-Pfeil davor
   („← Accounts / Tiere“). Ersetzt die große Überschrift + Breadcrumb der alten UI.
2. Abstandhalter.
3. **Suche** (320 px, Handy: nur Icon): Platzhalter „Suchen … (Videos, Subreddits, Accounts)“,
   Tastenkürzel `⌘K`/`Strg K` als Kbd-Hinweis rechts im Feld. Ergebnisse gruppiert in einem
   Popover: Accounts · Subreddits · Videos (Titel, Reddit-ID) · Seiten.
4. **Schnellaktion** „+ Video holen“ (Secondary-Button, nur ≥ 1024 px): stößt für den aktiven
   Account ein Vorschau-Rendering an (entspricht dem bisherigen „Vorschau rendern“).
5. **Mini-PC-Chip** (≥ 1280 px): kleine Pill „CPU 23 % · RAM 41 %“, Farbe nach Schwellwert.
6. **Glocke** mit rotem Punkt bei ungelesenen Meldungen. Popover (360 px) mit den letzten
   Ereignissen: „Reel gepostet auf *Tiere*“, „Fehler: Media upload timed out“, „Token für *Fails*
   läuft in 5 Tagen ab“, „Keine passenden Videos in r/aww“. Pro Eintrag Icon, Text, relative Zeit,
   Link. Fuß: „Alle Logs ansehen“.
7. **Avatar** 36 px rund (Initialen, da es nur einen Bediener gibt). Menü: Darstellung,
   API-Doku, Abmelden (nur bei Basic Auth sinnvoll; bei Cloudflare Access Link auf
   `/cdn-cgi/access/logout`).

---

## 6. Komponenten

### 6.1 Karte (`Card`)

* `--surface`, `--border-w`, `--radius-lg`, `--shadow-xs`, Innenabstand 24 px.
* **Kopf**: Titel (`card-title`) links; rechts optional Filter (Select/Segmented) und
  `⋯`-Menü (32 × 32 px Ghost-Icon-Button). Menüeinträge je nach Karte, z. B. „Als CSV
  exportieren“, „Zeitraum ändern“, „In voller Größe öffnen“.
* **Fuß** (optional): durch 1-px-Linie getrennt, 16 px Innenabstand, links Segmented Control,
  rechts Outline-Button mit Chevron (Vorlage: „Day / Month / Year“ + „View report ›“).

### 6.2 Account-Switcher

Sitzt unter dem Logo, volle Breite, 56 px hoch, `--surface-2`, `--radius-md`.

* Inhalt: Avatar 32 px (Instagram-Profilbild, sonst Initiale auf Kennfarbe) mit 2-px-Ring in
  Kennfarbe · Name (14/600) · darunter `@handle` bzw. „Alle Accounts · 3 aktiv“ (`caption`) ·
  Chevron ↕.
* Klick öffnet Popover (`--shadow-lg`): Suchfeld (ab 6 Accounts), „Alle Accounts“, dann jeder
  Account mit Status-Punkt und nächstem Slot rechts („09:00“), unten „+ Neuer Account“ und
  „Accounts verwalten“.
* Auswahl filtert Dashboard, Warteschlange, Kalender, Statistiken und Logs. Sie wird in der URL
  (`?account=3`) und in `localStorage` gehalten.
* Pausierte Accounts: Name in `--text-3`, Pill „pausiert“.

### 6.3 KPI-Karte

Eine Karte mit **vier Zellen im 2×2-Raster**, getrennt durch 1-px-Linien in `--border`
(Kreuz in der Mitte, Linien enden 20 px vor dem Kartenrand – wie Vorlage).

Aufbau jeder Zelle:

1. Icon-Kreis 36 px, 1-px-Rand `--border`, Icon 18 px `--primary-600`.
2. Label (`label`, `--text-2`).
3. Wert (`kpi`).
4. Delta: Trend-Icon 14 px + Prozent (12/500) in `--success` bzw. `--danger`, dahinter
   „ggü. Vorwoche“ in `--text-3`.

**Definierte KPIs (Dashboard)**

| # | Label | Wert | Delta-Basis | „Gut“ wenn | Icon |
|---|---|---|---|---|---|
| 1 | Gepostet (7 Tage) | Anzahl `published` der letzten 7 Tage | Vorwoche | steigt | `send` |
| 2 | Geplant heute | offene Slots heute / Slots heute gesamt, z. B. „4 / 9“ | — (statt Delta: „nächster um 13:00“) | — | `calendar-clock` |
| 3 | Ø Views pro Reel 🔧 | Mittelwert Plays der Reels der letzten 7 Tage | Vorwoche | steigt | `eye` |
| 4 | Fehlerquote | `failed` / (`published` + `failed`), 7 Tage | Vorwoche | **sinkt** (Delta grün bei Rückgang) | `triangle-alert` |

Solange es keine Instagram-Insights gibt, zeigt KPI 3 stattdessen **„In Arbeit“** (Anzahl
`rendering` + `ready` + `publishing`, entspricht der alten Kachel „In Arbeit“).

**KPIs der Account-Detailseite**: Follower 🔧 · Gepostet (7 Tage) · Ø Views 🔧 · Videos auf Vorrat
(`ready`).

**KPIs der System-Seite**: CPU · RAM · freier Speicher `/media` · Ø Renderdauer.

### 6.4 Heatmap „Beste Posting-Zeiten“

Wiederverwendung der Vorlage („User by time of day“).

* Zeilen: Mo–So (Vorlage beginnt mit So; wir beginnen **mit Montag**, deutsch üblich).
  Spalten: 24 Stunden, auf Desktop beschriftet alle 2 h („0“, „2“, … „22“), Format 24 h statt
  am/pm.
* Zelle: `--radius-sm`, 2 px Abstand, Seitenverhältnis ca. 1,6 : 1.
* Wert: **Ø Views** der Reels, die in dieser Stunde gepostet wurden 🔧. Umschaltbar im
  Kopf-Select: „Ø Views“ · „Ø Likes“ · „Anzahl Posts“ (letzteres geht schon heute aus der DB).
* Farbskala wie Vorlage, 4 Stufen + leer: `--primary-50` (keine/kaum Daten), `--primary-200`,
  `--primary-400`, `--primary-600`. Keine Daten ≠ Wert 0: „keine Daten“ bekommt ein feines Schraffurmuster.
* **Legende** darunter wie Vorlage: durchgehender Balken in 4 Segmenten (`--primary-50`,
  `-200`, `-400`, `-600`) mit Grenzwerten
  (automatisch aus Quartilen berechnet, gerundet: „0 · 2 k · 5 k · 10 k · 20 k“).
* **Overlay der eigenen Slots**: Zellen, in denen der gewählte Account einen festen
  Posting-Slot hat, bekommen einen 2-px-Rand in `--text` (Light) / `#fff` (Dark). So sieht man,
  ob die Slots in „heißen“ Feldern liegen.
* Hover/Fokus: Tooltip „Di 13:00 · Ø 8.420 Views · 6 Reels“. Zellen sind per Pfeiltasten
  ansteuerbar (`role="grid"`).
* Klick auf eine Zelle (nur bei gewähltem Account): Popover „Slot 13:00 hinzufügen“.
* Mit „Alle Accounts“ gewählt: Mittel über alle Accounts, kein Slot-Overlay.

### 6.5 Chart „Reels-Performance“

Wiederverwendung des Flächen-Linien-Charts der Vorlage.

* Serie Standard: **Views pro Tag** 🔧, Linie 2 px `--primary-600`, Fläche darunter
  Verlauf `--primary-600` 16 % → 0 %. Ohne Insights: **Gepostete Reels pro Tag** (aus DB).
* Kopf-Select: Views · Likes · Kommentare · Gepostete Reels · Fehler.
* Mit „Alle Accounts“: optional „Nach Account aufteilen“ (`⋯`-Menü) → eine Linie je Account in
  Kennfarbe, ohne Fläche, Legende oben rechts (max. 6 Linien, Rest „Andere“).
* Y-Achse links, 5 Gitterlinien gestrichelt `--grid`, Beschriftung `caption`
  („0 · 5 k · 10 k …“). X-Achse je nach Zeitraum (Tag → Stunden, Monat → Tage, Jahr → Monate).
* **Hover**: senkrechtes Band in `--primary-100` (Vorlage), Punkt 8 px weiß mit 2-px-Rand
  `--primary-600`, Tooltip-Karte (`--surface`, `--shadow-sm`, `--radius-md`): Datum
  („18. Mai 2026“) in 12/500, darunter Wert in `--primary-600` 14/600 + Einheit in `--text-3`.
  Bei Tagen mit Posts zusätzlich die Liste der geposteten Reels (max. 3, Titel gekürzt).
* **Fuß**: Segmented „Tag · Woche · Monat · Jahr“, rechts Outline-Button „Statistiken öffnen ›“.

### 6.6 Ring-Gauge „Mini-PC“

Ersetzt „Sessions by device“. Gleiche Form: dicker Ring (14 px), runde Enden, Lücken zwischen
Segmenten, Innenkreis `--primary-50`.

* **Mitte**: Icon `cpu` 18 px, große Zahl = CPU-Last „23 %“ (`display`), darunter „CPU-Last“
  (`caption`).
* **Ring**: drei konzentrische Bögen statt Segmenten wäre zu unruhig; daher **ein** Ring mit
  einem Bogen = CPU-Last (Farbe nach Schwellwert: < 60 % `--primary-600`, 60–85 % `--warning`,
  > 85 % `--danger`), Rest `--surface-2`. Für den Pipeline-Ring gelten die drei Blautöne der
  Vorlage: `--primary-600`, `--sky-400`, `--sky-200`.
* **Liste darunter** (wie Desktop/Mobile/Tablet in der Vorlage): Icon · Label · Wert rechts.
  * RAM — „1,6 / 4 GB“
  * Speicher `/media` — „12 GB frei“
  * Render-Warteschlange — „2 Videos“
  * Encoder — „VAAPI“ oder „CPU (libx264)“
  * Temperatur — „58 °C“ (falls auslesbar)
* Kopf rechts: Live-Punkt + „aktualisiert vor 5 s“. Polling alle 10 s, **nur wenn der Tab
  sichtbar ist**.
* 🔧 Backend fehlt: Endpunkt `/ui-api/system` (siehe [14](#14-offene-punkte-und-backend-bedarf)).

Variante **Pipeline-Ring** (auf der Warteschlangen-Seite): Segmente = Anteile Gepostet / Bereit /
Rendert / Fehler der letzten 7 Tage, Mitte = Gesamtzahl.

### 6.7 Pipeline / Warteschlange

Zeigt den Weg jedes Videos. Spalten (Desktop: Kanban, Handy: Liste mit Filter-Chips):

| Spalte | Inhalt | DB-Status |
|---|---|---|
| Gefunden | Reddit-Treffer, noch nicht geladen | `found` 🔧 |
| Rendert | ffmpeg läuft, Fortschrittsbalken + ETA | `rendering` |
| Bereit / Vorschau | fertig gerendert, wartet auf Slot oder Freigabe | `ready`, `preview` |
| Geplant | einem Slot zugeordnet | `scheduled` 🔧 (heute: `ready` mit `slot`) |
| Wird gepostet | n8n lädt hoch, wartet auf Instagram | `publishing` |
| Gepostet | erfolgreich, Link zu Instagram | `published` |
| Fehler | mit Fehlermeldung, Aktion „Erneut versuchen“ | `failed` |

**Video-Karte** (in Spalte und Liste):

* Thumbnail 9:16 (56 × 100 px; Handy 48 × 86), sonst Platzhalter mit Play-Icon.
* Titel (2 Zeilen max., `body` 500), darunter `r/aww · u/doglover42 · 0:34` in `caption`.
* Account-Pill mit Kennfarbe, Slot („heute 13:00“), Status-Pill.
* Bei Fehler: Meldung in `--danger` 12 px, max. 2 Zeilen, „Details“ öffnet Log-Eintrag.
* Aktionen (Hover bzw. `⋯`): Vorschau ansehen · Auf Reddit öffnen · Neu rendern · Überspringen ·
  Erneut versuchen (nur Fehler) · Löschen.
* Spaltenkopf: Name, Anzahl, ggf. „Alle erneut versuchen“.
* Spalte „Gepostet“ zeigt nur die letzten 20, Link „Alle im Verlauf“.

Darunter die **Verlaufstabelle** (ersetzt die alte Seite „Verlauf“): Spalten `#` · Video ·
Account · Quelle · Slot · Status · Views 🔧 · Aktionen. Sortier- und filterbar (Status,
Account, Subreddit, Zeitraum), Paginierung 25/50/100, Suchfeld.

### 6.8 Kalender

* Ansichten über Segmented: **Woche** (Standard) · **Monat** · **Liste**.
* **Woche**: Spalten Mo–So, Zeilen 0–24 Uhr (Start-Scroll bei 07:00). Jeder Slot ist ein Chip
  (24 px hoch, `--radius-sm`, linker 3-px-Streifen in Account-Kennfarbe, Hintergrund
  `--surface-2`): Uhrzeit · Account-Name · Status-Icon (leer = noch kein Video, ✓ = gepostet,
  ⚠ = Fehler, ⏱ = bereit).
* Aktuelle Zeit als rote Linie (`--danger`, 1 px, Punkt links).
* Hintergrund optional mit den „heißen“ Stunden der Heatmap (sehr blass `--primary-50`),
  umschaltbar.
* **Monat**: pro Tag Punkte in Kennfarbe (max. 5, dann „+3“).
* Klick auf leeren Bereich (Woche) → Popover „Slot hinzufügen für [Account] um 14:00“.
  Klick auf Slot → Drawer mit Video-Vorschau und Aktionen.
* Hinweis: Slots sind heute pro Account als Uhrzeiten-Liste gespeichert und gelten täglich.
  Wochentag-spezifische Slots sind 🔧. Bis dahin ist der Kalender Lesesicht + Bearbeiten der
  täglichen Zeiten.

### 6.9 Account-Karte

Für die Accounts-Seite (Grid 3 Spalten ≥ 1280 px, 2 ≥ 768 px, 1 darunter).

* Kopf: Avatar 40 px + Name (`card-title`) + `@handle` (`caption`); rechts Status-Pill.
* Status-Pills (Priorität von oben, nur die wichtigste wird gezeigt, weitere als Icon):
  * **Fehler** (`--danger`) – letzter Post fehlgeschlagen
  * **Instagram fehlt** (`--warning`) – keine User-ID oder kein Token
  * **Token läuft ab** (`--warning`) – < 7 Tage 🔧
  * **Keine Quellen** (`--warning`) – keine Subreddits
  * **pausiert** (`--text-3`)
  * **aktiv** (`--success`)
* Zeilen (Label `--text-3` 88 px breit, Wert `--text`): „Zeiten 09:00, 13:00, 19:30“ ·
  „Nächster morgen 09:00“ · „Vorrat 2 Videos bereit“.
* Subreddit-Tags (Pills `--surface-2`, max. 3 + „+2“).
* Mini-Sparkline Views der letzten 14 Tage 🔧 (40 px hoch, ohne Achsen).
* Fuß: Schalter „Aktiv“ (direkt umschaltbar) · Button „Öffnen ›“.
* Ganze Karte klickbar (außer Schalter); Hover: Rand `--border-strong`.

### 6.10 Segmented Control

Wie „Day / Month / Year“ und „Light / Dark“ der Vorlage.

* Container `--surface-2`, 1-px-Rand `--border`, `--radius-md`, 2 px Innenabstand.
* Segmente 32 px hoch, 12 px Innenabstand, `label`.
* Aktiv: `--surface`, `--shadow-xs`, Text `--text` 600. Inaktiv: Text `--text-2`, Hover
  `--text`.
* Technisch `role="radiogroup"` mit Pfeiltasten-Steuerung.

### 6.11 Buttons

| Variante | Light | Dark | Verwendung |
|---|---|---|---|
| Primary | `--primary-600` Fläche, weißer Text; Hover `--primary-700` | `--primary-600` (= `#5B8CF5`) Fläche, Text `#0E1015` | Speichern, Account anlegen |
| Secondary / Outline | `--surface`, Rand `--border-strong`, Text `--text`; Hover `--surface-hover` | gleich mit Dark-Tokens | „Bericht ansehen ›“, „Vorschau rendern“ |
| Ghost | transparent, Text `--text-2`; Hover `--surface-hover` | | Icon-Buttons, `⋯` |
| Danger | Rand `--danger`, Text `--danger`; Hover Fläche `--danger-bg` | | „Account löschen“ |
| Danger solid | `--danger` Fläche, weißer Text | | Bestätigen im Lösch-Dialog |

Größen: `sm` 32 px · `md` 40 px (Standard) · `lg` 44 px (Handy-Primary). Radius `--radius-md`
(nicht mehr Pill wie in der alten UI). Zustände: hover, active (1 px nach unten, dunkler),
focus (`--ring`), disabled (40 % Deckkraft, `cursor: not-allowed`), loading (Spinner 16 px
ersetzt Icon, Text bleibt, Breite bleibt).

### 6.12 Formularelemente

Gleiche Felder wie heute (`.field`), neu gestaltet:

* **Input / Select / Textarea**: 40 px hoch, `--surface`, Rand `--border-strong`, `--radius-md`,
  12 px Innenabstand, Platzhalter `--text-3`. Fokus: Rand `--primary-600` + `--ring`.
  Fehler: Rand `--danger`, Meldung darunter 12 px `--danger` mit Icon. Deaktiviert:
  `--surface-2`, Text `--text-3`.
* **Label** über dem Feld (`label`), Hinweis rechts daneben oder darunter (`caption`), wie heute
  „Posting-Zeiten  HH:MM, mit Komma getrennt“.
* **Passwort/Token-Feld**: maskiert, Auge-Button zum Anzeigen, Kopieren-Button. Gespeicherte
  Tokens werden nie zurückgegeben; Feld zeigt „•••• gespeichert“ + „Ersetzen“.
* **Zeit-Chips** für Posting-Zeiten: statt Freitext eine Chip-Liste („09:00 ×“) + „+ Zeit“
  (öffnet `<input type="time">`). Freitext bleibt als Fallback.
* **Schalter** (Toggle): 40 × 22 px, an = `--primary-600`, aus = `--border-strong`, Knopf weiß.
  Ersetzt den Pink-Orange-Verlauf aus der alten UI.
* **Checkbox / Radio**: 16 px, `--radius-sm`, an = `--primary-600`.
* **Slider** (Lautstärke, Hook-Größe): Spur 4 px `--surface-2`, Füllung `--primary-600`, Knopf 16 px.
* **Platzhalter-Chips** für die Caption (`{title}` …): `mono`, `--surface-2`, klickbar → fügt am
  Cursor ein.

### 6.13 Tabelle

* Kopf: `overline`, `--surface-2`, 40 px hoch.
* Zeilen: 56 px min., Trennlinie `--border`, Hover `--surface-hover`, ausgewählte Zeile
  `--primary-50`.
* Zahlen rechtsbündig, `tabular-nums`.
* Unter 768 px wird jede Zeile zur Karte (Label/Wert-Paare), keine horizontale Scroll-Tabelle.

### 6.14 Status-Pill und Badge

* **Status-Pill**: 22 px hoch, 8 px Innenabstand, `--radius-full`, Hintergrund = `*-bg` der
  Farbe, Text = Farbe, 12/600, 6-px-Punkt links. Farben siehe [3.1](#31-farben).
* **Zähl-Badge** (Sidebar, Spaltenköpfe): siehe [5.1](#51-sidebar).
* **Tag** (Subreddit, Hashtag): `--surface-2`, Rand `--border`, 12/500 `--text-2`, optional ×.

### 6.15 Subreddit-Quellen-Liste

Teil der Account-Detailseite und der Seite „Quellen“.

Jede Quelle als Zeile:

* `r/aww` (14/600) · rechts Schalter „aktiv“ 🔧 und `⋯` (Bearbeiten, Entfernen).
* Darunter in `caption`: „Top / Tag · ≥ 800 ▲ · 5–90 s · NSFW aus“ (wie heute).
* Rechte Kennzahlen 🔧: „Treffer 7 Tage: 12“, „gepostet: 5“, „zuletzt: vor 3 h“. Quelle ohne
  Treffer seit 3 Tagen → orange Hinweis „Keine passenden Videos – Filter lockern?“.
* „Subreddit hinzufügen“ als aufklappbares Formular unter der Liste (Felder wie heute:
  Name, Sortierung, Zeitraum, Min. ▲, Min. s, Max. s, NSFW). Eingabe von `r/` wird automatisch
  entfernt. Button „Testen“ 🔧 zeigt die 5 Videos, die aktuell gefunden würden.

### 6.16 Video-Vorschau (Drawer / Modal)

* Desktop: Drawer von rechts, 480 px. Handy: Vollbild-Sheet von unten.
* Oben: Video-Player im **9:16-Rahmen** (max. 70 vh hoch), Hintergrund `#000`, abgerundet
  `--radius-lg`. Steuerung nativ.
* Darunter: Titel, Quelle mit Link, Account, Slot, Status, Renderdauer.
* **Caption** (vorausgefüllt, editierbar 🔧) mit Zeichenzähler „312 / 2.200“ und Hashtag-Zähler
  „8 / 30“.
* Aktionen: „Freigeben“ (Primary) · „Neu rendern“ · „Überspringen“ · „Auf Reddit öffnen“.
* Bei `published`: „Auf Instagram öffnen“ + Views/Likes/Kommentare 🔧.

### 6.17 Log-Ansicht

* Kopfzeile: Filter Level (Alle · Info · Warnung · Fehler), Quelle (Reddit · Render · Instagram ·
  n8n · System), Account, Zeitraum, Suchfeld. Toggle „Live“ (Auto-Scroll).
* Zeilen: Zeit (`mono`, `--text-3`) · Level-Punkt + Label · Quelle-Tag · Account · Meldung
  (eine Zeile, aufklappbar zu vollem Text + Stacktrace/JSON in `mono`, Kopieren-Button).
* Fehlerzeilen haben links einen 3-px-Streifen `--danger`.
* Verknüpfung: Log-Eintrag mit `post_id` → Link „Video ansehen“.
* 🔧 Heute gibt es nur `posts.error`. Eine eigene Log-Tabelle fehlt (siehe [14](#14-offene-punkte-und-backend-bedarf)).
  Übergangslösung: Log-Seite listet alle Posts mit `error`.

### 6.18 Toast, Dialog, Tooltip, Popover

* **Toast**: unten rechts (Handy: unten mittig über der Tab-Bar), 360 px, `--surface`,
  `--shadow-lg`, linker Streifen in Statusfarbe, schließt nach 5 s (Fehler: bleibt, bis
  geschlossen). Ersetzt den Glas-Toast.
* **Bestätigungsdialog**: 440 px, `--radius-lg`, Hintergrund-Abdunklung `rgb(15 23 42 / .45)`
  ohne Blur. Titel, Text, „Abbrechen“ (Secondary) + Aktion (Danger solid). Bei „Account
  löschen“ muss der Account-Name eingetippt werden.
* **Tooltip**: `--text` als Hintergrund (Light) bzw. `--surface-2` (Dark), 12 px, 6/8 px
  Innenabstand, 300 ms Verzögerung.
* **Popover / Dropdown**: `--surface`, Rand `--border`, `--shadow-sm`, `--radius-md`,
  Einträge 36 px.

### 6.19 Fortschritt

* **Render-Fortschritt**: Balken 4 px, `--surface-2` → `--warning`, Prozent + ETA rechts
  („62 % · ~40 s“) 🔧. Ohne echte Prozentzahl: unbestimmter Balken (Animation), Text „rendert
  seit 1:12“.
* **Spinner**: 16/20 px, 2-px-Ring `--primary-600`.

---

## 7. Seiten

Navigation und Routen (statischer Export, Query-Parameter statt dynamischer Segmente – wie die
bestehende `/account?id=`-Lösung):

| Seite | Route | Ersetzt |
|---|---|---|
| Dashboard | `/` | Übersicht |
| Accounts | `/accounts` | Account-Karten der Übersicht |
| Account-Detail | `/account?id=3` | Account-Seite |
| Neuer Account | `/account` | „+ Account“ |
| Warteschlange | `/queue` | — |
| Verlauf | `/queue?view=history` | Verlauf (`/posts` leitet um) |
| Kalender | `/calendar` | — |
| Statistiken | `/stats` | — |
| Quellen | `/sources` | — |
| Logs | `/logs` | — |
| Einstellungen | `/settings?tab=…` | — |
| System | `/system` | — |

### 7.1 Dashboard

Reihe 1: KPI-Karte (5) · Heatmap „Beste Posting-Zeiten“ (7)
Reihe 2: Reels-Performance (8) · Mini-PC (4)
Reihe 3: **„Heute“** (12) – zwei Hälften:
* links „Nächste Slots“: Liste der nächsten 6 Slots (Zeit · Account · Video-Thumbnail oder
  „noch kein Video“ · Status).
* rechts „Pipeline“: horizontale Mini-Pipeline mit Zählern je Spalte (Gefunden 3 → Rendert 1 →
  Bereit 4 → Gepostet 6 · Fehler 1), jeder Zähler verlinkt in die Warteschlange.
Reihe 4: „Letzte Videos“ (12) – Tabelle der letzten 8 Posts (wie bisher), „Alle anzeigen ›“.

**Hinweisleiste** (über Reihe 1, nur wenn nötig): orange Banner mit Icon, z. B.
„2 Accounts haben keinen Instagram-Token – Reels werden nur vorbereitet, nicht gepostet.
[Einrichten]“ oder rot „n8n hat seit 3 h keinen Slot abgefragt“ 🔧.

### 7.2 Accounts

* Kopf: Titel, Anzahl, Suchfeld, Filter (Alle · Aktiv · Pausiert · Probleme), Primary
  „+ Neuer Account“.
* Grid aus Account-Karten ([6.9](#69-account-karte)).
* Letzte Karte: gestrichelter Rand „+ Account hinzufügen“.

### 7.3 Account-Detail

Kopf: Avatar, Name, Status-Pills, „Nächster Slot: morgen 09:00“; rechts „Vorschau rendern“
(Secondary) und `⋯` (Pausieren, Duplizieren, Löschen).

Reihe 1: KPI-Karte des Accounts (4 Zellen, eine Zeile auf Desktop).
Darunter **Tabs**: Übersicht · Inhalt & Quellen · Zeitplan · Bearbeitung · Verlauf.

* **Übersicht**: Performance-Chart (8) + Heatmap dieses Accounts (4 → volle Breite darunter),
  letzte 5 Videos.
* **Inhalt & Quellen**: links (7) „Grundlagen“ (Name, Thema/Beschreibung 🔧, Aktiv-Schalter) und
  „Inhalt“ (Hook-Schalter, Caption-Vorlage mit Platzhalter-Chips, Hashtags, Caption-Vorschau);
  rechts (5) „Subreddits“ ([6.15](#615-subreddit-quellen-liste)).
* **Zeitplan**: Zeit-Chips, Mini-Wochenkalender dieses Accounts, Vorschlag „Laut Heatmap wären
  12:00 und 18:00 besser“ 🔧.
* **Bearbeitung**: gewähltes Bearbeitungs-Preset ([7.8](#78-einstellungen)) mit
  Überschreibungen pro Account.
* **Verlauf**: Verlaufstabelle gefiltert.
* Ganz unten: **Instagram** (User-ID, Token, Ablaufdatum 🔧, Button „Verbindung testen“ 🔧) und
  **Gefahrenzone** (rot umrandete Karte, „Account löschen“).
* Sticky Speicherleiste unten, sobald etwas geändert wurde: „Ungespeicherte Änderungen ·
  Verwerfen · Speichern“.

### 7.4 Warteschlange

Kopf: Filter (Account, Subreddit, Status), Segmented „Pipeline · Liste · Verlauf“, Button
„+ Video holen“. Darunter Pipeline-Ring (4) + Zähler; dann Kanban ([6.7](#67-pipeline--warteschlange)).

### 7.5 Kalender

Siehe [6.8](#68-kalender). Rechts optional (≥ 1280 px) Seitenleiste 320 px mit „Heute“
und „Ohne Video“ (Slots in den nächsten 24 h, für die noch nichts bereit ist).

### 7.6 Statistiken

Tabs: Performance · Posting-Zeiten · Quellen · Accounts im Vergleich.

* Performance: großer Chart + Tabelle Top-10-Reels (Views, Likes, Kommentare, Quelle).
* Posting-Zeiten: Heatmap groß, darunter Empfehlung je Account.
* Quellen: Tabelle Subreddit · Account · Treffer · gepostet · Ø Views · Fehlerquote; Balken
  inline.
* Accounts im Vergleich: Linien je Account, Tabelle mit Follower-Wachstum 🔧.

Alle Insights-abhängigen Inhalte zeigen bis zur Anbindung einen Leerzustand mit Erklärung
(siehe [8](#8-zustände-leer-laden-fehler)).

### 7.7 Logs

Siehe [6.17](#617-log-ansicht).

### 7.8 Einstellungen

Linke Unter-Navigation (Desktop) bzw. Tabs (Handy):

1. **Zugänge**
   * *Reddit*: Client-ID, Client-Secret, User-Agent, Status „verbunden ✓ / Fehler“, Button
     „Verbindung testen“. Heute kommen diese Werte aus Umgebungsvariablen (`.env` in
     Portainer). Die UI zeigt sie dann **schreibgeschützt** mit Hinweis „Gesetzt über
     Portainer-Stack“. Bearbeiten in der UI ist 🔧.
   * *Instagram / Meta*: Liste aller Accounts mit Token-Status und Ablaufdatum 🔧, Link zur
     Account-Seite.
   * *n8n / API*: API-Key maskiert (Kopieren, „Neu erzeugen“ 🔧), `PUBLIC_BASE_URL`, letzter
     Aufruf von `/api/due` („vor 4 min“ 🔧), Link auf `/api/docs`.
2. **Bearbeitung (Presets)** – das, was das Reel „Instagram-tauglich“ macht und nicht geflaggt
   wird. Ein Preset hat:
   * Format: 1080 × 1920 (fest), Zuschnitt-Modus: *Unscharfer Hintergrund* (heute fest) ·
     *Füllen/Zoom* 🔧 · *Leichter Zoom 103–108 %* 🔧
   * Hook-Text oben: an/aus, Schriftgröße, Max. Zeilen, Hintergrund-Box
   * Quellenangabe unten: an (Pflicht, nicht abschaltbar), Position, Format
     „Video: u/{author} · r/{subreddit}“
   * Lautstärke: Ziel −14 LUFS (Slider −20 … −10)
   * Variationen gegen Duplikat-Erkennung 🔧: leichte Geschwindigkeitsänderung (± %),
     Spiegeln, Farbkorrektur, Rand – jeweils als Schalter mit kurzer Erklärung
   * Max. Länge, Mindestauflösung der Quelle
   * Live-Vorschau: Standbild 9:16 mit Overlays (Hook, Quellenangabe), umschaltbar „Beispiel-
     Video“
   * Presets: Liste (Standard, „Ruhig“, „Meme“ …), Account wählt eins aus.
3. **Automatisierung**: Slot-Fenster (`SLOT_WINDOW_MINUTES`, heute 90 min), max. Versuche pro
   Slot (heute 2), Aufräumen der Medien nach 48 h, Vorschau-Freigabe nötig ja/nein 🔧.
4. **System**: Encoder (`libx264` / `vaapi`, schreibgeschützt aus Env), Host-Port, Version,
   Datenverzeichnis.
5. **Darstellung**: Theme (Hell · Dunkel) mit Link „Systemstandard verwenden“ (Standard),
   Dichte (Normal · Kompakt), Startseite.

### 7.9 System (Mini-PC)

* KPI-Karte: CPU · RAM · Speicher · Ø Renderdauer.
* Großer Ring-Gauge + Verlauf CPU/RAM der letzten 24 h (Linien-Chart, 2 Serien).
* Render-Warteschlange (aktuelles Video mit Fortschritt, dann wartende).
* Container-Info: Uptime, Version/Commit, letzter Build, Healthcheck `/health` ✓.
* Speicher `/media`: Balken belegt/frei, Button „Jetzt aufräumen“ (ruft Cleanup auf).

---

## 8. Zustände: leer, laden, Fehler

Jede Karte und Seite definiert alle drei. Muster:

### 8.1 Laden

* **Skeletons** in der Form des späteren Inhalts, nie ein zentraler Spinner für ganze Seiten.
  * KPI: grauer Kreis + zwei Balken (60 % / 40 %).
  * Heatmap: Zellen in `--surface-2` mit Shimmer.
  * Chart: Achsen sichtbar, Fläche als flacher grauer Balken.
  * Tabellen/Listen: 5 Zeilen à 56 px.
* Erst nach 200 ms anzeigen (verhindert Flackern).
* Nachladen bei bestehenden Daten: alte Daten bleiben, dünner Fortschrittsbalken oben in der
  Karte (2 px, `--primary-600`).

### 8.2 Leer

Aufbau: Icon 40 px in Kreis `--primary-50` · Titel 15/600 · ein Satz Erklärung `--text-2` ·
eine Aktion. Zentriert, 32 px Innenabstand.

| Wo | Titel | Text | Aktion |
|---|---|---|---|
| Dashboard ohne Accounts | Noch keine Accounts | Lege den ersten Instagram-Account an und wähle Subreddits zum Thema. | + Account anlegen |
| Account ohne Subreddits | Keine Quellen | Ohne Subreddits findet der Account keine Videos. | Subreddit hinzufügen |
| Account ohne Instagram | Instagram nicht verbunden | Videos werden vorbereitet, aber nicht gepostet. | Token eintragen |
| Warteschlange leer | Alles erledigt | Für die nächsten Slots wird automatisch ein Video gesucht. | + Video jetzt holen |
| Heatmap/Chart ohne Daten | Noch zu wenig Daten | Nach etwa einer Woche Posten erscheinen hier Muster. | — |
| Insights nicht angebunden 🔧 | Views kommen noch | Statistiken von Instagram werden noch nicht abgerufen. Bis dahin zählen wir gepostete Reels. | Mehr erfahren |
| Logs leer | Keine Einträge | In diesem Zeitraum ist nichts passiert. | Filter zurücksetzen |
| Suche ohne Treffer | Nichts gefunden zu „xyz“ | | Suche löschen |

### 8.3 Fehler

* **Karte**: Inhalt ersetzt durch Icon `triangle-alert` in `--danger`, „Konnte nicht geladen
  werden“, technische Meldung in `caption`, Button „Erneut versuchen“. Andere Karten laden
  weiter.
* **Seite / API weg**: Banner oben „Keine Verbindung zum Reels-Manager. Läuft der Container?“ +
  „Erneut versuchen“; letzte Daten bleiben ausgegraut sichtbar.
* **401/403**: eigene Seite „Nicht angemeldet“ mit Hinweis auf Cloudflare Access bzw. Login.
* **Formular**: Feldfehler am Feld, Sammelfehler oben in der Karte, Toast nur für
  Speichern-Erfolg/-Fehler.
* **Domänenfehler** (Post fehlgeschlagen, Token abgelaufen, Reddit-Limit, ffmpeg-Fehler,
  Speicher voll): erscheinen als Status-Pill, Glocken-Eintrag, Log-Eintrag und – wenn
  dringend – als Hinweisleiste auf dem Dashboard.
* **Teilweise Daten** (z. B. Insights für einen Account fehlen): Wert „—“ mit Tooltip
  „Keine Daten von Instagram“.

---

## 9. Light- und Dark-Theme

### 9.1 Umschalten

* **Standard: Systemeinstellung** (`prefers-color-scheme`). Solange der Nutzer nichts wählt,
  wechselt die Oberfläche live mit dem System (z. B. nachts automatisch dunkel).
* Theme-Umschalter in der Sidebar (Hell · Dunkel, wie Vorlage) überschreibt das; Einstellungen →
  Darstellung → „Systemstandard verwenden“ setzt es zurück.
* Eine eigene Wahl wird in `localStorage` (`theme`) gespeichert und als `data-theme` am
  `<html>` gesetzt; ohne Eintrag gilt die Media-Query. Ein kleines
  Inline-Skript im `<head>` setzt das Attribut **vor** dem ersten Paint (kein Aufblitzen).
* `color-scheme: light` bzw. `dark` passend setzen (native Scrollbars, Datumsfelder).
* `<meta name="theme-color">` je Theme: `#F3F4F8` / `#0E1015`.

### 9.2 Regeln für Dark

* Alle Farben nur über Tokens; keine festen Hex-Werte in Komponenten.
* Flächen werden nach oben **heller** (`--bg` < `--surface` < `--surface-2`), Schatten
  entfallen weitgehend.
* Primärblau wird heller (`#5B8CF5`), damit es auf dunklem Grund AA erreicht.
* Heatmap-Skala im Dark: dieselben 4 Stufen mit den Dark-Werten von `--primary-50` bis
  `--primary-600`; höchste Stufe bleibt die kräftigste.
* Chart-Fläche: Verlauf 24 % → 0 % (statt 16 %), damit sie sichtbar bleibt.
* Bilder/Thumbnails bekommen 1-px-Rand `--border`, damit sie sich vom Grund lösen.

---

## 10. Responsives Verhalten

Breakpoints (Tailwind-Standard): `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536.

| Bereich | ≥ 1280 (Desktop) | 1024–1279 (Laptop) | 768–1023 (Tablet) | < 768 (Handy) |
|---|---|---|---|---|
| Sidebar | 248 px, voll | 248 px | **eingeklappt 72 px** (nur Icons, Tooltips, Badges als Punkt); Klick auf ☰ öffnet sie als Overlay | **weg**; Bottom-Tab-Bar + Menü-Sheet |
| Topbar | alles | ohne Mini-PC-Chip | Suche als Icon | 56 px: Account-Switcher (kompakt) links, Titel Mitte, Glocke rechts |
| Grid | 12 Spalten | 12 Spalten | 6 Spalten (Karten volle Breite oder halb) | 1 Spalte |
| Dashboard Reihe 1 | KPI 5 + Heatmap 7 | 5 + 7 | KPI volle Breite, Heatmap volle Breite | KPI 2×2, Heatmap darunter |
| Dashboard Reihe 2 | Chart 8 + Mini-PC 4 | 8 + 4 | Chart volle Breite, Mini-PC volle Breite | gestapelt |
| Pipeline | Kanban, alle Spalten sichtbar | Kanban, horizontal scrollbar | Kanban, scrollbar mit Snap | **Liste** mit Filter-Chips je Status |
| Kalender | Woche | Woche | Woche (3 Tage sichtbar, wischen) | **Liste** (Tagesgruppen), Monat als Option |
| Tabellen | Tabelle | Tabelle | Tabelle, unwichtige Spalten weg | Karten |
| Drawer | rechts 480 px | rechts 480 px | rechts 420 px | Vollbild-Sheet |

### 10.1 Handy im Detail

* **Bottom-Tab-Bar** (64 px + Safe-Area, `--surface`, Oberrand `--border`): Dashboard ·
  Warteschlange (mit Badge) · Kalender · Accounts · Mehr. „Mehr“ öffnet ein Sheet mit
  Statistiken, Quellen, Logs, Einstellungen, System, Hilfe und dem Theme-Umschalter.
* **Account-Switcher** wandert in die Topbar (Avatar + Name, Tippen öffnet Sheet).
* KPI-Karte bleibt 2×2, Zahlen 24 px. Delta-Text kürzer: „+1,0 %“ ohne „ggü. Vorwoche“.
* **Heatmap**: 24 Spalten passen nicht. Darstellung mit **6 Spalten à 4-h-Blöcken**
  (0–4, 4–8, … 20–24) und Umschalter „Detail“, der auf horizontal scrollbare 24 Spalten wechselt
  (erste Spalte mit Wochentagen bleibt stehen).
* **Chart**: 220 px hoch, X-Achse nur 4 Beschriftungen, Tooltip per Tippen, verschwindet bei
  Tippen daneben.
* **Mini-PC**: Ring kleiner (140 px), Liste darunter.
* Formulare: Inputs 44 px hoch, Schrift 16 px (verhindert iOS-Zoom), Primary-Buttons volle
  Breite, Speicherleiste über der Tab-Bar.
* Tippflächen min. 44 × 44 px.
* Wischgesten: in Listen nach links wischen → „Überspringen“ / „Erneut versuchen“ (zusätzlich
  immer über `⋯` erreichbar).

---

## 11. Barrierefreiheit

* Kontrast AA (siehe [3.1](#31-farben)); Status nie nur über Farbe – immer Label oder Icon dazu.
* Sichtbarer Fokus (`--ring`) auf allem Bedienbaren; Reihenfolge = visuelle Reihenfolge.
* Sidebar `nav[aria-label="Hauptnavigation"]`, aktive Seite `aria-current="page"`,
  aufklappbare Gruppen `aria-expanded`.
* Charts und Heatmap haben eine **Tabellen-Alternative** („Als Tabelle anzeigen“ im `⋯`-Menü)
  und eine Kurzbeschreibung per `aria-describedby`
  („Höchste Views dienstags 12–14 Uhr“).
* Live-Bereiche (`aria-live="polite"`) für Toasts und Render-Fortschritt.
* Tastenkürzel: `⌘K`/`Strg K` Suche, `g d` Dashboard, `g q` Warteschlange, `g k` Kalender,
  `?` Übersicht der Kürzel.
* `prefers-reduced-motion` und `prefers-contrast: more` (Ränder `--border-strong`) werden
  beachtet.

---

## 12. Performance auf dem Mini-PC

Der Server ist ein Celeron N2930, der nebenbei ffmpeg rendert. Daraus folgt für die Oberfläche:

* Weiterhin **statischer Export**; keine serverseitige Laufzeit für das Frontend.
* Keine schwere Chart-Bibliothek: Charts, Heatmap und Gauge als **eigenes SVG** (wenige
  hundert Zeilen) oder höchstens eine kleine Lib (< 50 kB gz). Kein Canvas-Rendering nötig.
* Keine Blur-/SVG-Filter-Effekte, keine Glas-Optik.
* Polling sparsam: Dashboard 30 s, Mini-PC 10 s, Render-Fortschritt 3 s – alles nur bei
  sichtbarem Tab (`document.visibilityState`), sonst pausiert.
* Thumbnails: beim Rendern ein JPG (270 × 480, ~20 kB) mit erzeugen 🔧; nie das MP4 als
  Vorschau in Listen laden.
* Schrift selbst gehostet, nur Latin-Subset, 1 variable Datei.

---

## 13. Umsetzung im bestehenden Stack

Nur als Orientierung für die spätere Umsetzung:

* `web/app/globals.css`: `.backdrop`, `.frost`, Pink-Akzente entfernen; Tokens aus
  [Abschnitt 3](#3-design-tokens) als `@theme`-Variablen + `[data-theme="dark"]`-Block.
  Klassen `.field`, `.label`, `.hint`, `.switch`, `.status`, `.data-table` behalten ihre Namen,
  bekommen aber das neue Aussehen – so bleiben bestehende Seiten lauffähig.
* `web/app/layout.tsx`: `GlassArea` + `Nav` durch `AppShell` (Sidebar + Topbar + Inhalt)
  ersetzen; Theme-Skript in `<head>`.
* `web/components/ui/Nav.tsx` → `Sidebar.tsx`, `Topbar.tsx`, `BottomTabs.tsx`,
  `AccountSwitcher.tsx`.
* `web/components/glass/` und `liquid-glass-react` entfernen; `GlassButton` → `Button`.
* Neue Bausteine: `Card`, `KpiCard`, `Heatmap`, `AreaChart`, `RingGauge`, `Segmented`,
  `StatusPill`, `Badge`, `EmptyState`, `Skeleton`, `Drawer`, `VideoCard`, `Pipeline`,
  `CalendarWeek`, `LogTable`.
* `web/lib/api.ts`: neue Typen für System, Insights, Logs (siehe unten), `Post.status` als
  Union-Typ.
* Bestehende Routen `/`, `/posts`, `/account` bleiben erreichbar (`/posts` →
  `/queue?view=history`).

---

## 14. Offene Punkte und Backend-Bedarf

Alles mit 🔧 braucht Daten oder Funktionen, die es im Backend (`app/`) heute nicht gibt:

| Bedarf | Wofür | Vorschlag |
|---|---|---|
| Instagram-Insights (Plays, Likes, Kommentare, Reichweite, Follower) | KPI Ø Views, Performance-Chart, Heatmap nach Views, Quellen-Statistik | n8n holt täglich `/{ig-media-id}/insights` und meldet an neuen Endpunkt `POST /api/posts/{id}/insights`; Tabelle `post_insights` |
| System-Werte (CPU, RAM, Speicher, Temperatur, Encoder) | Mini-PC-Gauge, System-Seite | `GET /ui-api/system` (aus `/proc` bzw. `psutil`), plus Verlauf 24 h im Speicher |
| Log-Tabelle | Logs-Seite, Glocke | Tabelle `events` (Zeit, Level, Quelle, Account, Post, Meldung, Details) |
| Zusätzliche Post-Status `found`, `scheduled`, `skipped` | Pipeline-Spalten | Status-Erweiterung in `db.py`; `scheduled` alternativ abgeleitet aus `ready` + `slot` |
| Render-Fortschritt | Fortschrittsbalken | ffmpeg `-progress` auswerten, im Speicher halten |
| Thumbnails | Video-Karten | beim Rendern `thumb.jpg` erzeugen |
| Token-Ablaufdatum, „Verbindung testen“ | Account-Status, Einstellungen | Meta `debug_token` abfragen |
| Wochentag-spezifische Slots | Kalender bearbeiten | `posting_times` um Wochentage erweitern |
| Quelle aktiv/inaktiv, Treffer-Statistik, „Testen“ | Quellen-Liste | Spalte `active` in `sources`, Zähler aus `posts` |
| Bearbeitungs-Presets, Varianten gegen Duplikat-Erkennung | Einstellungen → Bearbeitung | Tabelle `presets`, `render.py` parametrisieren |
| Zugänge in der UI ändern | Einstellungen → Zugänge | bewusst offen: heute über Portainer-Env; Bearbeiten in der UI nur, wenn Secrets verschlüsselt in der DB liegen sollen |
| Letzter n8n-Aufruf | Hinweis „n8n fragt nicht ab“ | Zeitstempel bei `GET /api/due` speichern |
| Caption pro Video bearbeiten, Freigabe-Pflicht | Video-Vorschau | `PATCH /ui-api/posts/{id}` |

Entschieden (Henri): Theme folgt standardmäßig der Systemeinstellung, keine Glas-Optik,
Design und Farben so genau wie möglich wie in der Vorlage.

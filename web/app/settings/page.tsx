"use client"

import { Moon, Sun } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import type { ReactNode } from "react"
import { Card, CardHeader, ErrorState, Segmented, SkeletonRows, TonePill } from "@/components/ui/kit"
import { relTime, type SettingsInfo } from "@/lib/api"
import { useApi, useData, type Theme } from "@/lib/data"

type Tab = "access" | "render" | "automation" | "system" | "look"
const TABS: { value: Tab; label: string }[] = [
  { value: "access", label: "Zugänge" }, { value: "render", label: "Bearbeitung" }, { value: "automation", label: "Automatisierung" },
  { value: "system", label: "System" }, { value: "look", label: "Darstellung" },
]

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="sm:w-56 sm:flex-none"><div className="font-medium text-ink">{label}</div>{hint && <div className="caption">{hint}</div>}</div>
      <div className="min-w-0 flex-1 break-words text-ink sm:text-right">{children}</div>
    </div>
  )
}
function Flag({ ok, yes = "gesetzt", no = "fehlt" }: { ok: boolean; yes?: string; no?: string }) {
  return <TonePill tone={ok ? "success" : "warning"}>{ok ? yes : no}</TonePill>
}
const ENV_NOTE = "Diese Werte kommen aus den Umgebungsvariablen des Portainer-Stacks und lassen sich hier nur ansehen. Zum Ändern den Stack in Portainer bearbeiten und neu starten."

export default function SettingsPage() {
  const params = useSearchParams()
  const router = useRouter()
  const { accounts, theme, themeChoice, setTheme } = useData()
  const tab = (TABS.some((t) => t.value === params.get("tab")) ? params.get("tab") : "access") as Tab
  const { data: cfg, error, loading, reload } = useApi<SettingsInfo>("/settings")

  return (
    <div className="flex flex-col gap-4 md:gap-6 lg:flex-row">
      <nav aria-label="Einstellungen" className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:w-52 lg:flex-none lg:flex-col lg:px-0">
        {TABS.map((t) => (
          <button key={t.value} type="button" aria-current={tab === t.value ? "page" : undefined} onClick={() => router.replace(`/settings?tab=${t.value}`, { scroll: false })}
            className={`flex h-10 flex-none items-center rounded-[10px] px-3 text-left font-medium ${tab === t.value ? "bg-primary-50 font-semibold text-primary-700" : "text-ink-2 hover:bg-hover"}`}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-4 md:gap-6">
        {tab !== "look" && error && !cfg ? <Card><ErrorState message={error} onRetry={reload} /></Card> : tab !== "look" && loading && !cfg ? <Card><SkeletonRows /></Card> : null}

        {tab === "access" && cfg && (
          <>
            <Card>
              <CardHeader title="Reddit" sub="App vom Typ „script“ für die offizielle API"><Flag ok={cfg.reddit.configured} yes="verbunden" no="nicht eingerichtet" /></CardHeader>
              <Row label="Client-ID" hint="REDDIT_CLIENT_ID"><Flag ok={cfg.reddit.client_id_set} /></Row>
              <Row label="Client-Secret" hint="REDDIT_CLIENT_SECRET"><Flag ok={cfg.reddit.secret_set} /></Row>
              <Row label="User-Agent" hint="REDDIT_USER_AGENT"><span className="font-mono text-xs">{cfg.reddit.user_agent}</span></Row>
            </Card>
            <Card>
              <CardHeader title="Instagram" sub="Token und User-ID werden pro Account gespeichert" />
              {accounts.length === 0 ? <p className="text-ink-3">Noch keine Accounts.</p> : accounts.map((a) => (
                <Row key={a.id} label={a.name} hint={a.ig_user_id ? `ID ${a.ig_user_id}` : "keine User-ID"}>
                  <span className="flex items-center gap-3 sm:justify-end">
                    <Flag ok={!!a.ig_user_id && a.has_token} yes="Token gespeichert" no={a.has_token ? "User-ID fehlt" : "Token fehlt"} />
                    <Link href={`/account?id=${a.id}&tab=content`} className="btn btn-sm">Bearbeiten</Link>
                  </span>
                </Row>
              ))}
            </Card>
            <Card>
              <CardHeader title="n8n und API" sub="n8n ruft die API mit dem Header X-API-Key auf"><Flag ok={cfg.api.key_set} yes="API-Key gesetzt" no="API-Key fehlt" /></CardHeader>
              <Row label="Öffentliche Adresse" hint="PUBLIC_BASE_URL, von hier lädt Instagram die Videos"><span className="font-mono text-xs">{cfg.api.public_base_url}</span></Row>
              <Row label="Letzte Abfrage von n8n" hint="GET /api/due">{cfg.api.last_n8n_poll ? relTime(cfg.api.last_n8n_poll) : "noch nicht seit dem Start"}</Row>
              <Row label="Login für die Oberfläche" hint="UI_USER / UI_PASSWORD">{cfg.ui_auth ? "Basic Auth aktiv" : "aus (Schutz über Cloudflare Access)"}</Row>
              <Row label="API-Doku"><a className="link" href="/api/docs" target="_blank" rel="noopener noreferrer">/api/docs</a></Row>
            </Card>
            <p className="caption">{ENV_NOTE}</p>
          </>
        )}

        {tab === "render" && cfg && (
          <div className="grid grid-cols-12 gap-4 md:gap-6">
            <Card className="col-span-12 xl:col-span-7">
              <CardHeader title="Standard-Preset" sub="So wird jedes Video für Instagram aufbereitet" />
              <Row label="Format">{cfg.render.width} × {cfg.render.height} px (9:16), H.264/AAC</Row>
              <Row label="Zuschnitt">Original mittig auf unscharfem Hintergrund</Row>
              <Row label="Hook-Text oben" hint="pro Account schaltbar">Titel des Reddit-Posts</Row>
              <Row label="Quellenangabe unten" hint="immer an">Video: u/autor · r/subreddit</Row>
              <Row label="Lautstärke">{cfg.render.loudness_lufs} LUFS</Row>
              <Row label="Reihenfolge">Ein Video nach dem anderen, damit der Mini-PC nicht überlastet</Row>
            </Card>
            <Card className="col-span-12 xl:col-span-5">
              <CardHeader title="Vorschau" sub="Aufbau eines fertigen Reels" />
              <div className="mx-auto flex aspect-[9/16] w-44 flex-col justify-between overflow-hidden rounded-[16px] border border-line bg-surface-2 p-3 text-center" aria-label="Schema: Hook-Text oben, Video in der Mitte, Quellenangabe unten">
                <span className="rounded-[6px] bg-surface px-2 py-1 text-[11px] font-semibold text-ink">Hook-Text</span>
                <span className="flex aspect-video items-center justify-center rounded-[6px] bg-primary-200 text-[11px] font-medium text-ink">Original-Video</span>
                <span className="text-[10px] text-ink-3">Video: u/autor · r/subreddit</span>
              </div>
            </Card>
            <p className="caption col-span-12">Eigene Presets (Zoom, Varianten, Schriftgröße) gibt es noch nicht, die Werte sind fest im Renderer hinterlegt.</p>
          </div>
        )}

        {tab === "automation" && cfg && (
          <>
            <Card>
              <CardHeader title="Automatisierung" />
              <Row label="Slot-Fenster" hint="SLOT_WINDOW_MINUTES">Ein Slot bleibt {cfg.automation.slot_window_minutes} Minuten nach seiner Uhrzeit fällig</Row>
              <Row label="Versuche pro Slot">höchstens {cfg.automation.max_attempts_per_slot}</Row>
              <Row label="Aufräumen der Medien" hint="MEDIA_RETENTION_HOURS">nach dem Posten, spätestens nach {cfg.automation.media_retention_hours} Stunden</Row>
              <Row label="Zeitzone" hint="TZ">{cfg.timezone}</Row>
            </Card>
            <p className="caption">{ENV_NOTE}</p>
          </>
        )}

        {tab === "system" && cfg && (
          <>
            <Card>
              <CardHeader title="System"><Link href="/system" className="btn btn-sm">Auslastung ansehen</Link></CardHeader>
              <Row label="Encoder" hint="ENCODER">{cfg.render.encoder === "vaapi" ? "VAAPI (Intel-GPU), fällt bei Fehlern auf CPU zurück" : "CPU (libx264)"}</Row>
              <Row label="x264-Preset" hint="X264_PRESET">{cfg.render.x264_preset}</Row>
              <Row label="Datenverzeichnis" hint="DATA_DIR"><span className="font-mono text-xs">{cfg.data_dir}</span></Row>
            </Card>
            <p className="caption">{ENV_NOTE}</p>
          </>
        )}

        {tab === "look" && (
          <Card>
            <CardHeader title="Darstellung" sub={themeChoice ? "Eigene Wahl gespeichert" : "Folgt der Einstellung deines Geräts"} />
            <Row label="Theme" hint="Hell oder Dunkel">
              <span className="flex flex-wrap items-center gap-3 sm:justify-end">
                <Segmented<Theme> label="Theme" value={theme} onChange={setTheme} options={[{ value: "light", label: <><Sun size={16} /> Hell</> }, { value: "dark", label: <><Moon size={16} /> Dunkel</> }]} />
                <button type="button" className="btn btn-sm" disabled={!themeChoice} onClick={() => setTheme(null)}>Systemstandard verwenden</button>
              </span>
            </Row>
          </Card>
        )}
      </div>
    </div>
  )
}

export type Source = {
  id: number
  account_id: number
  subreddit: string
  sort: string
  time_filter: string
  min_score: number
  min_duration: number
  max_duration: number
  allow_nsfw: number
}

export type Account = {
  id: number
  name: string
  ig_user_id: string
  ig_username: string
  token_expires_at: string
  token_refreshed_at: string
  has_token: boolean
  active: boolean
  posting_times: string
  caption_template: string
  hashtags: string
  hook_enabled: boolean
  next_slot: string | null
  created_at: string
  sources?: Source[]
}

export type Post = {
  id: number
  account_id: number
  account_name: string
  reddit_id: string
  subreddit: string
  title: string
  author: string
  permalink: string
  status: string
  media_file: string | null
  caption: string | null
  ig_media_id: string | null
  error: string | null
  slot: string | null
  created_at: string
  updated_at: string
}

export type Overview = {
  accounts: Account[]
  posts: Post[]
  due: { account_id: number; name: string; slot: string }[]
  stats: { by_status: Record<string, number>; published_7d: number }
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/ui-api${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
  })
  if (!res.ok) {
    let msg = `Fehler ${res.status}`
    try {
      const data = await res.json()
      if (typeof data.detail === "string") msg = data.detail
      else if (Array.isArray(data.detail)) msg = data.detail.map((d: { msg: string }) => d.msg).join(", ")
    } catch {}
    throw new ApiError(msg, res.status)
  }
  return res.json() as Promise<T>
}

export type Stats = {
  days: number
  daily: { date: string; published: number; failed: number }[]
  heatmap: number[][]
  week: { published: number; failed: number }
  previous_week: { published: number; failed: number }
  by_status: Record<string, number>
  sources: { account_id: number; subreddit: string; total: number; published: number; failed: number; last: string | null }[]
}

export type SystemInfo = {
  cpu: number
  cores: number
  memory: { total: number; used: number; percent: number }
  disk: { total: number; used: number; free: number; percent: number }
  media: { count: number; bytes: number }
  temperature: number | null
  encoder: string
  uptime_seconds: number
  last_n8n_poll: number | null
  render: { rendering: { id: number; title: string; subreddit: string; created_at: string; account_name: string }[] }
  history: { t: number; cpu: number; ram: number }[]
  time: number
}

export type SettingsInfo = {
  reddit: { configured: boolean; client_id_set: boolean; secret_set: boolean; user_agent: string }
  api: { key_set: boolean; public_base_url: string; last_n8n_poll: number | null }
  instagram: { configured: boolean; app_id: string; config_id: string; redirect_uri: string; deauthorize_url: string; data_deletion_url: string; graph_api_base: string }
  ui_auth: boolean
  render: { encoder: string; x264_preset: string; width: number; height: number; loudness_lufs: number }
  automation: { slot_window_minutes: number; max_attempts_per_slot: number; media_retention_hours: number }
  timezone: string
  data_dir: string
}

export const STATUS_LABEL: Record<string, string> = {
  rendering: "Rendert",
  ready: "Bereit",
  scheduled: "Geplant",
  publishing: "Wird gepostet",
  published: "Gepostet",
  failed: "Fehler",
  preview: "Vorschau",
}

/** "scheduled" is derived: a rendered video that already belongs to a slot (UIDesign.md 6.7). */
export function displayStatus(p: Post): string {
  return p.status === "ready" && p.slot ? "scheduled" : p.status
}

/** Fixed order by account id; colours only from the template (UIDesign.md 3.1). */
const ACCOUNT_COLORS = ["#235EE8", "#6CAEFA", "#FF835B", "#22A35E", "#7B9EF2", "#1D4EC4", "#A1E2FF", "#939395"]
export function accountColor(id: number): string {
  return ACCOUNT_COLORS[(Math.max(1, id) - 1) % ACCOUNT_COLORS.length]
}

export function accountBody(a: Account, patch: Partial<Account> = {}) {
  const m = { ...a, ...patch }
  return {
    name: m.name, ig_user_id: m.ig_user_id, access_token: "", active: m.active, posting_times: m.posting_times,
    caption_template: m.caption_template, hashtags: m.hashtags, hook_enabled: m.hook_enabled,
  }
}

/** Days until the Instagram token expires, null if unknown (manually pasted token). */
export function tokenDaysLeft(a: Account): number | null {
  if (!a.has_token || !a.token_expires_at) return null
  return Math.floor((new Date(a.token_expires_at).getTime() - Date.now()) / 86_400_000)
}

/** Starts the Meta login (Unified Login, full page navigation, Meta redirects back to /account). */
export const instagramConnectUrl = (accountId?: number) => `/ui-api/instagram/connect${accountId ? `?account_id=${accountId}` : ""}`

export function parseTimes(raw: string): string[] {
  const out = new Set<string>()
  for (const part of raw.split(/[,; ]+/)) {
    const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(part.trim())
    if (!m) continue
    const h = +m[1], min = +(m[2] ?? 0)
    if (h < 24 && min < 60) out.add(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`)
  }
  return [...out].sort()
}

export type AccountIssue = { tone: "danger" | "warning" | "muted" | "success"; label: string }
export function accountIssue(a: Account, posts: Post[] = []): AccountIssue {
  const last = posts.find((p) => p.account_id === a.id && (p.status === "published" || p.status === "failed"))
  if (last?.status === "failed") return { tone: "danger", label: "Fehler" }
  if (!a.ig_user_id || !a.has_token) return { tone: "warning", label: "Instagram fehlt" }
  if (tokenDaysLeft(a) !== null && tokenDaysLeft(a)! < 7) return { tone: "warning", label: "Token läuft ab" }
  if (a.sources && a.sources.length === 0) return { tone: "warning", label: "Keine Quellen" }
  if (!a.active) return { tone: "muted", label: "pausiert" }
  return { tone: "success", label: "aktiv" }
}

const nf = new Intl.NumberFormat("de-DE")
export const fmt = (n: number) => nf.format(n)
export function fmtBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toLocaleString("de-DE", { maximumFractionDigits: 1 })} GB`
  if (b >= 1e6) return `${Math.round(b / 1e6)} MB`
  return `${Math.round(b / 1e3)} kB`
}
export function relTime(iso: string | number | null): string {
  if (!iso) return "–"
  const t = typeof iso === "number" ? iso * 1000 : new Date(iso).getTime()
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return "gerade eben"
  if (s < 3600) return `vor ${Math.floor(s / 60)} min`
  if (s < 86400) return `vor ${Math.floor(s / 3600)} h`
  return `vor ${Math.floor(s / 86400)} T`
}
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
export function trend(now: number, before: number): number | null {
  if (!before) return null
  return ((now - before) / before) * 100
}
export function formatSlot(slot: string | null): string {
  if (!slot) return "–"
  const [date, time] = slot.split(" ")
  const [y, m, d] = date.split("-").map(Number)
  const today = new Date()
  const tomorrow = new Date(Date.now() + 86_400_000)
  const same = (a: Date) => a.getFullYear() === y && a.getMonth() + 1 === m && a.getDate() === d
  if (same(today)) return `heute ${time}`
  if (same(tomorrow)) return `morgen ${time}`
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}. ${time}`
}

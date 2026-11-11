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

export const STATUS_LABEL: Record<string, string> = {
  rendering: "rendert",
  ready: "bereit",
  publishing: "wird gepostet",
  published: "gepostet",
  failed: "Fehler",
  preview: "Vorschau",
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

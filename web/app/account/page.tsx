"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { GlassSurface } from "@/components/glass"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { GlassButton } from "@/components/ui/GlassButton"
import { PostList } from "@/components/ui/PostList"
import { useToast } from "@/components/ui/Toast"
import { api, formatSlot, type Account, type Post, type Source } from "@/lib/api"

const DEFAULT_CAPTION = "{title}\n\n🎥 Credit: u/{author} on r/{subreddit}\n{hashtags}"
const PLACEHOLDERS = ["{title}", "{author}", "{subreddit}", "{permalink}", "{hashtags}"]

type Form = {
  name: string
  ig_user_id: string
  access_token: string
  active: boolean
  posting_times: string
  caption_template: string
  hashtags: string
  hook_enabled: boolean
}

const EMPTY: Form = {
  name: "",
  ig_user_id: "",
  access_token: "",
  active: true,
  posting_times: "12:00, 18:30",
  caption_template: DEFAULT_CAPTION,
  hashtags: "",
  hook_enabled: true,
}

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="frost mt-14 h-96 animate-pulse" />}>
      <AccountEditor />
    </Suspense>
  )
}

function AccountEditor() {
  const params = useSearchParams()
  const router = useRouter()
  const toast = useToast()
  const id = Number(params.get("id")) || null

  const [account, setAccount] = useState<Account | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [form, setForm] = useState<Form>(EMPTY)
  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    if (!id) {
      setAccount(null)
      setForm(EMPTY)
      setLoading(false)
      return
    }
    try {
      const d = await api<{ account: Account; sources: Source[]; posts: Post[] }>(`/accounts/${id}`)
      setAccount(d.account)
      setSources(d.sources)
      setPosts(d.posts)
      setForm({
        name: d.account.name,
        ig_user_id: d.account.ig_user_id,
        access_token: "",
        active: d.account.active,
        posting_times: d.account.posting_times,
        caption_template: d.account.caption_template,
        hashtags: d.account.hashtags,
        hook_enabled: d.account.hook_enabled,
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const saved = await api<Account>(id ? `/accounts/${id}` : "/accounts", { method: id ? "PUT" : "POST", body: form })
      toast(id ? "Gespeichert" : "Account angelegt")
      if (!id) router.replace(`/account?id=${saved.id}`)
      else {
        setAccount(saved)
        set("access_token", "")
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function preview() {
    if (!id) return
    try {
      await api(`/accounts/${id}/preview`, { method: "POST" })
      toast("Vorschau wird im Hintergrund gerendert (ein paar Minuten). Sie erscheint unten im Verlauf.")
      setTimeout(load, 5000)
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  async function remove() {
    if (!id) return
    setDeleting(true)
    try {
      await api(`/accounts/${id}`, { method: "DELETE" })
      toast("Account gelöscht")
      router.push("/")
    } catch (e) {
      toast((e as Error).message, "error")
      setDeleting(false)
    }
  }

  const times = useMemo(
    () => form.posting_times.split(/[,; ]+/).map((t) => t.trim()).filter(Boolean),
    [form.posting_times],
  )

  const captionPreview = useMemo(
    () =>
      form.caption_template
        .replaceAll("{title}", "Dieser Hund hat keine Angst vor Wasser")
        .replaceAll("{author}", "doglover42")
        .replaceAll("{subreddit}", sources[0]?.subreddit ?? "aww")
        .replaceAll("{permalink}", "https://reddit.com/r/aww/…")
        .replaceAll("{hashtags}", form.hashtags),
    [form.caption_template, form.hashtags, sources],
  )

  if (loading) return <div className="frost mt-14 h-96 animate-pulse" />
  if (id && !account) {
    return (
      <div className="frost mt-14 flex flex-col items-center gap-3 px-6 py-12 text-center">
        <p>{error ?? "Account nicht gefunden."}</p>
        <Link href="/" className="btn-ghost">← Zur Übersicht</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-5 pt-6 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/" className="text-sm font-medium text-muted hover:text-white">← Übersicht</Link>
          <h1 className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">{account ? account.name : "Neuer Account"}</h1>
          {account && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className={`status ${account.active ? "s-published" : "s-rendering"}`}>{account.active ? "aktiv" : "pausiert"}</span>
              <span className={`status ${account.ig_user_id && account.has_token ? "s-ready" : "s-rendering"}`}>
                {account.ig_user_id && account.has_token ? "Instagram verbunden" : "Instagram fehlt"}
              </span>
              {account.active && <span className="text-muted">Nächster Slot: {formatSlot(account.next_slot)}</span>}
            </div>
          )}
        </div>
        {account && (
          <div className="flex flex-wrap gap-3">
            <GlassButton onClick={preview} disabled={!sources.length} title={sources.length ? undefined : "Erst Subreddits hinzufügen"}>
              ▶ Vorschau rendern
            </GlassButton>
          </div>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <form onSubmit={save} className="flex flex-col gap-6" aria-describedby={error ? "form-error" : undefined}>
          <Panel title="Grundlagen">
            <label className="label">
              Name
              <input className="field" required maxLength={100} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="z. B. Tiere" />
            </label>
            <Switch checked={form.active} onChange={(v) => set("active", v)}>Aktiv – automatisch posten</Switch>
            <label className="label">
              <span>Posting-Zeiten <span className="hint">HH:MM, mit Komma getrennt</span></span>
              <input className="field" value={form.posting_times} onChange={(e) => set("posting_times", e.target.value)} placeholder="09:00, 13:00, 19:30" />
            </label>
            {times.length > 0 && (
              <div className="-mt-2 flex flex-wrap gap-1.5">
                {times.map((t, i) => <span key={i} className="rounded-full bg-white/10 px-2.5 py-1 text-xs tabular-nums">🕒 {t}</span>)}
              </div>
            )}
          </Panel>

          <Panel title="Instagram">
            <label className="label">
              <span>Instagram-User-ID <span className="hint">Business- oder Creator-Account</span></span>
              <input className="field" value={form.ig_user_id} onChange={(e) => set("ig_user_id", e.target.value)} placeholder="1784…" inputMode="numeric" />
            </label>
            <label className="label">
              <span>
                Access Token{" "}
                {account?.has_token && <span className="hint">gesetzt – leer lassen zum Behalten</span>}
              </span>
              <input className="field" type="password" autoComplete="off" value={form.access_token} onChange={(e) => set("access_token", e.target.value)} placeholder={account?.has_token ? "••••••••" : "Langlebiger Token"} />
            </label>
          </Panel>

          <Panel title="Inhalt">
            <Switch checked={form.hook_enabled} onChange={(v) => set("hook_enabled", v)}>Titel als Hook-Text oben im Video</Switch>
            <label className="label">
              Caption-Vorlage
              <textarea className="field min-h-36 font-mono text-sm" rows={6} value={form.caption_template} onChange={(e) => set("caption_template", e.target.value)} />
            </label>
            <div className="-mt-2 flex flex-wrap gap-1.5" aria-label="Platzhalter einfügen">
              {PLACEHOLDERS.map((p) => (
                <button key={p} type="button" className="rounded-full bg-white/10 px-2.5 py-1 font-mono text-xs hover:bg-white/20" onClick={() => set("caption_template", form.caption_template + p)}>
                  {p}
                </button>
              ))}
            </div>
            <label className="label">
              Hashtags
              <input className="field" value={form.hashtags} onChange={(e) => set("hashtags", e.target.value)} placeholder="#funny #animals" />
            </label>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted hover:text-white">Caption-Vorschau</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-2xl bg-black/30 p-4 font-sans text-sm leading-relaxed">{captionPreview}</pre>
            </details>
          </Panel>

          {error && <p id="form-error" role="alert" className="frost px-5 py-3 text-sm text-[#ffc2c2]">{error}</p>}
          <div className="flex items-center gap-4">
            <GlassButton type="submit" tone="accent" size="lg" disabled={saving}>{saving ? "Speichert…" : id ? "Speichern" : "Account anlegen"}</GlassButton>
          </div>
        </form>

        {account && (
          <aside className="flex flex-col gap-6">
            <Sources accountId={account.id} sources={sources} onChange={setSources} />
            <div className="frost flex flex-col gap-3 px-6 py-5 text-sm">
              <h2 className="text-base font-semibold">Gefahrenzone</h2>
              <p className="text-muted">Löscht den Account mit allen Subreddits und dem Verlauf.</p>
              <button type="button" className="btn-ghost btn-danger w-fit" onClick={() => setConfirmDelete(true)}>Account löschen</button>
            </div>
          </aside>
        )}
      </div>

      {account && (
        <section aria-labelledby="hist-h" className="flex flex-col gap-4">
          <h2 id="hist-h" className="text-xl font-semibold">Verlauf</h2>
          <PostList posts={posts} showAccount={false} />
        </section>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`„${account?.name}“ löschen?`}
        confirmLabel="Endgültig löschen"
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
        busy={deleting}
      >
        Subreddits und Verlauf dieses Accounts werden ebenfalls gelöscht. Das lässt sich nicht rückgängig machen.
      </ConfirmDialog>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <GlassSurface variant="panel" layout="fill" intensity="subtle" padding="24px 26px">
      <fieldset className="flex w-full flex-col gap-5">
        <legend className="mb-4 text-lg font-semibold">{title}</legend>
        {children}
      </fieldset>
    </GlassSurface>
  )
}

function Switch({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true" />
      <span>{children}</span>
    </label>
  )
}

const SORT_LABEL: Record<string, string> = { top: "Top", hot: "Hot", rising: "Rising", new: "Neu" }
const TIME_LABEL: Record<string, string> = { hour: "Stunde", day: "Tag", week: "Woche", month: "Monat", year: "Jahr", all: "immer" }

function Sources({ accountId, sources, onChange }: { accountId: number; sources: Source[]; onChange: (s: Source[]) => void }) {
  const toast = useToast()
  const [sub, setSub] = useState("")
  const [sort, setSort] = useState("top")
  const [timeFilter, setTimeFilter] = useState("day")
  const [minScore, setMinScore] = useState(500)
  const [minDur, setMinDur] = useState(5)
  const [maxDur, setMaxDur] = useState(90)
  const [nsfw, setNsfw] = useState(false)
  const [busy, setBusy] = useState(false)

  async function add(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const d = await api<{ sources: Source[] }>(`/accounts/${accountId}/sources`, {
        method: "POST",
        body: { subreddit: sub, sort, time_filter: timeFilter, min_score: minScore, min_duration: minDur, max_duration: maxDur, allow_nsfw: nsfw },
      })
      onChange(d.sources)
      setSub("")
      toast(`r/${sub.replace(/^r\//, "")} hinzugefügt`)
    } catch (e) {
      toast((e as Error).message, "error")
    } finally {
      setBusy(false)
    }
  }

  async function remove(s: Source) {
    try {
      await api(`/sources/${s.id}`, { method: "DELETE" })
      onChange(sources.filter((x) => x.id !== s.id))
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  return (
    <GlassSurface variant="panel" layout="fill" intensity="subtle" padding="24px 26px">
      <div className="flex w-full flex-col gap-5">
        <h2 className="text-lg font-semibold">Subreddits</h2>
        {sources.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Subreddits. Ohne Quelle wird nichts gepostet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/10 overflow-hidden rounded-2xl bg-black/20">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">r/{s.subreddit}</div>
                  <div className="text-xs text-muted">
                    {SORT_LABEL[s.sort] ?? s.sort}
                    {s.sort === "top" && ` / ${TIME_LABEL[s.time_filter] ?? s.time_filter}`} · ≥ {s.min_score} ▲ · {s.min_duration}–{s.max_duration} s
                    {s.allow_nsfw ? " · NSFW" : ""}
                  </div>
                </div>
                <button type="button" className="btn-ghost btn-danger !px-3 !py-1.5 text-xs" onClick={() => remove(s)} aria-label={`r/${s.subreddit} entfernen`}>
                  Entfernen
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={add} className="flex flex-col gap-3 border-t border-white/10 pt-5">
          <label className="label">
            Subreddit hinzufügen
            <input className="field" required value={sub} onChange={(e) => setSub(e.target.value)} placeholder="z. B. aww" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="label">
              Sortierung
              <select className="field" value={sort} onChange={(e) => setSort(e.target.value)}>
                {Object.entries(SORT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="label">
              Zeitraum
              <select className="field" value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} disabled={sort !== "top"}>
                {Object.entries(TIME_LABEL).filter(([v]) => v !== "hour").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="label">
              Min. ▲
              <input className="field" type="number" min={0} value={minScore} onChange={(e) => setMinScore(+e.target.value)} />
            </label>
            <label className="label">
              Min. s
              <input className="field" type="number" min={0} value={minDur} onChange={(e) => setMinDur(+e.target.value)} />
            </label>
            <label className="label">
              Max. s
              <input className="field" type="number" min={1} max={900} value={maxDur} onChange={(e) => setMaxDur(+e.target.value)} />
            </label>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Switch checked={nsfw} onChange={setNsfw}>NSFW erlauben</Switch>
            <button type="submit" className="btn-ghost !bg-white/20" disabled={busy}>{busy ? "…" : "+ Hinzufügen"}</button>
          </div>
        </form>
      </div>
    </GlassSurface>
  )
}

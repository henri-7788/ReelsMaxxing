"use client"

import { Eye, EyeOff, Film, Layers, Play, Plus, Send, TriangleAlert, X } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { PerformanceCard, PostingTimesCard, statsPath } from "@/components/cards"
import { KpiCard } from "@/components/charts/KpiCard"
import { PostTable, usePostDrawer, VideoDrawer } from "@/components/posts"
import { Sources } from "@/components/Sources"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { AccountAvatar, Card, CardHeader, ErrorState, Menu, Segmented, Skeleton, Switch, TonePill } from "@/components/ui/kit"
import { useToast } from "@/components/ui/Toast"
import { accountBody, api, formatSlot, instagramConnectUrl, parseTimes, tokenDaysLeft, trend, type Account, type Post, type Source, type Stats } from "@/lib/api"
import { useApi, useData } from "@/lib/data"

type Form = ReturnType<typeof accountBody>
type Tab = "overview" | "content" | "schedule" | "history"
const EMPTY: Form = { name: "", ig_user_id: "", access_token: "", active: true, posting_times: "18:00", caption_template: "{title}\n\n🎥 Credit: u/{author} on r/{subreddit}\n{hashtags}", hashtags: "", hook_enabled: true }
const PLACEHOLDERS = ["{title}", "{author}", "{subreddit}", "{permalink}", "{hashtags}"]

function Panel({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} sub={sub} />
      <div className="flex flex-col gap-4">{children}</div>
    </Card>
  )
}

function TimeChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const times = parseTimes(value)
  const [draft, setDraft] = useState("")
  const add = () => {
    if (!draft) return
    onChange(parseTimes([...times, draft].join(",")).join(", "))
    setDraft("")
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {times.length === 0 && <span className="caption">Noch keine Zeiten. Ohne Zeiten wird nichts gepostet.</span>}
        {times.map((t) => (
          <span key={t} className="tag !h-8 !pr-1 text-[13px] tabular">
            {t}
            <button type="button" className="icon-btn !size-6" aria-label={`${t} entfernen`} onClick={() => onChange(times.filter((x) => x !== t).join(", "))}><X size={14} /></button>
          </span>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <label className="label w-36">
          Neue Zeit
          <input className="field tabular" type="time" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }} />
        </label>
        <button type="button" className="btn" onClick={add} disabled={!draft}><Plus size={16} /> Zeit</button>
      </div>
      <p className="hint">Die Zeiten gelten täglich. Ein Slot bleibt nach seiner Uhrzeit noch eine Weile fällig, falls n8n später abfragt.</p>
    </div>
  )
}

export default function AccountPage() {
  const params = useSearchParams()
  const router = useRouter()
  const toast = useToast()
  const { reload: reloadAll } = useData()
  const id = Number(params.get("id")) || null
  const tab = (["overview", "content", "schedule", "history"].includes(params.get("tab") ?? "") ? params.get("tab") : "overview") as Tab

  const [account, setAccount] = useState<Account | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [form, setForm] = useState<Form>(EMPTY)
  const [saved, setSaved] = useState<Form>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const stats = useApi<Stats>(id ? statsPath(id, 30) : null, 60_000)
  const drawer = usePostDrawer()

  const load = useCallback(async (keepForm = false) => {
    if (!id) {
      setAccount(null)
      setForm(EMPTY)
      setSaved(EMPTY)
      setLoading(false)
      return
    }
    try {
      const d = await api<{ account: Account; sources: Source[]; posts: Post[] }>(`/accounts/${id}`)
      setAccount(d.account)
      setSources(d.sources)
      setPosts(d.posts)
      if (!keepForm) {
        setForm(accountBody(d.account))
        setSaved(accountBody(d.account))
      }
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // Back from the Meta login (/api/instagram/callback redirects here with ?ig=connected|error)
  const igHandled = useRef<string | null>(null)
  useEffect(() => {
    const ig = params.get("ig")
    if (!ig || igHandled.current === params.toString()) return
    igHandled.current = params.toString()
    if (ig === "connected") toast(params.get("ig_message") || "Instagram verbunden")
    else toast(`Instagram-Verbindung fehlgeschlagen: ${params.get("ig_message") ?? "unbekannter Fehler"}`, "error")
    reloadAll()
    router.replace(id ? `/account?id=${id}` : "/account", { scroll: false })
  }, [params, id, router, toast, reloadAll])

  async function disconnectInstagram() {
    if (!id) return
    try {
      const res = await api<Account>(`/accounts/${id}/instagram/disconnect`, { method: "POST" })
      setAccount(res)
      toast("Instagram getrennt")
      reloadAll()
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const setTab = (t: Tab) => router.replace(`/account?id=${id}&tab=${t}`, { scroll: false })

  async function save(e?: FormEvent) {
    e?.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await api<Account>(id ? `/accounts/${id}` : "/accounts", { method: id ? "PUT" : "POST", body: form })
      toast(id ? "Gespeichert" : "Account angelegt")
      reloadAll()
      if (!id) router.replace(`/account?id=${res.id}&tab=content`)
      else {
        setAccount(res)
        setForm(accountBody(res))
        setSaved(accountBody(res))
      }
    } catch (e) {
      setError((e as Error).message)
      toast((e as Error).message, "error")
    } finally {
      setSaving(false)
    }
  }

  async function preview() {
    if (!id) return
    try {
      await api(`/accounts/${id}/preview`, { method: "POST" })
      toast("Vorschau wird im Hintergrund gerendert (ein paar Minuten). Sie erscheint im Verlauf.")
      setTimeout(() => load(true), 5000)
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
      reloadAll()
      router.push("/accounts")
    } catch (e) {
      toast((e as Error).message, "error")
      setDeleting(false)
    }
  }

  const captionPreview = useMemo(
    () => form.caption_template
      .replaceAll("{title}", "Dieser Hund hat keine Angst vor Wasser")
      .replaceAll("{author}", "doglover42")
      .replaceAll("{subreddit}", sources[0]?.subreddit ?? "aww")
      .replaceAll("{permalink}", "https://reddit.com/r/aww/…")
      .replaceAll("{hashtags}", form.hashtags),
    [form.caption_template, form.hashtags, sources],
  )

  if (loading) return <div className="flex flex-col gap-6"><Skeleton className="h-16 !rounded-[16px]" /><Skeleton className="h-96 !rounded-[16px]" /></div>
  if (id && !account) {
    return <Card><ErrorState message={error ?? "Account nicht gefunden."} onRetry={() => load()} /><div className="pb-6 text-center"><Link href="/accounts" className="btn btn-sm">Zu den Accounts</Link></div></Card>
  }

  const connected = !!account?.ig_user_id && !!account?.has_token
  const s = stats.data
  const ready = posts.filter((p) => p.status === "ready" || p.status === "preview").length
  const failed7 = s?.week.failed ?? 0

  const basics = (
    <Panel title="Grundlagen">
      <label className="label">
        Name
        <input className="field" required maxLength={100} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="z. B. Tiere" />
      </label>
      <Switch checked={form.active} onChange={(v) => set("active", v)}>Aktiv, automatisch posten</Switch>
    </Panel>
  )
  const schedule = (
    <Panel title="Posting-Zeiten" sub="Uhrzeiten, zu denen dieser Account ein Reel postet">
      <TimeChips value={form.posting_times} onChange={(v) => set("posting_times", v)} />
    </Panel>
  )
  const daysLeft = account ? tokenDaysLeft(account) : null
  const instagram = (
    <Panel title="Instagram" sub="Professionelles Instagram-Konto, verbunden per Login mit Instagram oder Facebook">
      {account ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-48 flex-1">
            {connected ? (
              <>
                <p className="font-medium text-ink">{account.ig_username ? `@${account.ig_username}` : `ID ${account.ig_user_id}`}</p>
                <p className="caption">
                  {daysLeft === null ? "Token läuft nicht ab" : daysLeft < 0 ? "Token abgelaufen, bitte neu verbinden" : `Token gültig noch ${daysLeft} Tage`}
                </p>
              </>
            ) : <p className="caption">Noch nicht verbunden. Reels werden vorbereitet, aber nicht gepostet.</p>}
          </div>
          <a className={connected ? "btn btn-sm" : "btn btn-primary"} href={instagramConnectUrl(account.id)}>{connected ? "Neu verbinden" : "Mit Instagram verbinden"}</a>
          {connected && <Menu items={[{ label: "Instagram trennen", danger: true, onSelect: disconnectInstagram }]} />}
        </div>
      ) : <p className="caption">Nach dem Anlegen verbindest du den Account mit einem Klick über Instagram oder Facebook.</p>}
      <details className="group">
        <summary className="cursor-pointer text-[13px] text-ink-3">Token manuell eintragen</summary>
        <div className="mt-3 flex flex-col gap-4">
          <label className="label">
            Instagram-User-ID
            <input className="field" value={form.ig_user_id} onChange={(e) => set("ig_user_id", e.target.value)} placeholder="1784…" inputMode="numeric" />
          </label>
          <label className="label">
            <span>Access Token {account?.has_token && <span className="hint">•••• gespeichert, leer lassen zum Behalten</span>}</span>
            <span className="relative">
              <input className="field !pr-11" type={showToken ? "text" : "password"} autoComplete="off" value={form.access_token} onChange={(e) => set("access_token", e.target.value)} placeholder={account?.has_token ? "Neuen Token eintragen, um ihn zu ersetzen" : "Langlebiger Token"} />
              <button type="button" className="icon-btn absolute right-1 top-1/2 !size-8 -translate-y-1/2" aria-label={showToken ? "Token verbergen" : "Token anzeigen"} onClick={() => setShowToken((x) => !x)}>{showToken ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </span>
          </label>
        </div>
      </details>
    </Panel>
  )
  const content = (
    <Panel title="Inhalt">
      <Switch checked={form.hook_enabled} onChange={(v) => set("hook_enabled", v)}>Titel als Hook-Text oben im Video</Switch>
      <label className="label">
        Caption-Vorlage
        <textarea className="field min-h-36 font-mono !text-[13px]" rows={6} value={form.caption_template} onChange={(e) => set("caption_template", e.target.value)} />
      </label>
      <div className="-mt-1 flex flex-wrap gap-1.5" aria-label="Platzhalter einfügen">
        {PLACEHOLDERS.map((p) => <button key={p} type="button" className="tag font-mono hover:border-line-strong" onClick={() => set("caption_template", form.caption_template + p)}>{p}</button>)}
      </div>
      <label className="label">
        Hashtags
        <input className="field" value={form.hashtags} onChange={(e) => set("hashtags", e.target.value)} placeholder="#funny #animals" />
      </label>
      <div>
        <div className="mb-1.5 flex justify-between"><span className="text-[13px] font-medium text-label">Caption-Vorschau</span><span className="caption tabular">{captionPreview.length} / 2.200</span></div>
        <pre className="whitespace-pre-wrap rounded-[10px] border border-line bg-surface-2 p-3 font-sans text-ink-2">{captionPreview}</pre>
      </div>
    </Panel>
  )

  if (!account) {
    return (
      <form onSubmit={save} className="mx-auto flex max-w-2xl flex-col gap-4 md:gap-6">
        <div><h2 className="page-title">Neuer Account</h2><p className="mt-1">Subreddits fügst du im nächsten Schritt hinzu.</p></div>
        {basics}{schedule}{instagram}{content}
        {error && <p role="alert" className="rounded-[10px] border border-danger bg-danger-bg px-4 py-3 text-ink">{error}</p>}
        <div className="flex justify-end gap-2"><Link href="/accounts" className="btn">Abbrechen</Link><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Legt an…" : "Account anlegen"}</button></div>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <header className="flex flex-wrap items-center gap-4">
        <AccountAvatar account={account} size={48} />
        <div className="min-w-48 flex-1">
          <h2 className="page-title truncate">{account.name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <TonePill tone={account.active ? "success" : "muted"}>{account.active ? "aktiv" : "pausiert"}</TonePill>
            <TonePill tone={connected ? "success" : "warning"}>{connected ? "Instagram verbunden" : "Instagram fehlt"}</TonePill>
            {sources.length === 0 && <TonePill tone="warning">Keine Quellen</TonePill>}
            {account.active && <span className="caption">Nächster Slot: {formatSlot(account.next_slot)}</span>}
          </div>
        </div>
        <button type="button" className="btn" onClick={preview} disabled={!sources.length} title={sources.length ? undefined : "Erst Subreddits hinzufügen"}><Play size={16} /> Vorschau rendern</button>
        <Menu items={[{ label: "Account löschen", danger: true, onSelect: () => setConfirmDelete(true) }]} />
      </header>

      <div className="max-w-full overflow-x-auto">
        <Segmented<Tab> label="Bereich" value={tab} onChange={setTab} options={[{ value: "overview", label: "Übersicht" }, { value: "content", label: "Inhalt & Quellen" }, { value: "schedule", label: "Zeitplan" }, { value: "history", label: "Verlauf" }]} />
      </div>

      {tab === "overview" && (
        <>
          <KpiCard row loading={stats.loading && !s} items={[
            { label: "Gepostet (7 Tage)", value: s?.week.published ?? "–", icon: Send, delta: s ? trend(s.week.published, s.previous_week.published) : null },
            { label: "Videos auf Vorrat", value: ready, icon: Layers, note: "bereit oder Vorschau" },
            { label: "Gepostet gesamt", value: s?.by_status.published ?? 0, icon: Film, note: "seit Anlage des Accounts" },
            { label: "Fehler (7 Tage)", value: failed7, icon: TriangleAlert, delta: s ? trend(failed7, s.previous_week.failed) : null, lowerIsBetter: true },
          ]} />
          <div className="grid grid-cols-12 gap-4 md:gap-6">
            <PerformanceCard accountId={account.id} className="col-span-12 xl:col-span-7" />
            <PostingTimesCard accountId={account.id} account={account} className="col-span-12 xl:col-span-5" />
          </div>
          <Card pad={false}>
            <div className="card-pad !pb-0"><CardHeader title="Letzte Videos"><button type="button" className="btn btn-sm" onClick={() => setTab("history")}>Verlauf</button></CardHeader></div>
            <PostTable posts={posts.slice(0, 5)} onOpen={drawer.open} showAccount={false} empty="Noch keine Videos für diesen Account." />
          </Card>
        </>
      )}

      {tab === "content" && (
        <div className="grid grid-cols-12 gap-4 md:gap-6">
          <div className="col-span-12 flex flex-col gap-4 md:gap-6 xl:col-span-7">{basics}{content}{instagram}</div>
          <div className="col-span-12 flex flex-col gap-4 md:gap-6 xl:col-span-5">
            <Sources accountId={account.id} sources={sources} stats={s?.sources} onChange={(next) => { setSources(next); reloadAll() }} />
            <section className="card card-pad !border-danger">
              <h2 className="card-title">Gefahrenzone</h2>
              <p className="mt-1">Löscht den Account mit allen Subreddits und dem Verlauf.</p>
              <button type="button" className="btn btn-danger mt-4" onClick={() => setConfirmDelete(true)}>Account löschen</button>
            </section>
          </div>
        </div>
      )}

      {tab === "schedule" && (
        <div className="grid grid-cols-12 gap-4 md:gap-6">
          <div className="col-span-12 xl:col-span-5">{schedule}</div>
          <PostingTimesCard accountId={account.id} account={{ ...account, posting_times: form.posting_times }} className="col-span-12 xl:col-span-7" />
        </div>
      )}

      {tab === "history" && (
        <Card pad={false}><PostTable posts={posts} onOpen={drawer.open} showAccount={false} empty="Noch keine Videos für diesen Account." /></Card>
      )}

      {dirty && (
        <div className="sticky bottom-20 z-20 flex flex-wrap items-center gap-3 rounded-[16px] border border-line bg-surface px-4 py-3 shadow-lg md:bottom-6">
          <span className="flex-1 font-medium text-ink">Ungespeicherte Änderungen</span>
          <button type="button" className="btn" onClick={() => setForm(saved)} disabled={saving}>Verwerfen</button>
          <button type="button" className="btn btn-primary" onClick={() => save()} disabled={saving}>{saving ? "Speichert…" : "Speichern"}</button>
        </div>
      )}

      <ConfirmDialog open={confirmDelete} title={`„${account.name}“ löschen?`} confirmLabel="Endgültig löschen" onConfirm={remove} onClose={() => setConfirmDelete(false)} busy={deleting} typeToConfirm={account.name}>
        Subreddits und Verlauf dieses Accounts werden ebenfalls gelöscht. Das lässt sich nicht rückgängig machen.
      </ConfirmDialog>
      <VideoDrawer post={drawer.post} onClose={drawer.close} />
    </div>
  )
}

"use client"

import { Eye, EyeOff, Film, Layers, Play, Plus, Send, TriangleAlert, X } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { PerformanceCard, PostingTimesCard, statsPath } from "@/components/cards"
import { KpiCard } from "@/components/charts/KpiCard"
import { PostTable, usePostDrawer, VideoDrawer } from "@/components/posts"
import { ConnectChecklist, ConnectOverlay, useInstagramConnect } from "@/components/InstagramConnect"
import { PresetEditor } from "@/components/ReelEditor"
import { Sources } from "@/components/Sources"
import { StartRun } from "@/components/StartRun"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { AccountAvatar, Card, CardHeader, ErrorState, Menu, Segmented, Skeleton, Switch, TonePill } from "@/components/ui/kit"
import { useToast } from "@/components/ui/Toast"
import { accountBody, api, dayKey, formatSlot, intervalTimes, parseTimes, scheduleLabel, setWorkflow, tokenDaysLeft, trend, type Account, type Plan, type Post, type ScheduleMode, type Source, type Stats } from "@/lib/api"
import { useApi, useData } from "@/lib/data"
import type { Preset } from "@/lib/overlay"

type Form = ReturnType<typeof accountBody>
type Tab = "overview" | "content" | "editor" | "schedule" | "history"
const EMPTY: Form = { name: "", ig_user_id: "", access_token: "", active: false, posting_times: "18:00", schedule_mode: "times", interval_hours: 6, interval_start: "08:00", interval_hours_max: 0, caption_template: "{title}\n\n🎥 Credit: u/{author} on r/{subreddit}\n{hashtags}", hashtags: "", hook_enabled: true }
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
      <p className="hint">Die Zeiten gelten täglich. Gerendert wird vorher automatisch, sodass das Video zur Uhrzeit fertig ist.</p>
    </div>
  )
}

function IntervalFields({ hours, max, start, onHours, onMax, onStart, upcoming, unsaved }: {
  hours: number; max: number; start: string; onHours: (v: number) => void; onMax: (v: number) => void; onStart: (v: string) => void
  /** Saved random posting times from the server (random gaps cannot be computed here) */
  upcoming: string[]; unsaved: boolean
}) {
  const random = max > 0
  const fixed = intervalTimes(hours, start)
  const fmt = (n: number) => String(n).replace(".", ",")
  return (
    <div className="flex flex-col gap-3">
      <Switch checked={random} onChange={(v) => onMax(v ? Math.min(168, hours + 2) : 0)}>Zufälliger Abstand (Bereich)</Switch>
      <div className="flex flex-wrap items-end gap-3">
        <label className="label w-32">
          {random ? "Abstand von (h)" : "Alle … Stunden"}
          <input className="field tabular" type="number" min={0.5} max={168} step={0.5} value={hours} onChange={(e) => onHours(+e.target.value)} />
        </label>
        {random && (
          <label className="label w-32">
            bis (h)
            <input className="field tabular" type="number" min={hours} max={168} step={0.5} value={max} onChange={(e) => onMax(+e.target.value)} />
          </label>
        )}
        <label className={`label ${random ? "w-52" : "w-36"}`}>
          {random ? "Erster Workflow-Durchlauf" : "Beginnend um"}
          <input className="field tabular" type="time" value={start} onChange={(e) => onStart(e.target.value)} />
        </label>
      </div>
      {random ? (
        <>
          <div className="flex flex-wrap gap-1.5" aria-label="Nächste Posting-Zeiten">
            {unsaved ? <span className="caption">Nach dem Speichern erscheinen hier die nächsten Zeiten.</span>
              : upcoming.length === 0 ? <span className="caption">Keine Zeiten in den nächsten Tagen.</span>
              : upcoming.slice(0, 8).map((t) => <span key={t} className="tag tabular">{formatSlot(t)}</span>)}
          </div>
          <p className="hint">Der erste Workflow-Durchlauf postet zu dieser Uhrzeit (gerendert wird vorher). Danach kommt der nächste irgendwann {fmt(hours)} bis {fmt(max)} Stunden später. Die Zeitpunkte werden schon Tage im Voraus festgelegt, damit das Rendern früh eingeplant wird; im Kalender und im Render-Plan siehst du sie.</p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" aria-label="Posting-Zeiten heute">
            {fixed.length === 0 ? <span className="caption">Abstand zwischen 0,5 und 168 Stunden wählen.</span>
              : fixed.map((t) => <span key={t} className="tag tabular">{t}</span>)}
          </div>
          <p className="hint">Der Rhythmus läuft über Mitternacht weiter{hours > 24 ? ", also nicht jeden Tag zur selben Zeit" : 24 % hours ? ", die Uhrzeiten verschieben sich daher von Tag zu Tag" : ""}. Oben die Zeiten von heute.</p>
        </>
      )}
    </div>
  )
}

/** Upcoming render blocks and posting times of this account from the shared, overlap-free plan. */
function RenderPlanCard({ accountId, active, className = "" }: { accountId: number; active: boolean; className?: string }) {
  const { data, error } = useApi<Plan>(`/plan?account_id=${accountId}&days=3`, 30_000)
  const t = (iso: string) => new Date(iso).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" })
  const renders = data?.renders.slice(0, 8) ?? []
  const blocked = data?.blocked[0]
  return (
    <Card className={className}>
      <CardHeader title="Render-Plan" sub={data?.render_minutes ? `Je Video ${data.render_minutes} min reserviert, fertig ${data.lead_minutes} min vor dem Posten. Nie zwei gleichzeitig, auch nicht accountübergreifend.` : undefined} />
      {error && !data ? <ErrorState message={error} /> : !data ? <Skeleton className="h-24" /> : data.automation !== "internal" ? (
        <p className="caption">Gesteuert über n8n (AUTOMATION=n8n). Der eingebaute Autopilot ist aus.</p>
      ) : !active ? (
        <p className="caption">Workflow ist aus. Schalte ihn oben ein, dann wird hier geplant.</p>
      ) : blocked ? (
        <p className="flex items-center gap-2 text-ink"><TriangleAlert size={16} className="flex-none text-warning" /> Nichts geplant: {blocked.reason}.</p>
      ) : renders.length === 0 ? <p className="caption">Keine Slots in den nächsten Tagen.</p> : (
        <ul className="divide-y divide-line">
          {renders.map((r) => (
            <li key={r.slot} className="flex items-center gap-3 py-2">
              <span className="w-36 flex-none whitespace-nowrap font-medium text-ink tabular">Post {formatSlot(r.slot)}</span>
              <span className="caption flex-1 tabular">Rendern {t(r.start)} – {new Date(r.end).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
              <TonePill tone={r.state === "running" ? "success" : r.state === "late" ? "warning" : "muted"}>{r.state === "running" ? "läuft" : r.state === "late" ? "knapp" : "geplant"}</TonePill>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export default function AccountPage() {
  const params = useSearchParams()
  const router = useRouter()
  const toast = useToast()
  const { reload: reloadAll } = useData()
  const id = Number(params.get("id")) || null
  const tab = (["overview", "content", "editor", "schedule", "history"].includes(params.get("tab") ?? "") ? params.get("tab") : "overview") as Tab

  const [account, setAccount] = useState<Account | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [presets, setPresets] = useState<Preset[]>([])
  const [form, setForm] = useState<Form>(EMPTY)
  const [saved, setSaved] = useState<Form>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [businessName, setBusinessName] = useState("")
  const [metaAppId, setMetaAppId] = useState("")
  const [metaBusinessId, setMetaBusinessId] = useState("")
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
      const d = await api<{ account: Account; sources: Source[]; posts: Post[]; presets?: Preset[]; instagram_setup?: { business_name: string; app_id?: string; business_id?: string } }>(`/accounts/${id}`)
      setPresets(d.presets ?? [])
      setAccount(d.account)
      setBusinessName(d.instagram_setup?.business_name ?? "")
      setMetaAppId(d.instagram_setup?.app_id ?? "")
      setMetaBusinessId(d.instagram_setup?.business_id ?? "")
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

  const igConnect = useInstagramConnect((r) => {
    if (!r) toast("Anmeldung abgebrochen")
    else if (r.ig === "connected") toast(r.message || "Instagram verbunden")
    else toast(`Instagram-Verbindung fehlgeschlagen: ${r.message || "unbekannter Fehler"}`, "error")
    reloadAll()
    if (r?.ig === "connected" && r.account_id && r.account_id !== id) router.push(`/account?id=${r.account_id}`)
    else load(true)
  })

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

  // Old per-account switch: the title is now switched in the preset, this only turns the old switch back on
  async function enableHook() {
    if (!account) return
    try {
      const res = await api<Account>(`/accounts/${account.id}`, { method: "PUT", body: accountBody(account, { hook_enabled: true }) })
      setAccount(res)
      setForm((f) => ({ ...f, hook_enabled: true }))
      setSaved((f) => ({ ...f, hook_enabled: true }))
      toast("Titel wieder eingeschaltet")
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  async function toggleWorkflow(on: boolean) {
    if (!account) return
    try {
      const res = await setWorkflow(account.id, on)
      setAccount(res)
      setForm((f) => ({ ...f, active: on }))
      setSaved((f) => ({ ...f, active: on }))
      toast(on ? "Workflow an: holt, rendert und postet jetzt automatisch" : "Workflow aus")
      reloadAll()
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  const reloadAfterRun = useCallback(() => { load(true); reloadAll() }, [load, reloadAll])

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
      <Switch checked={form.active} onChange={(v) => set("active", v)}>Workflow an: holt, rendert und postet automatisch</Switch>
    </Panel>
  )
  const schedule = (
    <Panel title="Veröffentlichung" sub="Wann dieser Account ein Reel postet">
      <Segmented<ScheduleMode> label="Art" value={form.schedule_mode} onChange={(v) => set("schedule_mode", v)} options={[{ value: "times", label: "Feste Uhrzeiten" }, { value: "interval", label: "Alle X Stunden" }]} />
      {form.schedule_mode === "interval"
        ? <IntervalFields hours={form.interval_hours} max={form.interval_hours_max} start={form.interval_start} onHours={(v) => set("interval_hours", v)} onMax={(v) => set("interval_hours_max", v)} onStart={(v) => set("interval_start", v)}
            upcoming={(account?.upcoming_slots ?? []).filter((t) => t > dayKey(new Date()) + " " + new Date().toTimeString().slice(0, 5))}
            unsaved={!account || form.interval_hours !== saved.interval_hours || form.interval_hours_max !== saved.interval_hours_max || form.interval_start !== saved.interval_start || form.schedule_mode !== saved.schedule_mode} />
        : <TimeChips value={form.posting_times} onChange={(v) => set("posting_times", v)} />}
    </Panel>
  )
  const daysLeft = account ? tokenDaysLeft(account) : null
  const instagram = (
    <Panel title="Instagram" sub="Professionelles Instagram-Konto, verbunden per Login mit Instagram oder Facebook">
      {account ? (
        <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-wrap content-start items-center gap-3">
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
          <button type="button" className={connected ? "btn btn-sm" : "btn btn-primary"} onClick={() => igConnect.start(account.id)}>{connected ? "Neu verbinden" : "Mit Instagram verbinden"}</button>
          {connected && <Menu items={[{ label: "Instagram trennen", danger: true, onSelect: disconnectInstagram }]} />}
        </div>
        <ConnectChecklist accountId={account.id} business={businessName} appId={metaAppId} businessId={metaBusinessId} />
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
      {account && <p className="hint">Titel und Quellenangabe im Video stellst du im Tab <Link href={`/account?id=${account.id}&tab=editor`} className="link">Editor</Link> ein.</p>}
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
            <Switch checked={account.active} onChange={toggleWorkflow} label="Workflow ein oder aus">Workflow</Switch>
            <TonePill tone={connected ? "success" : "warning"}>{connected ? "Instagram verbunden" : "Instagram fehlt"}</TonePill>
            {sources.length === 0 && <TonePill tone="warning">Keine Quellen</TonePill>}
            {account.active && <span className="caption">Nächster Post: {formatSlot(account.next_slot)} · {scheduleLabel(account)}</span>}
          </div>
        </div>
        <StartRun account={account} hasSources={sources.length > 0} onChange={reloadAfterRun} />
        <button type="button" className="btn" onClick={preview} disabled={!sources.length} title={sources.length ? undefined : "Erst Subreddits hinzufügen"}><Play size={16} /> Vorschau rendern</button>
        <Menu items={[{ label: "Account löschen", danger: true, onSelect: () => setConfirmDelete(true) }]} />
      </header>

      <div className="max-w-full overflow-x-auto">
        <Segmented<Tab> label="Bereich" value={tab} onChange={setTab} options={[{ value: "overview", label: "Übersicht" }, { value: "content", label: "Inhalt & Quellen" }, { value: "editor", label: "Editor" }, { value: "schedule", label: "Zeitplan" }, { value: "history", label: "Verlauf" }]} />
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

      {tab === "editor" && (
        <PresetEditor account={{ ...account, hook_enabled: form.hook_enabled }} presets={presets}
          sample={posts[0] ? { title: posts[0].title, author: posts[0].author, subreddit: posts[0].subreddit } : undefined}
          onChange={(r) => {
            setPresets(r.presets)
            const next = r.account?.preset_id ?? (r.presets.some((p) => p.id === account.preset_id) ? account.preset_id : null)
            setAccount((a) => (a ? { ...a, preset_id: next } : a))
          }}
          onEnableHook={enableHook} />
      )}

      {tab === "schedule" && (
        <div className="grid grid-cols-12 gap-4 md:gap-6">
          <div className="col-span-12 flex flex-col gap-4 md:gap-6 xl:col-span-5">
            {schedule}
            <RenderPlanCard accountId={account.id} active={account.active} />
          </div>
          <PostingTimesCard accountId={account.id} account={{ ...account, posting_times: form.posting_times, schedule_mode: form.schedule_mode, interval_hours: form.interval_hours, interval_start: form.interval_start, interval_hours_max: form.interval_hours_max }} className="col-span-12 xl:col-span-7" />
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
      {igConnect.waiting && <ConnectOverlay onReopen={igConnect.reopen} onCancel={igConnect.cancel} tabClosed={igConnect.tabClosed} />}
    </div>
  )
}

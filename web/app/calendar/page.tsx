"use client"

import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Cog, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { usePostDrawer, VideoDrawer } from "@/components/posts"
import { AccountDot, Card, EmptyState, ErrorState, Segmented, SkeletonRows, StatusPill } from "@/components/ui/kit"
import { accountColor, dayKey, dayTimes, type Account, type Plan, type Post, type RenderBlock } from "@/lib/api"
import { useApi, useData, useIsMobile } from "@/lib/data"

type View = "week" | "month" | "list"
type Slot = { date: string; time: string; account: Account; post?: Post; past: boolean }
const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
const ROW = 48

function monday(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`

/** Render blocks of the plan that start on this day (the plan is in the server's time zone, shown in the browser's). */
function rendersFor(day: Date, plan: Plan | null, accounts: Account[]): (RenderBlock & { time: string; account: Account })[] {
  if (!plan) return []
  const key = dayKey(day)
  const out = []
  for (const r of plan.renders) {
    const start = new Date(r.start)
    const account = accounts.find((a) => a.id === r.account_id)
    if (account && dayKey(start) === key) out.push({ ...r, time: hhmm(start), account })
  }
  return out
}

/** Slots per account: the server plan (fixed times or "every X hours"). Past days only show what really ran (posts with that slot). */
function slotsFor(day: Date, accounts: Account[], posts: Post[], now: Date, plan: Plan | null): Slot[] {
  const date = dayKey(day)
  const today = dayKey(now)
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  const out: Slot[] = []
  for (const a of accounts) {
    const seen = new Set<string>()
    for (const p of posts) {
      if (p.account_id !== a.id || !p.slot?.startsWith(date) || seen.has(p.slot)) continue
      seen.add(p.slot)
      out.push({ date, time: p.slot.slice(11), account: a, post: p, past: date < today || (date === today && p.slot.slice(11) <= hm) })
    }
    if (date >= today && a.active) {
      const planned = plan ? plan.slots.filter((s) => s.account_id === a.id && s.slot.startsWith(date)).map((s) => s.slot.slice(11)) : dayTimes(a, day)
      for (const t of planned) if (!seen.has(`${date} ${t}`)) out.push({ date, time: t, account: a, past: date === today && t <= hm })
    }
  }
  return out.sort((x, y) => x.time.localeCompare(y.time) || x.account.name.localeCompare(y.account.name))
}

function RenderChip({ r }: { r: RenderBlock & { time: string; account: Account } }) {
  const end = hhmm(new Date(r.end))
  const label = r.state === "running" ? "rendert gerade" : r.state === "late" ? "knapp, wird direkt nach dem Rendern gepostet" : "Rendern geplant"
  return (
    <span className={`flex h-5 w-full items-center gap-1.5 rounded-[6px] border border-dashed pl-2 pr-1.5 text-[11px] ${r.state === "late" ? "border-warning" : "border-line-strong"} ${r.state === "running" ? "bg-primary-50" : ""}`}
      title={`${r.time}–${end} ${r.account.name}: ${label} (Post ${r.slot.slice(11)})`}>
      <Cog size={12} className={`flex-none ${r.state === "running" ? "animate-spin text-primary-600" : "text-ink-3"}`} aria-hidden="true" />
      <span className="tabular text-ink-2">{r.time}</span>
      <span className="min-w-0 flex-1 truncate text-ink-3">Render · {r.account.name}</span>
    </span>
  )
}

/** Current time as a line between the entries of today's hour cell, placed by time like everything else. */
function NowLine({ time }: { time: string }) {
  return (
    <div className="flex items-center gap-1" role="separator" aria-label={`Jetzt ${time}`}>
      <span className="rounded-[4px] bg-danger px-1 text-[10px] font-semibold leading-4 text-white tabular">{time}</span>
      <span className="h-0.5 flex-1 rounded-full bg-danger" />
    </div>
  )
}

type Entry = { kind: "slot"; time: string; s: Slot } | { kind: "render"; time: string; r: RenderBlock & { time: string; account: Account } } | { kind: "now"; time: string }

/** Day list: posting slots and render blocks by time, with a "now" marker on today. */
function listEntries(slots: Slot[], renders: (RenderBlock & { time: string; account: Account })[], now: string | null): Entry[] {
  const out: Entry[] = [...slots.map((s) => ({ kind: "slot" as const, time: s.time, s })), ...renders.map((r) => ({ kind: "render" as const, time: r.time, r }))]
  if (now) out.push({ kind: "now", time: now })
  // At the same minute: what already happened first, then "now"
  const rank = { slot: 0, render: 1, now: 2 }
  return out.sort((x, y) => x.time.localeCompare(y.time) || rank[x.kind] - rank[y.kind])
}

function SlotIcon({ s }: { s: Slot }) {
  if (s.post?.status === "published") return <Check size={12} className="flex-none text-success" aria-label="gepostet" />
  if (s.post?.status === "failed") return <TriangleAlert size={12} className="flex-none text-danger" aria-label="Fehler" />
  if (s.post) return <Clock size={12} className="flex-none text-primary-600" aria-label="in Arbeit" />
  return null
}

function SlotChip({ s, onOpen }: { s: Slot; onOpen: (p: Post) => void }) {
  const cls = "flex h-6 w-full items-center gap-1.5 rounded-[6px] bg-surface-2 pl-2 pr-1.5 text-left text-xs hover:bg-hover"
  const style = { boxShadow: `inset 3px 0 0 ${accountColor(s.account.id)}` }
  const inner = (
    <>
      <span className="font-semibold text-ink tabular">{s.time}</span>
      <span className={`min-w-0 flex-1 truncate ${s.past && !s.post ? "text-ink-3 line-through" : "text-ink-2"}`}>{s.account.name}</span>
      <SlotIcon s={s} />
    </>
  )
  return s.post
    ? <button type="button" className={cls} style={style} onClick={() => onOpen(s.post!)} title={`${s.time} ${s.account.name}: ${s.post.title}`}>{inner}</button>
    : <Link href={`/account?id=${s.account.id}&tab=schedule`} className={cls} style={style} title={`${s.time} ${s.account.name}: ${s.past ? "kein Video gepostet" : "geplant, noch kein Video"}`}>{inner}</Link>
}

export default function CalendarPage() {
  const { accounts, account, allPosts, loading, overview, error, reload } = useData()
  const mobile = useIsMobile()
  const drawer = usePostDrawer()
  const [view, setView] = useState<View>("week")
  const [anchor, setAnchor] = useState(() => new Date())
  const [now, setNow] = useState(() => new Date())
  const scroller = useRef<HTMLDivElement>(null)
  const nowRow = useRef<HTMLDivElement>(null)
  const scope = useMemo(() => (account ? [account] : accounts), [account, accounts])
  const effective: View = mobile && view === "week" ? "list" : view

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    // Start with the current time in view (two hours above it), like other calendars
    if (effective !== "week" || !scroller.current) return
    const row = nowRow.current
    scroller.current.scrollTop = row ? Math.max(0, row.offsetTop - 2 * ROW) : 7 * ROW
  }, [effective, overview]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = effective === "month" ? monday(new Date(anchor.getFullYear(), anchor.getMonth(), 1)) : monday(anchor)
  const count = effective === "month" ? 42 : 7
  const days = useMemo(() => Array.from({ length: count }, (_, i) => addDays(start, i)), [start.getTime(), count]) // eslint-disable-line react-hooks/exhaustive-deps
  const planPath = `/plan?start=${dayKey(days[0])}&days=${count}${account ? `&account_id=${account.id}` : ""}`
  const { data: plan } = useApi<Plan>(planPath, 60_000)
  const byDay = useMemo(() => days.map((d) => slotsFor(d, scope, allPosts, now, plan)), [days, scope, allPosts, now, plan])
  const rendersByDay = useMemo(() => days.map((d) => rendersFor(d, plan, scope)), [days, plan, scope])
  const step = (dir: number) => setAnchor((a) => (effective === "month" ? new Date(a.getFullYear(), a.getMonth() + dir, 1) : addDays(a, dir * 7)))
  const title = effective === "month"
    ? anchor.toLocaleDateString("de-DE", { month: "long", year: "numeric" })
    : `${days[0].toLocaleDateString("de-DE", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" })}`
  const today = dayKey(now)

  if (error && !overview) return <Card><ErrorState message={error} onRetry={reload} /></Card>

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto flex items-center gap-1 sm:mr-0">
          <button type="button" className="icon-btn border border-line-strong" aria-label="Zurück" onClick={() => step(-1)}><ChevronLeft size={18} /></button>
          <button type="button" className="btn" onClick={() => setAnchor(new Date())}>Heute</button>
          <button type="button" className="icon-btn border border-line-strong" aria-label="Weiter" onClick={() => step(1)}><ChevronRight size={18} /></button>
        </div>
        <h2 className="card-title order-last w-full sm:order-none sm:w-auto sm:flex-1">{title}</h2>
        <Segmented<View> label="Ansicht" value={effective} onChange={setView} options={[...(mobile ? [] : [{ value: "week" as View, label: "Woche" }]), { value: "month", label: "Monat" }, { value: "list", label: "Liste" }]} />
      </div>

      {scope.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {scope.map((a) => <span key={a.id} className={`caption flex items-center gap-1.5 ${a.active ? "" : "line-through"}`}><AccountDot id={a.id} /> {a.name}</span>)}
        </div>
      )}

      {loading && !overview ? <Card><SkeletonRows rows={8} /></Card> : scope.length === 0 ? (
        <Card><EmptyState icon={CalendarDays} title="Keine Accounts" text="Lege einen Account mit Posting-Zeiten an, dann erscheinen hier die Slots."><Link href="/account" className="btn btn-primary">+ Account anlegen</Link></EmptyState></Card>
      ) : effective === "week" ? (
        <Card pad={false} className="overflow-hidden">
          <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] border-b border-line">
            <span />
            {days.map((d, i) => (
              <div key={i} className={`border-l border-line px-2 py-2.5 text-center ${dayKey(d) === today ? "bg-primary-50" : ""}`}>
                <span className="overline">{DAYS[i]}</span>
                <span className={`block text-base font-semibold tabular ${dayKey(d) === today ? "text-primary-700" : "text-ink"}`}>{d.getDate()}</span>
              </div>
            ))}
          </div>
          <div ref={scroller} className="relative max-h-[640px] overflow-y-auto">
            {/* One grid row per hour across all days, so the rows stay aligned however many entries a day has */}
            <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))]">
              {Array.from({ length: 24 }, (_, h) => {
                const nowHour = h === now.getHours() && days.some((x) => dayKey(x) === today)
                return [
                  <div key={`g${h}`} ref={nowHour ? nowRow : undefined} className={`caption border-t border-line pr-2 pt-1 text-right tabular ${nowHour ? "!font-semibold !text-danger" : ""}`} style={{ minHeight: ROW }}>
                    {String(h).padStart(2, "0")}:00
                  </div>,
                  ...days.map((d, i) => {
                    const isToday = dayKey(d) === today
                    const entries = listEntries(
                      byDay[i].filter((s) => +s.time.slice(0, 2) === h),
                      rendersByDay[i].filter((r) => +r.time.slice(0, 2) === h),
                      isToday && nowHour ? hhmm(now) : null,
                    )
                    return (
                      <div key={`${h}-${i}`} className={`flex flex-col gap-1 border-l border-t border-line p-1 ${isToday ? "bg-primary-50/40" : ""}`} style={{ minHeight: ROW }}>
                        {entries.map((e) => e.kind === "now" ? <NowLine key="now" time={e.time} />
                          : e.kind === "render" ? <RenderChip key={`r-${e.r.account_id}-${e.r.slot}`} r={e.r} />
                          : <SlotChip key={`${e.s.account.id}-${e.s.time}`} s={e.s} onOpen={drawer.open} />)}
                      </div>
                    )
                  }),
                ]
              })}
            </div>
          </div>
          <p className="caption flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2.5">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-danger" /> Jetzt {hhmm(now)}</span>
            <span className="flex items-center gap-1.5"><Cog size={12} /> Render-Block{plan?.render_minutes ? ` (${plan.render_minutes} min, nie gleichzeitig)` : ""}</span>
            <span>Durchgestrichen = Slot ohne Post. Zeiten ändern: Slot anklicken.</span>
          </p>
        </Card>
      ) : effective === "month" ? (
        <Card pad={false} className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line">{DAYS.map((d) => <span key={d} className="overline py-2 text-center">{d}</span>)}</div>
          <div className="grid grid-cols-7">
            {days.map((d, i) => {
              const inMonth = d.getMonth() === anchor.getMonth()
              const slots = byDay[i]
              return (
                <button key={i} type="button" onClick={() => { setAnchor(d); setView("list") }} className={`flex min-h-16 flex-col gap-1.5 border-b border-l border-line p-1.5 text-left hover:bg-hover md:min-h-24 md:p-2 ${i % 7 === 0 ? "!border-l-0" : ""} ${inMonth ? "" : "bg-surface-2"}`} aria-label={`${d.toLocaleDateString("de-DE", { day: "numeric", month: "long" })}, ${slots.length} Slots`}>
                  <span className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular ${dayKey(d) === today ? "bg-primary-600 text-on-primary" : inMonth ? "text-ink" : "text-ink-3"}`}>{d.getDate()}</span>
                  <span className="flex flex-wrap items-center gap-1">
                    {slots.slice(0, 5).map((s, j) => <span key={j} className="size-2 rounded-full" style={{ background: s.post?.status === "failed" ? "var(--danger)" : accountColor(s.account.id), opacity: s.past && !s.post ? 0.3 : 1 }} />)}
                    {slots.length > 5 && <span className="caption !text-[10px]">+{slots.length - 5}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map((d, i) => (
            <Card key={i} pad={false}>
              <h3 className={`card-title border-b border-line px-4 py-3 ${dayKey(d) === today ? "text-primary-700" : ""}`}>
                {d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}{dayKey(d) === today ? " · heute" : ""}
              </h3>
              {byDay[i].length === 0 && rendersByDay[i].length === 0 ? <p className="caption px-4 py-4">Keine Slots</p> : (
                <ul className="divide-y divide-line">
                  {listEntries(byDay[i], rendersByDay[i], dayKey(d) === today ? hhmm(now) : null).map((e) => e.kind === "now" ? (
                    <li key="now" className="flex items-center gap-2 px-4 py-1" aria-label={`Jetzt ${e.time}`}>
                      <span className="rounded-[4px] bg-danger px-1 text-[10px] font-semibold leading-4 text-white tabular">{e.time}</span>
                      <span className="h-0.5 flex-1 bg-danger" />
                    </li>
                  ) : e.kind === "render" ? (
                    <li key={`r-${e.r.account_id}-${e.r.slot}`} className="flex items-center gap-3 px-4 py-2">
                      <span className="w-12 flex-none text-ink-2 tabular">{e.r.time}</span>
                      <span className="caption flex min-w-0 flex-1 items-center gap-2"><Cog size={14} className={e.r.state === "running" ? "animate-spin text-primary-600" : ""} /> Rendern für {e.r.account.name} (Post {e.r.slot.slice(11)})</span>
                      {e.r.state !== "planned" && <span className={`caption ${e.r.state === "late" ? "!text-warning" : ""}`}>{e.r.state === "running" ? "läuft" : "knapp"}</span>}
                    </li>
                  ) : ((s) => (
                    <li key={`${s.account.id}-${s.time}`}>
                      <button type="button" disabled={!s.post} onClick={() => s.post && drawer.open(s.post)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left enabled:hover:bg-hover disabled:cursor-default">
                        <span className="w-12 flex-none font-semibold text-ink tabular">{s.time}</span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-center gap-2 font-medium text-ink"><AccountDot id={s.account.id} /> {s.account.name}</span>
                          {s.post && <span className="caption truncate">{s.post.title}</span>}
                        </span>
                        {s.post ? <StatusPill post={s.post} /> : <span className="caption">{s.past ? "kein Post" : "noch kein Video"}</span>}
                      </button>
                    </li>
                  ))(e.s))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
      <VideoDrawer post={drawer.post} onClose={drawer.close} />
    </div>
  )
}

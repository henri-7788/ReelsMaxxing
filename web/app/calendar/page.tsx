"use client"

import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { usePostDrawer, VideoDrawer } from "@/components/posts"
import { AccountDot, Card, EmptyState, ErrorState, Segmented, SkeletonRows, StatusPill } from "@/components/ui/kit"
import { accountColor, dayKey, parseTimes, type Account, type Post } from "@/lib/api"
import { useData, useIsMobile } from "@/lib/data"

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

/** Slots are daily times per account. Past days only show what really ran (posts with that slot). */
function slotsFor(day: Date, accounts: Account[], posts: Post[], now: Date): Slot[] {
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
    if (date >= today && a.active)
      for (const t of parseTimes(a.posting_times)) if (!seen.has(`${date} ${t}`)) out.push({ date, time: t, account: a, past: date === today && t <= hm })
  }
  return out.sort((x, y) => x.time.localeCompare(y.time) || x.account.name.localeCompare(y.account.name))
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
  const scope = useMemo(() => (account ? [account] : accounts), [account, accounts])
  const effective: View = mobile && view === "week" ? "list" : view

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (effective === "week" && scroller.current) scroller.current.scrollTop = 7 * ROW
  }, [effective, overview])

  const start = effective === "month" ? monday(new Date(anchor.getFullYear(), anchor.getMonth(), 1)) : monday(anchor)
  const count = effective === "month" ? 42 : 7
  const days = useMemo(() => Array.from({ length: count }, (_, i) => addDays(start, i)), [start.getTime(), count]) // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = useMemo(() => days.map((d) => slotsFor(d, scope, allPosts, now)), [days, scope, allPosts, now])
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
            <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))]">
              <div>
                {Array.from({ length: 24 }, (_, h) => <div key={h} className="caption pr-2 pt-1 text-right tabular" style={{ minHeight: ROW }}>{String(h).padStart(2, "0")}:00</div>)}
              </div>
              {days.map((d, i) => (
                <div key={i} className="relative border-l border-line">
                  {Array.from({ length: 24 }, (_, h) => {
                    const here = byDay[i].filter((s) => +s.time.slice(0, 2) === h)
                    return (
                      <div key={h} className="flex flex-col gap-1 border-t border-line p-1" style={{ minHeight: ROW }}>
                        {here.map((s) => <SlotChip key={`${s.account.id}-${s.time}`} s={s} onOpen={drawer.open} />)}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          <p className="caption border-t border-line px-4 py-2.5">Aktuelle Uhrzeit: {now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} · Durchgestrichen = Slot ohne Post. Zeiten ändern: Slot anklicken.</p>
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
              {byDay[i].length === 0 ? <p className="caption px-4 py-4">Keine Slots</p> : (
                <ul className="divide-y divide-line">
                  {byDay[i].map((s) => (
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
                  ))}
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

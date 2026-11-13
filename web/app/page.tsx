"use client"

import { CalendarClock, ChevronRight, Loader, Send, TriangleAlert, Users } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"
import { MiniPcCard, PerformanceCard, PostingTimesCard, statsPath } from "@/components/cards"
import { KpiCard, type Kpi } from "@/components/charts/KpiCard"
import { pipelineCounts, PostTable, usePostDrawer, VideoDrawer } from "@/components/posts"
import { AccountDot, Banner, Card, CardHeader, EmptyState, SkeletonRows, StatusPill } from "@/components/ui/kit"
import { dayKey, parseTimes, trend, type Account, type Post, type Stats } from "@/lib/api"
import { useApi, useData } from "@/lib/data"

type Slot = { key: string; time: string; day: "heute" | "morgen"; account: Account; post?: Post }

function upcomingSlots(accounts: Account[], posts: Post[], limit: number): { next: Slot[]; today: Slot[] } {
  const now = new Date()
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  const days: [string, "heute" | "morgen"][] = [[dayKey(now), "heute"], [dayKey(new Date(now.getTime() + 86_400_000)), "morgen"]]
  const all: Slot[] = []
  for (const [date, day] of days)
    for (const a of accounts.filter((x) => x.active))
      for (const t of parseTimes(a.posting_times)) {
        const key = `${date} ${t}`
        all.push({ key, time: t, day, account: a, post: posts.find((p) => p.account_id === a.id && p.slot === key) })
      }
  all.sort((x, y) => x.key.localeCompare(y.key))
  const today = all.filter((s) => s.day === "heute")
  return { next: all.filter((s) => s.day === "morgen" || s.time > hm).slice(0, limit), today }
}

export default function Dashboard() {
  const { accounts, account, accountId, posts, allPosts, system, loading, overview, error } = useData()
  const stats = useApi<Stats>(statsPath(accountId, 30), 60_000)
  const drawer = usePostDrawer()
  const scope = useMemo(() => (account ? [account] : accounts), [account, accounts])
  const slots = useMemo(() => upcomingSlots(scope, allPosts, 6), [scope, allPosts])
  const counts = useMemo(() => pipelineCounts(posts), [posts])

  const s = stats.data
  const total = s ? s.week.published + s.week.failed : 0
  const prevTotal = s ? s.previous_week.published + s.previous_week.failed : 0
  const rate = total ? (s!.week.failed / total) * 100 : 0
  const prevRate = prevTotal ? (s!.previous_week.failed / prevTotal) * 100 : 0
  const open = slots.today.filter((x) => x.post?.status !== "published").length
  const inWork = counts.filter((c) => ["rendering", "ready", "scheduled", "publishing"].includes(c.key)).reduce((a, c) => a + c.n, 0)
  const kpis: Kpi[] = [
    { label: "Gepostet (7 Tage)", value: s?.week.published ?? "–", icon: Send, delta: s ? trend(s.week.published, s.previous_week.published) : null },
    { label: "Geplant heute", value: `${open} / ${slots.today.length}`, icon: CalendarClock, note: slots.next[0] ? `nächster ${slots.next[0].day} um ${slots.next[0].time}` : "keine Slots" },
    { label: "In Arbeit", value: inWork, icon: Loader, note: "rendert, bereit oder wird gepostet" },
    { label: "Fehlerquote", value: `${rate.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`, icon: TriangleAlert, delta: s && prevTotal ? trend(rate, prevRate) : null, lowerIsBetter: true, note: total ? "noch kein Vergleich" : "keine Posts in 7 Tagen" },
  ]

  if (overview && accounts.length === 0) {
    return (
      <Card>
        <EmptyState icon={Users} title="Noch keine Accounts" text="Lege den ersten Instagram-Account an und wähle Subreddits zum Thema.">
          <Link href="/account" className="btn btn-primary">+ Account anlegen</Link>
        </EmptyState>
      </Card>
    )
  }

  const noToken = scope.filter((a) => a.active && (!a.ig_user_id || !a.has_token))
  const noSources = scope.filter((a) => a.active && (a.sources?.length ?? 0) === 0)

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      {(noToken.length > 0 || noSources.length > 0) && (
        <div className="col-span-12 flex flex-col gap-2">
          {noToken.length > 0 && (
            <Banner tone="warning">
              {noToken.length === 1 ? `„${noToken[0].name}“ hat` : `${noToken.length} Accounts haben`} keinen Instagram-Zugang. Reels werden nur vorbereitet, nicht gepostet.{" "}
              <Link className="link font-medium" href={`/account?id=${noToken[0].id}&tab=content`}>Einrichten</Link>
            </Banner>
          )}
          {noSources.length > 0 && (
            <Banner tone="warning">
              {noSources.length === 1 ? `„${noSources[0].name}“ hat` : `${noSources.length} Accounts haben`} keine Subreddits und findet deshalb keine Videos.{" "}
              <Link className="link font-medium" href={`/account?id=${noSources[0].id}&tab=content`}>Subreddit hinzufügen</Link>
            </Banner>
          )}
        </div>
      )}

      <div className="col-span-12 xl:col-span-5 [&>section]:h-full"><KpiCard items={kpis} loading={(loading && !overview) || (stats.loading && !s)} /></div>
      <PostingTimesCard accountId={accountId} account={account} className="col-span-12 xl:col-span-7" />

      <PerformanceCard accountId={accountId} className="col-span-12 xl:col-span-8" />
      <MiniPcCard system={system} error={error} className="col-span-12 xl:col-span-4" />

      <Card className="col-span-12 lg:col-span-6">
        <CardHeader title="Nächste Slots">
          <Link href="/calendar" className="btn btn-sm">Kalender <ChevronRight size={14} /></Link>
        </CardHeader>
        {loading && !overview ? <SkeletonRows rows={4} /> : slots.next.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Keine Slots geplant" text="Kein aktiver Account hat Posting-Zeiten." />
        ) : (
          <ul className="-my-1 flex flex-col divide-y divide-line">
            {slots.next.map((sl) => (
              <li key={`${sl.account.id}-${sl.key}`} className="flex items-center gap-3 py-2.5">
                <span className="w-24 flex-none text-ink tabular"><span className="font-semibold">{sl.time}</span> <span className="caption">{sl.day}</span></span>
                <span className="flex min-w-0 flex-1 items-center gap-2"><AccountDot id={sl.account.id} /><span className="truncate font-medium text-ink">{sl.account.name}</span></span>
                {sl.post ? <StatusPill post={sl.post} /> : <span className="caption">noch kein Video</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="col-span-12 lg:col-span-6">
        <CardHeader title="Pipeline">
          <Link href="/queue" className="btn btn-sm">Warteschlange <ChevronRight size={14} /></Link>
        </CardHeader>
        <div className="grid flex-1 grid-cols-3 gap-2">
          {counts.map((c) => (
            <Link key={c.key} href="/queue" className="flex flex-col justify-center rounded-[10px] border border-line px-3 py-3 hover:border-line-strong">
              <span className={`kpi !text-2xl ${c.key === "failed" && c.n ? "!text-danger" : ""}`}>{c.n}</span>
              <span className="caption">{c.title}</span>
            </Link>
          ))}
        </div>
      </Card>

      <Card className="col-span-12" pad={false}>
        <div className="card-pad !pb-0">
          <CardHeader title="Letzte Videos">
            <Link href="/queue?view=history" className="btn btn-sm">Alle anzeigen <ChevronRight size={14} /></Link>
          </CardHeader>
        </div>
        {loading && !overview ? <div className="card-pad !pt-0"><SkeletonRows /></div> : (
          <PostTable posts={posts.slice(0, 8)} onOpen={drawer.open} showAccount={!account} empty="Für die nächsten Slots wird automatisch ein Video gesucht." />
        )}
      </Card>
      <VideoDrawer post={drawer.post} onClose={drawer.close} />
    </div>
  )
}

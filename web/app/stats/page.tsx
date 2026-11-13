"use client"

import { Eye, Rss, Users } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useMemo } from "react"
import { PerformanceCard, PostingTimesCard, statsPath } from "@/components/cards"
import { AccountDot, Card, CardHeader, EmptyState, ErrorState, Segmented, SkeletonRows } from "@/components/ui/kit"
import { parseTimes, relTime, type Stats } from "@/lib/api"
import { useApi, useData } from "@/lib/data"

type Tab = "performance" | "times" | "sources" | "accounts"
const DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]

function Bar({ value, max, tone = "primary" }: { value: number; max: number; tone?: "primary" | "danger" }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-surface-2 sm:block" aria-hidden="true">
        <span className="block h-full rounded-full" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: tone === "danger" ? "var(--danger)" : "var(--primary-600)" }} />
      </span>
      <span className="w-8 tabular">{value}</span>
    </span>
  )
}

export default function StatsPage() {
  const params = useSearchParams()
  const router = useRouter()
  const { accounts, account, accountId, allPosts } = useData()
  const tab = (["performance", "times", "sources", "accounts"].includes(params.get("tab") ?? "") ? params.get("tab") : "performance") as Tab
  const stats = useApi<Stats>(statsPath(accountId, 30), 60_000)
  const s = stats.data
  const name = (id: number) => accounts.find((a) => a.id === id)?.name ?? `#${id}`

  const best = useMemo(() => {
    if (!s) return []
    const cells = s.heatmap.flatMap((row, d) => row.map((v, h) => ({ d, h, v }))).filter((c) => c.v > 0)
    return cells.sort((a, b) => b.v - a.v).slice(0, 5)
  }, [s])

  const perAccount = useMemo(() => {
    const week = Date.now() - 7 * 86_400_000
    return accounts.map((a) => {
      const mine = allPosts.filter((p) => p.account_id === a.id)
      const recent = mine.filter((p) => new Date(p.updated_at).getTime() >= week)
      const pub = mine.filter((p) => p.status === "published").length
      const fail = mine.filter((p) => p.status === "failed").length
      return { a, pub7: recent.filter((p) => p.status === "published").length, pub, fail, rate: pub + fail ? (fail / (pub + fail)) * 100 : 0, perDay: parseTimes(a.posting_times).length }
    })
  }, [accounts, allPosts])

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="max-w-full overflow-x-auto">
        <Segmented<Tab> label="Bereich" value={tab} onChange={(t) => router.replace(`/stats?tab=${t}`, { scroll: false })} options={[{ value: "performance", label: "Performance" }, { value: "times", label: "Posting-Zeiten" }, { value: "sources", label: "Quellen" }, { value: "accounts", label: "Accounts im Vergleich" }]} />
      </div>

      {tab === "performance" && (
        <>
          <PerformanceCard accountId={accountId} footerLink={false} height={340} />
          <Card>
            <EmptyState icon={Eye} title="Views kommen noch" text="Statistiken von Instagram (Views, Likes, Kommentare) werden noch nicht abgerufen. Bis dahin zählen wir gepostete Reels und Fehler." />
          </Card>
        </>
      )}

      {tab === "times" && (
        <div className="grid grid-cols-12 gap-4 md:gap-6">
          <PostingTimesCard accountId={accountId} account={account} className="col-span-12 xl:col-span-8" />
          <Card className="col-span-12 xl:col-span-4">
            <CardHeader title="Häufigste Zeiten" sub={account ? account.name : "Alle Accounts"} />
            {stats.loading && !s ? <SkeletonRows rows={4} /> : best.length === 0 ? (
              <p className="text-ink-3">Noch zu wenig Daten. Nach etwa einer Woche Posten erscheinen hier Muster.</p>
            ) : (
              <ol className="flex flex-col divide-y divide-line">
                {best.map((b, i) => (
                  <li key={i} className="flex items-center gap-3 py-2.5">
                    <span className="caption w-4 tabular">{i + 1}.</span>
                    <span className="flex-1 font-medium text-ink">{DAYS[b.d]}, {String(b.h).padStart(2, "0")}:00</span>
                    <span className="font-semibold text-ink tabular">{b.v} Reels</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="caption mt-4">Die Auswertung zählt, wann gepostet wurde. Welche Uhrzeit die meisten Views bringt, lässt sich erst mit Instagram-Statistiken sagen.</p>
          </Card>
        </div>
      )}

      {tab === "sources" && (
        <Card pad={false}>
          {stats.error && !s ? <ErrorState message={stats.error} onRetry={stats.reload} /> : stats.loading && !s ? <div className="p-4"><SkeletonRows /></div> : !s || s.sources.length === 0 ? (
            <EmptyState icon={Rss} title="Noch keine Videos" text="Sobald Videos aus den Subreddits geholt wurden, steht hier, welche Quelle wie viel liefert." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>Subreddit</th><th>Account</th><th className="num">Videos</th><th className="num">Gepostet</th><th className="num">Fehler</th><th className="num">Zuletzt</th></tr></thead>
                <tbody>
                  {s.sources.map((r) => {
                    const max = Math.max(...s.sources.map((x) => x.total))
                    return (
                      <tr key={`${r.account_id}-${r.subreddit}`}>
                        <td className="font-medium text-ink">r/{r.subreddit}</td>
                        <td><Link href={`/account?id=${r.account_id}&tab=content`} className="flex items-center gap-2 whitespace-nowrap hover:text-primary-700"><AccountDot id={r.account_id} /> {name(r.account_id)}</Link></td>
                        <td className="num"><Bar value={r.total} max={max} /></td>
                        <td className="num">{r.published}</td>
                        <td className="num"><Bar value={r.failed} max={max} tone="danger" /></td>
                        <td className="num whitespace-nowrap text-ink-3">{relTime(r.last)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "accounts" && (
        <Card pad={false}>
          {accounts.length === 0 ? <EmptyState icon={Users} title="Keine Accounts" /> : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>Account</th><th className="num">Slots pro Tag</th><th className="num">Gepostet (7 Tage)</th><th className="num">Gepostet gesamt</th><th className="num">Fehler</th><th className="num">Fehlerquote</th></tr></thead>
                <tbody>
                  {perAccount.map((r) => (
                    <tr key={r.a.id}>
                      <td><Link href={`/account?id=${r.a.id}`} className="flex items-center gap-2 whitespace-nowrap font-medium text-ink hover:text-primary-700"><AccountDot id={r.a.id} /> {r.a.name}{!r.a.active && <span className="caption">pausiert</span>}</Link></td>
                      <td className="num">{r.perDay}</td>
                      <td className="num"><Bar value={r.pub7} max={Math.max(1, ...perAccount.map((x) => x.pub7))} /></td>
                      <td className="num">{r.pub}</td>
                      <td className="num">{r.fail}</td>
                      <td className={`num ${r.rate > 25 ? "font-semibold text-danger" : ""}`}>{r.rate.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="caption border-t border-line px-4 py-3">Basis: die letzten 300 Videos. Follower und Views folgen mit den Instagram-Statistiken.</p>
        </Card>
      )}
    </div>
  )
}

"use client"

import { Rss, Search, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { statsPath } from "@/components/cards"
import { sourceSummary } from "@/components/Sources"
import { AccountDot, Card, EmptyState, ErrorState, SkeletonRows } from "@/components/ui/kit"
import { relTime, type Stats } from "@/lib/api"
import { useApi, useData } from "@/lib/data"

export default function SourcesPage() {
  const { accounts, account, accountId, loading, overview, error, reload } = useData()
  const stats = useApi<Stats>(statsPath(accountId, 30), 60_000)
  const [q, setQ] = useState("")
  const rows = useMemo(() => {
    const scope = account ? [account] : accounts
    return scope.flatMap((a) => (a.sources ?? []).map((s) => ({ a, s, st: stats.data?.sources.find((x) => x.account_id === a.id && x.subreddit.toLowerCase() === s.subreddit.toLowerCase()) })))
      .filter((r) => r.s.subreddit.toLowerCase().includes(q.trim().toLowerCase().replace(/^r\//, "")))
  }, [accounts, account, stats.data, q])
  const without = (account ? [account] : accounts).filter((a) => (a.sources?.length ?? 0) === 0)

  if (error && !overview) return <Card><ErrorState message={error} onRetry={reload} /></Card>
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="field !pl-9" placeholder="Subreddit suchen" aria-label="Subreddit suchen" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="caption">{rows.length} Quellen · {account ? account.name : "alle Accounts"}</span>
      </div>
      {without.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-[10px] border border-warning bg-warning-bg px-4 py-3 text-ink">
          <TriangleAlert size={16} className="text-warning" /> Ohne Subreddits:
          {without.map((a) => <Link key={a.id} href={`/account?id=${a.id}&tab=content`} className="link font-medium">{a.name}</Link>)}
        </p>
      )}
      <Card pad={false}>
        {loading && !overview ? <div className="p-4"><SkeletonRows /></div> : rows.length === 0 ? (
          <EmptyState icon={Rss} title={q ? `Nichts gefunden zu „${q}“` : "Keine Quellen"} text={q ? undefined : "Subreddits legst du pro Account fest."}>
            {q ? <button type="button" className="btn btn-sm" onClick={() => setQ("")}>Suche löschen</button> : <Link href="/accounts" className="btn btn-primary">Zu den Accounts</Link>}
          </EmptyState>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="data-table">
                <thead><tr><th>Subreddit</th><th>Account</th><th>Filter</th><th className="num">Videos</th><th className="num">Gepostet</th><th className="num">Zuletzt</th><th><span className="sr-only">Aktionen</span></th></tr></thead>
                <tbody>
                  {rows.map(({ a, s, st }) => (
                    <tr key={s.id}>
                      <td><a className="link font-medium" href={`https://reddit.com/r/${s.subreddit}`} target="_blank" rel="noopener noreferrer">r/{s.subreddit}</a></td>
                      <td><span className="flex items-center gap-2 whitespace-nowrap"><AccountDot id={a.id} /> {a.name}</span></td>
                      <td className="text-ink-3">{sourceSummary(s)}</td>
                      <td className="num">{st?.total ?? 0}</td>
                      <td className="num">{st?.published ?? 0}</td>
                      <td className="num whitespace-nowrap text-ink-3">{st ? relTime(st.last) : "noch nie"}</td>
                      <td className="text-right"><Link href={`/account?id=${a.id}&tab=content`} className="btn btn-sm">Bearbeiten</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {rows.map(({ a, s, st }) => (
                <li key={s.id}>
                  <Link href={`/account?id=${a.id}&tab=content`} className="flex flex-col gap-1 px-4 py-3">
                    <span className="flex items-center justify-between gap-2"><span className="font-semibold text-ink">r/{s.subreddit}</span><span className="caption flex items-center gap-1.5"><AccountDot id={a.id} /> {a.name}</span></span>
                    <span className="caption">{sourceSummary(s)}</span>
                    <span className="caption tabular">Videos: {st?.total ?? 0} · gepostet: {st?.published ?? 0} · zuletzt {st ? relTime(st.last) : "noch nie"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}

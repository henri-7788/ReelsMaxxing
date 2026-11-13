"use client"

import { ChevronRight, Plus, Search, Users } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { AccountAvatar, Card, EmptyState, ErrorState, Segmented, Skeleton, Switch, TonePill } from "@/components/ui/kit"
import { useToast } from "@/components/ui/Toast"
import { accountBody, accountIssue, api, formatSlot, parseTimes, type Account } from "@/lib/api"
import { useData } from "@/lib/data"

type Filter = "all" | "active" | "paused" | "issues"

export default function AccountsPage() {
  const { accounts, allPosts, loading, overview, error, reload } = useData()
  const toast = useToast()
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<Filter>("all")

  const list = useMemo(() => accounts.filter((a) => {
    if (!a.name.toLowerCase().includes(q.toLowerCase())) return false
    const issue = accountIssue(a, allPosts)
    if (filter === "active") return a.active
    if (filter === "paused") return !a.active
    if (filter === "issues") return issue.tone === "danger" || issue.tone === "warning"
    return true
  }), [accounts, allPosts, q, filter])

  async function toggle(a: Account, active: boolean) {
    try {
      await api(`/accounts/${a.id}`, { method: "PUT", body: accountBody(a, { active }) })
      toast(active ? `„${a.name}“ postet wieder automatisch` : `„${a.name}“ pausiert`)
      reload()
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  if (error && !overview) return <Card><ErrorState message={error} onRetry={reload} /></Card>

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="field !pl-9" placeholder="Account suchen" aria-label="Account suchen" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="max-w-full overflow-x-auto">
          <Segmented<Filter> label="Filter" value={filter} onChange={setFilter} options={[{ value: "all", label: `Alle (${accounts.length})` }, { value: "active", label: "Aktiv" }, { value: "paused", label: "Pausiert" }, { value: "issues", label: "Probleme" }]} />
        </div>
        <Link href="/account" className="btn btn-primary ml-auto w-full sm:w-auto"><Plus size={18} /> Neuer Account</Link>
      </div>

      {loading && !overview ? (
        <div className="grid gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 !rounded-[16px]" />)}</div>
      ) : accounts.length === 0 ? (
        <Card><EmptyState icon={Users} title="Noch keine Accounts" text="Lege den ersten Instagram-Account an und wähle Subreddits zum Thema."><Link href="/account" className="btn btn-primary">+ Account anlegen</Link></EmptyState></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
          {list.map((a) => {
            const issue = accountIssue(a, allPosts)
            const ready = allPosts.filter((p) => p.account_id === a.id && (p.status === "ready" || p.status === "preview")).length
            const subs = a.sources ?? []
            return (
              <article key={a.id} className="card flex flex-col transition-colors hover:border-line-strong">
                <Link href={`/account?id=${a.id}`} className="flex flex-1 flex-col gap-4 rounded-t-[16px] p-4 md:p-6" aria-label={`${a.name} öffnen`}>
                  <header className="flex items-center gap-3">
                    <AccountAvatar account={a} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="card-title block truncate">{a.name}</span>
                      <span className="caption block truncate">{a.ig_user_id ? `Instagram-ID ${a.ig_user_id}` : "keine Instagram-ID"}</span>
                    </span>
                    <TonePill tone={issue.tone}>{issue.label}</TonePill>
                  </header>
                  <dl className="grid grid-cols-[88px_1fr] gap-y-1.5">
                    <dt className="text-ink-3">Zeiten</dt><dd className="truncate text-ink tabular">{parseTimes(a.posting_times).join(", ") || "–"}</dd>
                    <dt className="text-ink-3">Nächster</dt><dd className="text-ink tabular">{a.active ? formatSlot(a.next_slot) : "–"}</dd>
                    <dt className="text-ink-3">Vorrat</dt><dd className="text-ink">{ready} {ready === 1 ? "Video" : "Videos"} bereit</dd>
                  </dl>
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    {subs.length === 0 && <span className="caption">keine Subreddits</span>}
                    {subs.slice(0, 3).map((s) => <span key={s.id} className="tag">r/{s.subreddit}</span>)}
                    {subs.length > 3 && <span className="tag">+{subs.length - 3}</span>}
                  </div>
                </Link>
                <footer className="flex items-center justify-between border-t border-line px-4 py-3 md:px-6">
                  <Switch checked={a.active} onChange={(v) => toggle(a, v)}>Aktiv</Switch>
                  <Link href={`/account?id=${a.id}`} className="btn btn-sm">Öffnen <ChevronRight size={14} /></Link>
                </footer>
              </article>
            )
          })}
          {list.length === 0 && <Card className="md:col-span-2 xl:col-span-3"><EmptyState icon={Search} title="Nichts gefunden" text="Kein Account passt zu Suche und Filter."><button type="button" className="btn btn-sm" onClick={() => { setQ(""); setFilter("all") }}>Filter zurücksetzen</button></EmptyState></Card>}
          <Link href="/account" className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed border-line-strong text-ink-2 hover:border-primary-600 hover:text-primary-700">
            <Plus size={22} /> <span className="font-medium">Account hinzufügen</span>
          </Link>
        </div>
      )}
    </div>
  )
}

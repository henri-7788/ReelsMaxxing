"use client"

import { ListVideo, Search } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { RingGauge } from "@/components/charts/RingGauge"
import { pipelineCounts, PipelineBoard, PostTable, usePostDrawer, VideoCard, VideoDrawer } from "@/components/posts"
import { Card, EmptyState, ErrorState, Segmented, SkeletonRows } from "@/components/ui/kit"
import { displayStatus, STATUS_LABEL } from "@/lib/api"
import { useData, useIsMobile } from "@/lib/data"

type View = "pipeline" | "history"
const PAGE = 25

export default function QueuePage() {
  const params = useSearchParams()
  const router = useRouter()
  const { posts, allPosts, account, loading, overview, error, reload } = useData()
  const mobile = useIsMobile()
  const drawer = usePostDrawer()
  const view: View = params.get("view") === "history" ? "history" : "pipeline"
  const [status, setStatus] = useState("all")
  const [q, setQ] = useState("")
  const [page, setPage] = useState(1)
  const [chip, setChip] = useState("rendering")

  const openId = Number(params.get("post")) || null
  const openPost = drawer.open
  useEffect(() => {
    const p = openId ? allPosts.find((x) => x.id === openId) : null
    if (p) openPost(p)
  }, [openId, allPosts, openPost])

  const counts = useMemo(() => pipelineCounts(posts), [posts])
  const n = (k: string) => counts.find((c) => c.key === k)?.n ?? 0
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return posts.filter((p) => (status === "all" || displayStatus(p) === status) && (!s || p.title.toLowerCase().includes(s) || p.subreddit.toLowerCase().includes(s) || p.reddit_id.toLowerCase().includes(s)))
  }, [posts, status, q])
  useEffect(() => setPage(1), [status, q, account])
  useEffect(() => {
    const first = counts.find((c) => c.n > 0)
    if (first && n(chip) === 0) setChip(first.key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts])

  if (error && !overview) return <Card><ErrorState message={error} onRetry={reload} /></Card>
  const busy = loading && !overview
  const ring = [
    { value: n("published"), color: "var(--primary-600)", label: "Gepostet" },
    { value: n("ready") + n("scheduled") + n("publishing"), color: "var(--sky-400)", label: "Bereit / geplant" },
    { value: n("rendering"), color: "var(--sky-200)", label: "Rendert" },
    { value: n("failed"), color: "var(--danger)", label: "Fehler" },
  ]

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<View> label="Ansicht" value={view} onChange={(v) => router.replace(v === "history" ? "/queue?view=history" : "/queue", { scroll: false })} options={[{ value: "pipeline", label: "Pipeline" }, { value: "history", label: "Verlauf" }]} />
        <span className="caption">{account ? `Account: ${account.name}` : "Alle Accounts"} · {posts.length} Videos</span>
      </div>

      {view === "pipeline" && (
        <>
          <Card>
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <RingGauge size={150} segments={ring} label={`${posts.length} Videos in der Pipeline`}>
                <span className="display !text-2xl">{posts.length}</span>
                <span className="caption">Videos</span>
              </RingGauge>
              <ul className="grid w-full flex-1 grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
                {ring.map((r) => (
                  <li key={r.label} className="flex items-center gap-2.5">
                    <span className="size-2.5 flex-none rounded-full" style={{ background: r.color }} aria-hidden="true" />
                    <span className="flex-1 font-medium text-ink">{r.label}</span>
                    <span className="font-semibold text-ink tabular">{r.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
          {busy ? <Card><SkeletonRows /></Card> : posts.length === 0 ? (
            <Card><EmptyState icon={ListVideo} title="Alles erledigt" text="Für die nächsten Slots wird automatisch ein Video gesucht. Mit „Video holen“ oben kannst du für einen gewählten Account sofort eines rendern." /></Card>
          ) : mobile ? (
            <>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Status">
                {counts.map((c) => (
                  <button key={c.key} type="button" role="tab" aria-selected={chip === c.key} onClick={() => setChip(c.key)} className={`tag !h-9 flex-none !px-3 text-[13px] ${chip === c.key ? "!border-primary-600 !bg-primary-50 !text-primary-700" : ""}`}>
                    {c.title} <b className="tabular">{c.n}</b>
                  </button>
                ))}
              </div>
              <ul className="flex flex-col gap-2">
                {posts.filter((p) => { const s = displayStatus(p); return chip === "ready" ? s === "ready" || s === "preview" : s === chip }).slice(0, 40).map((p) => <li key={p.id}><VideoCard p={p} onOpen={drawer.open} showAccount={!account} /></li>)}
                {n(chip) === 0 && <li className="caption rounded-[10px] border border-dashed border-line-strong px-3 py-8 text-center">Keine Videos in diesem Schritt</li>}
              </ul>
            </>
          ) : (
            <PipelineBoard posts={posts} onOpen={drawer.open} showAccount={!account} />
          )}
        </>
      )}

      {view === "history" && (
        <Card pad={false}>
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
            <div className="relative w-full sm:w-72">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input className="field !pl-9" placeholder="Titel, Subreddit oder Reddit-ID" aria-label="Verlauf durchsuchen" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="field !w-auto" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Alle Status</option>
              {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <span className="caption ml-auto tabular">{filtered.length} Treffer</span>
          </div>
          {busy ? <div className="p-4"><SkeletonRows /></div> : filtered.length === 0 && posts.length > 0 ? (
            <EmptyState icon={Search} title="Nichts gefunden" text="Kein Video passt zu Suche und Filter."><button type="button" className="btn btn-sm" onClick={() => { setQ(""); setStatus("all") }}>Filter zurücksetzen</button></EmptyState>
          ) : (
            <PostTable posts={filtered.slice((page - 1) * PAGE, page * PAGE)} onOpen={drawer.open} showAccount={!account} />
          )}
          {filtered.length > PAGE && (
            <div className="flex items-center justify-between border-t border-line p-4">
              <button type="button" className="btn btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Zurück</button>
              <span className="caption tabular">Seite {page} von {Math.ceil(filtered.length / PAGE)}</span>
              <button type="button" className="btn btn-sm" disabled={page * PAGE >= filtered.length} onClick={() => setPage((p) => p + 1)}>Weiter</button>
            </div>
          )}
        </Card>
      )}
      <VideoDrawer post={drawer.post} onClose={drawer.close} />
    </div>
  )
}

"use client"

import { ChevronDown, Copy, ScrollText, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { usePostDrawer, VideoDrawer } from "@/components/posts"
import { AccountDot, Card, EmptyState, ErrorState, Segmented, SkeletonRows } from "@/components/ui/kit"
import { useToast } from "@/components/ui/Toast"
import { fmtDateTime, type Post } from "@/lib/api"
import { useData } from "@/lib/data"

type Level = "all" | "info" | "warning" | "error"
type Entry = { post: Post; level: Exclude<Level, "all">; source: string; message: string }

/** Until the backend has its own event table, the log is derived from the posts (UIDesign.md 6.17). */
function toEntry(p: Post): Entry {
  if (p.status === "failed") {
    const e = (p.error ?? "").toLowerCase()
    const source = e.includes("instagram") || e.includes("media") || e.includes("graph") ? "Instagram" : e.includes("reddit") ? "Reddit" : e.includes("ffmpeg") || e.includes("render") ? "Render" : "Pipeline"
    return { post: p, level: "error", source, message: p.error ?? "Fehlgeschlagen" }
  }
  if (p.status === "published") return { post: p, level: "info", source: "Instagram", message: `Gepostet: ${p.title}` }
  if (p.status === "publishing") return { post: p, level: "info", source: "n8n", message: `Wird gepostet: ${p.title}` }
  if (p.status === "rendering") return { post: p, level: "info", source: "Render", message: `Rendert: ${p.title}` }
  if (p.status === "preview") return { post: p, level: "warning", source: "Render", message: `Vorschau fertig, nicht gepostet: ${p.title}` }
  return { post: p, level: "info", source: "Render", message: `Bereit: ${p.title}` }
}

const TONE = { info: "var(--primary-600)", warning: "var(--warning)", error: "var(--danger)" }
const LABEL = { info: "Info", warning: "Hinweis", error: "Fehler" }

export default function LogsPage() {
  const { posts, account, loading, overview, error, reload } = useData()
  const toast = useToast()
  const drawer = usePostDrawer()
  const [level, setLevel] = useState<Level>("all")
  const [q, setQ] = useState("")
  const [open, setOpen] = useState<number | null>(null)

  const entries = useMemo(() => [...posts].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(toEntry), [posts])
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return entries.filter((e) => (level === "all" || e.level === level) && (!s || e.message.toLowerCase().includes(s) || e.post.account_name.toLowerCase().includes(s) || e.source.toLowerCase().includes(s)))
  }, [entries, level, q])
  const errors = entries.filter((e) => e.level === "error").length

  if (error && !overview) return <Card><ErrorState message={error} onRetry={reload} /></Card>
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="max-w-full overflow-x-auto">
          <Segmented<Level> label="Level" value={level} onChange={setLevel} options={[{ value: "all", label: "Alle" }, { value: "info", label: "Info" }, { value: "warning", label: "Hinweise" }, { value: "error", label: `Fehler (${errors})` }]} />
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="field !pl-9" placeholder="Meldung, Account oder Quelle" aria-label="Logs durchsuchen" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="caption sm:ml-auto">{account ? account.name : "Alle Accounts"} · {shown.length} Einträge</span>
      </div>

      <Card pad={false} className="overflow-hidden">
        {loading && !overview ? <div className="p-4"><SkeletonRows rows={8} /></div> : shown.length === 0 ? (
          <EmptyState icon={ScrollText} title="Keine Einträge" text={entries.length ? "Kein Eintrag passt zu Filter und Suche." : "Bisher ist nichts passiert."}>
            {entries.length > 0 && <button type="button" className="btn btn-sm" onClick={() => { setLevel("all"); setQ("") }}>Filter zurücksetzen</button>}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {shown.slice(0, 200).map((e) => {
              const isOpen = open === e.post.id
              const detail = JSON.stringify({ post_id: e.post.id, account: e.post.account_name, status: e.post.status, slot: e.post.slot, reddit_id: e.post.reddit_id, subreddit: e.post.subreddit, ig_media_id: e.post.ig_media_id, error: e.post.error, created_at: e.post.created_at, updated_at: e.post.updated_at }, null, 2)
              return (
                <li key={e.post.id} style={{ boxShadow: e.level === "error" ? "inset 3px 0 0 var(--danger)" : undefined }}>
                  <button type="button" className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-hover" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.post.id)}>
                    <span className="w-24 flex-none font-mono text-xs text-ink-3">{fmtDateTime(e.post.updated_at)}</span>
                    <span className="flex w-16 flex-none items-center gap-1.5 text-xs font-semibold text-ink"><span className="size-2 rounded-full" style={{ background: TONE[e.level] }} aria-hidden="true" />{LABEL[e.level]}</span>
                    <span className="tag">{e.source}</span>
                    <span className="caption flex items-center gap-1.5"><AccountDot id={e.post.account_id} /> {e.post.account_name}</span>
                    <span className={`min-w-0 flex-1 basis-full text-ink md:basis-0 ${isOpen ? "" : "truncate"}`}>{e.message}</span>
                    <ChevronDown size={16} className={`ml-auto flex-none text-ink-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="flex flex-col gap-3 bg-surface-2 px-4 py-3">
                      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-[18px] text-ink-2">{detail}</pre>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn btn-sm" onClick={() => drawer.open(e.post)}>Video ansehen</button>
                        <button type="button" className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(detail).then(() => toast("Kopiert"), () => toast("Kopieren nicht möglich", "error"))}><Copy size={14} /> Kopieren</button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      <p className="caption">Die Einträge stammen aus dem Verlauf der Videos (letzte 300). Container-Logs findest du in Portainer.</p>
      <VideoDrawer post={drawer.post} onClose={drawer.close} />
    </div>
  )
}

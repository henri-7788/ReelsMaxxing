"use client"

import { ExternalLink, ListVideo, Play, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { AccountDot, EmptyState, StatusPill, TonePill } from "@/components/ui/kit"
import { displayStatus, fmtDateTime, formatSlot, type Post } from "@/lib/api"
import { useData } from "@/lib/data"

export function canView(p: Post) {
  return !!p.media_file && ["ready", "preview", "publishing", "failed"].includes(p.status)
}

function Thumb({ p, large = false }: { p: Post; large?: boolean }) {
  return (
    <span className={`flex flex-none items-center justify-center rounded-[6px] border border-line bg-surface-2 text-ink-3 ${large ? "h-[86px] w-12 md:h-[100px] md:w-14" : "h-12 w-[27px]"}`} aria-hidden="true">
      {canView(p) && <Play size={large ? 18 : 12} />}
    </span>
  )
}

const STAGE_LABEL = { download: "Lädt von Reddit", waiting: "Wartet auf ffmpeg", render: "Rendert", upload: "Instagram verarbeitet das Video" } as const

/** Live progress of a post that is rendering right now (pushed via /ui-api/events). */
export function RenderProgressBar({ p, className = "" }: { p: Post; className?: string }) {
  const { progress } = useData()
  if (p.status !== "rendering" && p.status !== "publishing") return null
  const pr = progress[p.id]
  if (!pr) return null
  const pct = pr.stage === "render" ? pr.percent : null
  const label = STAGE_LABEL[pr.stage] ?? "Rendert"
  return (
    <span className={`flex w-full flex-col gap-1 ${className}`}>
      <span className="caption flex items-center justify-between gap-2">
        <span>{label}</span>
        {pct !== null && <b className="tabular text-ink">{Math.floor(pct)} %</b>}
      </span>
      <span
        className={`render-bar ${pct === null ? "indeterminate" : ""}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct === null ? undefined : Math.floor(pct)}
      >
        <span style={pct === null ? undefined : { width: `${pct}%` }} />
      </span>
    </span>
  )
}

/** Card for one video in the pipeline and in mobile lists (UIDesign.md 6.7). */
export function VideoCard({ p, onOpen, showAccount = true }: { p: Post; onOpen: (p: Post) => void; showAccount?: boolean }) {
  return (
    <button type="button" onClick={() => onOpen(p)} className="flex w-full gap-3 rounded-[10px] border border-line bg-surface p-3 text-left transition-colors hover:border-line-strong">
      <Thumb p={p} large />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="line-clamp-2 font-medium text-ink">{p.title}</span>
        <span className="caption truncate">r/{p.subreddit} · u/{p.author}</span>
        {p.error && <span className="line-clamp-2 text-xs text-danger">{p.error}</span>}
        <RenderProgressBar p={p} className="pt-1" />
        <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
          <StatusPill post={p} />
          {!!p.muted && <TonePill tone="warning">stumm</TonePill>}
          {showAccount && <span className="caption flex items-center gap-1.5"><AccountDot id={p.account_id} /> {p.account_name}</span>}
          {p.slot && <span className="caption tabular">{formatSlot(p.slot)}</span>}
        </span>
      </span>
    </button>
  )
}

const COLUMNS: { key: string; title: string; match: (s: string) => boolean }[] = [
  { key: "rendering", title: "Rendert", match: (s) => s === "rendering" },
  { key: "ready", title: "Bereit / Vorschau", match: (s) => s === "ready" || s === "preview" },
  { key: "scheduled", title: "Geplant", match: (s) => s === "scheduled" },
  { key: "publishing", title: "Wird gepostet", match: (s) => s === "publishing" },
  { key: "published", title: "Gepostet", match: (s) => s === "published" },
  { key: "failed", title: "Fehler", match: (s) => s === "failed" },
]

export function pipelineCounts(posts: Post[]) {
  return COLUMNS.map((c) => ({ key: c.key, title: c.title, n: posts.filter((p) => c.match(displayStatus(p))).length }))
}

export function PipelineBoard({ posts, onOpen, showAccount }: { posts: Post[]; onOpen: (p: Post) => void; showAccount: boolean }) {
  return (
    <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      {COLUMNS.map((c) => {
        const all = posts.filter((p) => c.match(displayStatus(p)))
        const items = c.key === "published" ? all.slice(0, 20) : all
        return (
          <section key={c.key} className="flex w-[280px] flex-none snap-start flex-col rounded-[16px] border border-line bg-surface-2 p-3 2xl:w-auto 2xl:flex-1" aria-label={`${c.title}, ${all.length} Videos`}>
            <header className="mb-3 flex items-center justify-between px-1">
              <h3 className="font-semibold text-ink">{c.title}</h3>
              <span className={`badge ${c.key === "failed" && all.length ? "danger" : "!bg-surface !text-ink-2"} border border-line`}>{all.length}</span>
            </header>
            <div className="flex flex-col gap-2">
              {items.length === 0 && <p className="caption rounded-[10px] border border-dashed border-line-strong px-3 py-6 text-center">Keine Videos</p>}
              {items.map((p) => <VideoCard key={p.id} p={p} onOpen={onOpen} showAccount={showAccount} />)}
              {all.length > items.length && <p className="caption px-1 pt-1">+{all.length - items.length} weitere im Verlauf</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** Table on desktop, cards below 768 px (UIDesign.md 6.13). */
export function PostTable({ posts, onOpen, showAccount = true, empty = "Noch keine Videos." }: { posts: Post[]; onOpen: (p: Post) => void; showAccount?: boolean; empty?: string }) {
  if (!posts.length) return <EmptyState icon={ListVideo} title="Keine Videos" text={empty} />
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-14">#</th>
              <th>Video</th>
              {showAccount && <th>Account</th>}
              <th>Slot</th>
              <th>Geändert</th>
              <th>Status</th>
              <th><span className="sr-only">Aktionen</span></th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id}>
                <td className="text-ink-3">{p.id}</td>
                <td className="max-w-md">
                  <button type="button" className="link line-clamp-1 text-left font-medium" onClick={() => onOpen(p)}>{p.title}</button>
                  <div className="caption mt-0.5">r/{p.subreddit} · u/{p.author}</div>
                  {p.error && <div className="mt-1 line-clamp-2 text-xs text-danger">{p.error}</div>}
                </td>
                {showAccount && <td><span className="flex items-center gap-2 whitespace-nowrap font-medium text-ink"><AccountDot id={p.account_id} /> {p.account_name}</span></td>}
                <td className="whitespace-nowrap">{formatSlot(p.slot)}</td>
                <td className="whitespace-nowrap text-ink-3">{fmtDateTime(p.updated_at)}</td>
                <td>
                  <span className="flex flex-wrap gap-1"><StatusPill post={p} />{!!p.muted && <TonePill tone="warning">stumm</TonePill>}</span>
                  <RenderProgressBar p={p} className="mt-2 min-w-[140px]" />
                </td>
                <td className="text-right">
                  <button type="button" className="btn btn-sm" onClick={() => onOpen(p)}>{canView(p) ? <><Play size={14} /> Ansehen</> : "Details"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 p-3 md:hidden">
        {posts.map((p) => <li key={p.id}><VideoCard p={p} onOpen={onOpen} showAccount={showAccount} /></li>)}
      </ul>
    </>
  )
}

/** Right drawer on desktop, full-screen sheet on phones (UIDesign.md 6.16). */
export function VideoDrawer({ post: opened, onClose }: { post: Post | null; onClose: () => void }) {
  const { allPosts } = useData()
  // follow live updates of the opened post (status, error, media file)
  const post = opened ? allPosts.find((x) => x.id === opened.id) ?? opened : null
  const isOpen = !!post
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [isOpen, onClose])
  if (!post) return null
  const caption = post.caption ?? ""
  const tags = (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length
  const rows: [string, string][] = [
    ["Account", post.account_name],
    ["Quelle", `r/${post.subreddit} · u/${post.author}`],
    ["Ton", post.muted ? "Quelle ist stumm, Reel ohne Ton" : "Original-Ton von Reddit"],
    ["Slot", formatSlot(post.slot)],
    ["Erstellt", fmtDateTime(post.created_at)],
    ["Geändert", fmtDateTime(post.updated_at)],
    ...(post.ig_media_id ? [["Instagram-Media-ID", post.ig_media_id] as [string, string]] : []),
  ]
  return (
    <div className="fixed inset-0 z-[55]" role="dialog" aria-modal="true" aria-label={`Video: ${post.title}`}>
      <button type="button" className="absolute inset-0 bg-[var(--overlay)]" aria-label="Schließen" onClick={onClose} />
      <aside className="absolute inset-0 flex flex-col overflow-y-auto bg-surface shadow-lg md:inset-y-0 md:left-auto md:w-[480px] md:border-l md:border-line">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
          <span className="flex gap-2"><StatusPill post={post} />{!!post.muted && <TonePill tone="warning">stumm</TonePill>}</span>
          <button type="button" className="icon-btn" aria-label="Schließen" onClick={onClose} autoFocus><X size={20} /></button>
        </header>
        <div className="flex flex-col gap-5 p-5">
          {canView(post) ? (
            <video key={post.id} className="mx-auto aspect-[9/16] max-h-[60vh] rounded-[16px] bg-black" src={`/media/${post.media_file}`} controls playsInline preload="metadata" />
          ) : (
            <div className="mx-auto flex aspect-[9/16] max-h-[36vh] w-auto flex-col items-center justify-center gap-2 rounded-[16px] border border-line bg-surface-2 px-6 text-center text-ink-3">
              <Play size={24} />
              <span className="caption">{post.status === "published" ? "Nach dem Posten wird die Datei gelöscht." : post.status === "rendering" ? "Wird gerade gerendert." : "Keine Videodatei vorhanden."}</span>
            </div>
          )}
          <RenderProgressBar p={post} />
          <h2 className="card-title">{post.title}</h2>
          {post.error && <p role="alert" className="rounded-[10px] border border-danger bg-danger-bg px-3 py-2 text-ink">{post.error}</p>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-ink-3">{k}</dt><dd className="min-w-0 break-words text-ink">{v}</dd></div>)}
          </dl>
          {caption && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-medium text-label">Caption</span>
                <span className="caption tabular">{caption.length} / 2.200 Zeichen · {tags} / 30 Hashtags</span>
              </div>
              <pre className="whitespace-pre-wrap rounded-[10px] border border-line bg-surface-2 p-3 font-sans text-ink-2">{caption}</pre>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <a className="btn" href={`https://reddit.com${post.permalink}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Auf Reddit öffnen</a>
            {canView(post) && <a className="btn" href={`/media/${post.media_file}`} target="_blank" rel="noopener">Video in neuem Tab</a>}
          </div>
        </div>
      </aside>
    </div>
  )
}

export function usePostDrawer() {
  const [post, setPost] = useState<Post | null>(null)
  const close = useCallback(() => setPost(null), [])
  return { post, open: setPost, close }
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { PostList } from "@/components/ui/PostList"
import { api, STATUS_LABEL, type Post } from "@/lib/api"

const FILTERS = ["alle", "published", "ready", "preview", "rendering", "failed"] as const

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("alle")

  useEffect(() => {
    const load = () => api<{ posts: Post[] }>("/posts").then((d) => setPosts(d.posts)).catch((e) => setError(e.message))
    load()
    const t = setInterval(load, 20_000)
    return () => clearInterval(t)
  }, [])

  const shown = useMemo(
    () => (posts ?? []).filter((p) => filter === "alle" || p.status === filter || (filter === "ready" && p.status === "publishing")),
    [posts, filter],
  )

  return (
    <div className="flex flex-col gap-8">
      <header className="pt-6">
        <p className="text-sm font-medium text-muted">Alle Accounts, neueste zuerst</p>
        <h1 className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">Verlauf</h1>
      </header>

      <div role="group" aria-label="Nach Status filtern" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`btn-ghost ${filter === f ? "!bg-white/25" : ""}`}
          >
            {f === "alle" ? "Alle" : STATUS_LABEL[f]}
            {posts && <span className="text-xs text-muted">{f === "alle" ? posts.length : posts.filter((p) => p.status === f || (f === "ready" && p.status === "publishing")).length}</span>}
          </button>
        ))}
      </div>

      {error && <div className="frost px-6 py-4 text-sm text-[#ffc2c2]">Verlauf konnte nicht geladen werden: {error}</div>}
      {posts ? <PostList posts={shown} empty="Keine Videos mit diesem Status." /> : <div className="frost h-64 animate-pulse" />}
    </div>
  )
}

"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { GlassSurface } from "@/components/glass"
import { GlassLink } from "@/components/ui/GlassButton"
import { PostList } from "@/components/ui/PostList"
import { api, formatSlot, type Account, type Overview } from "@/lib/api"

/** Glass with SVG refraction is limited to the first cards; the rest use the same look in plain CSS. */
const MAX_GLASS_CARDS = 6

export default function Dashboard() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api<Overview>("/overview").then(setData).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  const s = data?.stats.by_status ?? {}
  const stats = [
    { label: "Accounts aktiv", value: data ? data.accounts.filter((a) => a.active).length : "–" },
    { label: "Gepostet (7 Tage)", value: data?.stats.published_7d ?? "–" },
    { label: "In Arbeit", value: data ? (s.rendering ?? 0) + (s.ready ?? 0) + (s.publishing ?? 0) : "–" },
    { label: "Fehler gesamt", value: data ? s.failed ?? 0 : "–" },
  ]

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-6 pt-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted">Reddit → Reels → Instagram</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">Übersicht</h1>
        </div>
        <GlassLink href="/account" tone="accent" size="lg">+ Neuer Account</GlassLink>
      </header>

      {error && <div className="frost px-6 py-4 text-sm text-[#ffc2c2]">Daten konnten nicht geladen werden: {error}</div>}

      <GlassSurface variant="panel" layout="fill" padding="20px 8px">
        <dl className="grid w-full grid-cols-2 gap-y-4 md:grid-cols-4">
          {stats.map((st) => (
            <div key={st.label} className="px-5">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted">{st.label}</dt>
              <dd className="mt-1 text-3xl font-bold tabular-nums">{st.value}</dd>
            </div>
          ))}
        </dl>
      </GlassSurface>

      {data && data.due.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Gerade fällig:</span>
          {data.due.map((d) => (
            <GlassSurface key={d.account_id} variant="badge">
              <span className="text-xs font-semibold">{d.name} · {formatSlot(d.slot)}</span>
            </GlassSurface>
          ))}
        </div>
      )}

      <section aria-labelledby="accounts-h" className="flex flex-col gap-4">
        <h2 id="accounts-h" className="text-xl font-semibold">Accounts</h2>
        {!data ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="frost h-44 animate-pulse" />)}
          </div>
        ) : data.accounts.length === 0 ? (
          <div className="frost flex flex-col items-center gap-4 px-6 py-12 text-center">
            <p className="text-muted">Noch keine Accounts angelegt.</p>
            <GlassLink href="/account" tone="accent">Ersten Account anlegen</GlassLink>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.accounts.map((a, i) =>
              i < MAX_GLASS_CARDS ? (
                <GlassSurface key={a.id} variant="card" layout="fill" padding="0px" className="h-full">
                  <AccountCard a={a} />
                </GlassSurface>
              ) : (
                <div key={a.id} className="frost" style={{ borderRadius: 32 }}>
                  <AccountCard a={a} />
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="posts-h" className="flex flex-col gap-4">
        <div className="flex items-end justify-between">
          <h2 id="posts-h" className="text-xl font-semibold">Letzte Videos</h2>
          <Link href="/posts" className="btn-ghost">Alle anzeigen →</Link>
        </div>
        {data ? <PostList posts={data.posts} /> : <div className="frost h-40 animate-pulse" />}
      </section>
    </div>
  )
}

function AccountCard({ a }: { a: Account }) {
  const connected = a.ig_user_id && a.has_token
  return (
    <Link href={`/account?id=${a.id}`} className={`flex h-full flex-col gap-3 px-7 py-6 ${a.active ? "" : "opacity-70"}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold leading-tight">{a.name}</h3>
        <span className={`status ${a.active ? "s-published" : "s-rendering"}`}>{a.active ? "aktiv" : "pausiert"}</span>
      </div>
      {!connected && <p className="text-xs font-medium text-[#ffd27a]">⚠ Instagram nicht verbunden</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted">Zeiten</dt>
        <dd>{a.posting_times}</dd>
        <dt className="text-muted">Nächster</dt>
        <dd>{a.active ? formatSlot(a.next_slot) : "–"}</dd>
      </dl>
      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        {a.sources?.length ? (
          a.sources.map((s) => (
            <span key={s.id} className="rounded-full bg-white/10 px-2.5 py-1 text-xs">r/{s.subreddit}</span>
          ))
        ) : (
          <span className="text-xs text-muted">keine Subreddits</span>
        )}
      </div>
    </Link>
  )
}

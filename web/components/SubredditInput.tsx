"use client"

import { LoaderCircle, Search } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { api, fmt, type SubredditHit } from "@/lib/api"

function members(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mio.`
  if (n >= 1e4) return `${Math.round(n / 1e3)} Tsd.`
  return fmt(n)
}

/** Subreddit name field that searches Reddit while typing (debounced, via /ui-api/reddit/subreddits). */
export function SubredditInput({ id, value, onChange, nsfw }: { id?: string; value: string; onChange: (v: string) => void; nsfw: boolean }) {
  const listId = useId()
  const [hits, setHits] = useState<SubredditHit[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  // Skip the search right after picking a suggestion (value changes, but the user is done)
  // (also the initial value when editing an existing source: no suggestion list on open)
  const picked = useRef<string | null>(value.trim() || null)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = value.trim()
    if (picked.current === q) return
    if (q.length < 2) {
      setHits([]); setLoading(false); setError("")
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/ui-api/reddit/subreddits?${new URLSearchParams({ q, nsfw: String(nsfw) })}`, { signal: ctrl.signal, credentials: "same-origin" })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? `Fehler ${res.status}`)
        const d: { subreddits: SubredditHit[] } = await res.json()
        setHits(d.subreddits); setError(""); setActive(-1); setOpen(true)
      } catch (e) {
        if ((e as Error).name === "AbortError") return
        setHits([]); setError((e as Error).message); setOpen(true)
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 250)
    return () => { ctrl.abort(); window.clearTimeout(t) }
  }, [value, nsfw])

  useEffect(() => {
    function onDoc(e: PointerEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onDoc)
    return () => document.removeEventListener("pointerdown", onDoc)
  }, [])

  function pick(h: SubredditHit) {
    picked.current = h.name
    onChange(h.name)
    setOpen(false)
    setActive(-1)
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || hits.length === 0) {
      if (e.key === "ArrowDown" && hits.length) { setOpen(true); e.preventDefault() }
      return
    }
    if (e.key === "ArrowDown") { setActive((a) => (a + 1) % hits.length); e.preventDefault() }
    else if (e.key === "ArrowUp") { setActive((a) => (a <= 0 ? hits.length - 1 : a - 1)); e.preventDefault() }
    else if (e.key === "Enter" && active >= 0) { pick(hits[active]); e.preventDefault() }
    else if (e.key === "Escape") { setOpen(false); e.preventDefault() }
  }

  const q = value.trim().toLowerCase()
  const showList = open && q.length >= 2 && !loading

  return (
    <div className="relative" ref={wrap}>
      <div className="relative">
        <input
          id={id}
          className="field !pl-9"
          required
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => { picked.current = null; onChange(e.target.value.replace(/^\/?r\//, "")) }}
          onFocus={() => hits.length && setOpen(true)}
          onKeyDown={onKey}
          placeholder="z. B. aww"
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
          {loading ? <LoaderCircle size={16} className="animate-spin" /> : <Search size={16} />}
        </span>
      </div>
      {showList && (
        <ul id={listId} role="listbox" aria-label="Gefundene Subreddits" className="popover absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto p-1 font-normal">
          {error ? (
            <li className="caption px-3 py-2">{error}. Name einfach von Hand eintragen.</li>
          ) : hits.length === 0 ? (
            <li className="caption px-3 py-2">Kein Subreddit gefunden</li>
          ) : hits.map((h, i) => (
            <li
              key={h.name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${i === active ? "bg-hover" : "hover:bg-hover"}`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => pick(h)}
              onMouseEnter={() => setActive(i)}
            >
              {h.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.icon} alt="" width={28} height={28} loading="lazy" referrerPolicy="no-referrer" className="size-7 flex-none rounded-full object-cover" />
              ) : (
                <span className="flex size-7 flex-none items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-ink-2" aria-hidden="true">r/</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-medium text-ink">
                  <span className="truncate">r/{h.name}</span>
                  {h.over18 && <span className="status s-danger !py-0 text-[11px]">NSFW</span>}
                </span>
                <span className="caption block truncate">{h.title}</span>
              </span>
              <span className="caption flex-none tabular">{members(h.subscribers)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

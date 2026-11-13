"use client"

import { ChevronDown, Plus, Rss, TriangleAlert } from "lucide-react"
import { useState, type FormEvent } from "react"
import { Card, CardHeader, EmptyState, Menu, Switch } from "@/components/ui/kit"
import { useToast } from "@/components/ui/Toast"
import { api, relTime, type Source, type Stats } from "@/lib/api"

export const SORT_LABEL: Record<string, string> = { top: "Top", hot: "Hot", rising: "Rising", new: "Neu" }
export const TIME_LABEL: Record<string, string> = { hour: "Stunde", day: "Tag", week: "Woche", month: "Monat", year: "Jahr", all: "immer" }

export function sourceSummary(s: Source) {
  return `${SORT_LABEL[s.sort] ?? s.sort}${s.sort === "top" ? ` / ${TIME_LABEL[s.time_filter] ?? s.time_filter}` : ""} · ≥ ${s.min_score} ▲ · ${s.min_duration}–${s.max_duration} s · NSFW ${s.allow_nsfw ? "an" : "aus"}`
}

/** Subreddits of one account with their filters and hit counts (UIDesign.md 6.15). */
export function Sources({ accountId, sources, stats, onChange }: { accountId: number; sources: Source[]; stats?: Stats["sources"]; onChange: (s: Source[]) => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(sources.length === 0)
  const [sub, setSub] = useState("")
  const [sort, setSort] = useState("top")
  const [timeFilter, setTimeFilter] = useState("day")
  const [minScore, setMinScore] = useState(500)
  const [minDur, setMinDur] = useState(5)
  const [maxDur, setMaxDur] = useState(90)
  const [nsfw, setNsfw] = useState(false)
  const [busy, setBusy] = useState(false)

  async function add(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const d = await api<{ sources: Source[] }>(`/accounts/${accountId}/sources`, {
        method: "POST",
        body: { subreddit: sub, sort, time_filter: timeFilter, min_score: minScore, min_duration: minDur, max_duration: maxDur, allow_nsfw: nsfw },
      })
      onChange(d.sources)
      toast(`r/${sub.replace(/^r\//, "")} hinzugefügt`)
      setSub("")
    } catch (e) {
      toast((e as Error).message, "error")
    } finally {
      setBusy(false)
    }
  }

  async function remove(s: Source) {
    try {
      await api(`/sources/${s.id}`, { method: "DELETE" })
      onChange(sources.filter((x) => x.id !== s.id))
      toast(`r/${s.subreddit} entfernt`)
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  return (
    <Card>
      <CardHeader title="Subreddits" sub={`${sources.length} ${sources.length === 1 ? "Quelle" : "Quellen"}`} />
      {sources.length === 0 ? (
        <EmptyState icon={Rss} title="Keine Quellen" text="Ohne Subreddits findet der Account keine Videos." />
      ) : (
        <ul className="-mt-2 flex flex-col divide-y divide-line">
          {sources.map((s) => {
            const st = stats?.find((x) => x.subreddit.toLowerCase() === s.subreddit.toLowerCase())
            return (
              <li key={s.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink">r/{s.subreddit}</div>
                  <div className="caption mt-0.5">{sourceSummary(s)}</div>
                  <div className="caption mt-1 tabular">
                    {st ? <>Videos: {st.total} · gepostet: {st.published} · Fehler: {st.failed} · zuletzt {relTime(st.last)}</> : (
                      <span className="flex items-center gap-1 text-warning"><TriangleAlert size={12} /> Noch kein Video aus dieser Quelle</span>
                    )}
                  </div>
                </div>
                <Menu label={`Aktionen für r/${s.subreddit}`} items={[{ label: "Auf Reddit öffnen", href: `https://reddit.com/r/${s.subreddit}` }, { label: "Entfernen", danger: true, onSelect: () => remove(s) }]} />
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-2 border-t border-line pt-4">
        <button type="button" className="flex w-full items-center justify-between font-medium text-ink" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="flex items-center gap-2"><Plus size={16} /> Subreddit hinzufügen</span>
          <ChevronDown size={16} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <form onSubmit={add} className="mt-4 flex flex-col gap-3">
            <label className="label">
              Name
              <input className="field" required value={sub} onChange={(e) => setSub(e.target.value.replace(/^\/?r\//, ""))} placeholder="z. B. aww" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="label">
                Sortierung
                <select className="field" value={sort} onChange={(e) => setSort(e.target.value)}>
                  {Object.entries(SORT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="label">
                Zeitraum
                <select className="field" value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} disabled={sort !== "top"}>
                  {Object.entries(TIME_LABEL).filter(([v]) => v !== "hour").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="label">Min. ▲<input className="field" type="number" min={0} value={minScore} onChange={(e) => setMinScore(+e.target.value)} /></label>
              <label className="label">Min. s<input className="field" type="number" min={0} value={minDur} onChange={(e) => setMinDur(+e.target.value)} /></label>
              <label className="label">Max. s<input className="field" type="number" min={1} max={900} value={maxDur} onChange={(e) => setMaxDur(+e.target.value)} /></label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Switch checked={nsfw} onChange={setNsfw}>NSFW erlauben</Switch>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Fügt hinzu…" : "Hinzufügen"}</button>
            </div>
          </form>
        )}
      </div>
    </Card>
  )
}

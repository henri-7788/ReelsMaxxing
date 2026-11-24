"use client"

import { ChevronDown, Plus, Rss, TriangleAlert } from "lucide-react"
import { useState, type FormEvent } from "react"
import { Card, CardHeader, EmptyState, Menu, Switch } from "@/components/ui/kit"
import { SubredditInput } from "@/components/SubredditInput"
import { useToast } from "@/components/ui/Toast"
import { api, relTime, type Source, type Stats } from "@/lib/api"

export const SORT_LABEL: Record<string, string> = { top: "Top", hot: "Hot", rising: "Rising", new: "Neu" }
export const TIME_LABEL: Record<string, string> = { hour: "Stunde", day: "Tag", week: "Woche", month: "Monat", year: "Jahr", all: "immer" }

export function sourceSummary(s: Source) {
  return `${SORT_LABEL[s.sort] ?? s.sort}${s.sort === "top" ? ` / ${TIME_LABEL[s.time_filter] ?? s.time_filter}` : ""} · ≥ ${s.min_score} ▲ · ${s.min_duration}–${s.max_duration} s · NSFW ${s.allow_nsfw ? "an" : "aus"}`
}

type SourceDraft = Pick<Source, "subreddit" | "sort" | "time_filter" | "min_score" | "min_duration" | "max_duration"> & { allow_nsfw: boolean }

const NEW_SOURCE: SourceDraft = { subreddit: "", sort: "top", time_filter: "day", min_score: 500, min_duration: 5, max_duration: 90, allow_nsfw: false }

/** Name (with live Reddit search) plus filters; used for adding and for editing a source. */
function SourceForm({ id, initial, submitLabel, busyLabel, onSubmit, onCancel }: {
  id: string
  initial: SourceDraft
  submitLabel: string
  busyLabel: string
  onSubmit: (d: SourceDraft) => Promise<boolean>
  onCancel?: () => void
}) {
  const [d, setD] = useState<SourceDraft>(initial)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof SourceDraft>(k: K, v: SourceDraft[K]) => setD((x) => ({ ...x, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (await onSubmit(d)) setD((x) => (onCancel ? x : { ...x, subreddit: "" }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="label">
        <label htmlFor={id}>Name</label>
        <SubredditInput id={id} value={d.subreddit} onChange={(v) => set("subreddit", v)} nsfw={d.allow_nsfw} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="label">
          Sortierung
          <select className="field" value={d.sort} onChange={(e) => set("sort", e.target.value)}>
            {Object.entries(SORT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="label">
          Zeitraum
          <select className="field" value={d.time_filter} onChange={(e) => set("time_filter", e.target.value)} disabled={d.sort !== "top"}>
            {Object.entries(TIME_LABEL).filter(([v]) => v !== "hour" || d.time_filter === "hour").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <label className="label">Min. ▲<input className="field" type="number" min={0} value={d.min_score} onChange={(e) => set("min_score", +e.target.value)} /></label>
        <label className="label">Min. s<input className="field" type="number" min={0} value={d.min_duration} onChange={(e) => set("min_duration", +e.target.value)} /></label>
        <label className="label">Max. s<input className="field" type="number" min={1} max={900} value={d.max_duration} onChange={(e) => set("max_duration", +e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Switch checked={d.allow_nsfw} onChange={(v) => set("allow_nsfw", v)}>NSFW erlauben</Switch>
        <div className="flex gap-2">
          {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Abbrechen</button>}
          <button type="submit" className="btn btn-primary" disabled={busy || !d.subreddit.trim()}>{busy ? busyLabel : submitLabel}</button>
        </div>
      </div>
    </form>
  )
}

/** Subreddits of one account with their filters and hit counts (UIDesign.md 6.15). */
export function Sources({ accountId, sources, stats, onChange }: { accountId: number; sources: Source[]; stats?: Stats["sources"]; onChange: (s: Source[]) => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(sources.length === 0)
  const [editing, setEditing] = useState<number | null>(null)

  async function save(d: SourceDraft, src?: Source) {
    try {
      const res = await api<{ sources: Source[] }>(src ? `/sources/${src.id}` : `/accounts/${accountId}/sources`, { method: src ? "PUT" : "POST", body: d })
      onChange(res.sources)
      const name = `r/${d.subreddit.trim().replace(/^r\//, "").replace(/\/+$/, "")}`
      toast(src ? `${name} gespeichert` : `${name} hinzugefügt`)
      if (src) setEditing(null)
      return true
    } catch (e) {
      toast((e as Error).message, "error")
      return false
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
            if (editing === s.id) {
              return (
                <li key={s.id} className="py-3">
                  <div className="mb-3 font-semibold text-ink">r/{s.subreddit} bearbeiten</div>
                  <SourceForm
                    id={`sub-edit-${s.id}`}
                    initial={{ ...s, allow_nsfw: !!s.allow_nsfw }}
                    submitLabel="Speichern"
                    busyLabel="Speichert…"
                    onSubmit={(d) => save(d, s)}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              )
            }
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
                <Menu label={`Aktionen für r/${s.subreddit}`} items={[
                  { label: "Bearbeiten", onSelect: () => setEditing(s.id) },
                  { label: "Auf Reddit öffnen", href: `https://reddit.com/r/${s.subreddit}` },
                  { label: "Entfernen", danger: true, onSelect: () => remove(s) },
                ]} />
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
          <div className="mt-4">
            <SourceForm id={`sub-name-${accountId}`} initial={NEW_SOURCE} submitLabel="Hinzufügen" busyLabel="Fügt hinzu…" onSubmit={(d) => save(d)} />
          </div>
        )}
      </div>
    </Card>
  )
}

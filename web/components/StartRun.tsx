"use client"

import { Film, Rocket, Send } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { useToast } from "@/components/ui/Toast"
import { api, fmtDateTime, type Account } from "@/lib/api"

type Mode = "full" | "post"
type RunState = {
  running: boolean
  last: { ok: boolean; message: string; post_id: number | null; finished_at: number } | null
  postable: { id: number; title: string; subreddit: string; status: string; created_at: string } | null
}

/**
 * "Start" on the account page: runs the account's workflow right now, outside the schedule.
 * Either the whole chain (Reddit -> render -> Instagram) or posting the newest rendered video.
 * Progress shows live in the queue; when the run ends a toast reports the result.
 */
export function StartRun({ account, hasSources, onChange }: { account: Account; hasSources: boolean; onChange: () => void }) {
  const toast = useToast()
  const ref = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<RunState | null>(null)
  const [mode, setMode] = useState<Mode>("full")
  const [busy, setBusy] = useState(false)
  const [watching, setWatching] = useState(false)
  const connected = !!account.ig_user_id && !!account.has_token
  const handle = account.ig_username ? `@${account.ig_username}` : account.name

  const refresh = useCallback(async () => {
    const s = await api<RunState>(`/accounts/${account.id}/run`)
    setState(s)
    return s
  }, [account.id])

  useEffect(() => { refresh().then((s) => { if (s.running) setWatching(true) }).catch(() => {}) }, [refresh])

  // While a run is active: check every few seconds, report the result once it is done
  useEffect(() => {
    if (!watching) return
    const t = setInterval(async () => {
      try {
        const s = await refresh()
        if (s.running) return
        setWatching(false)
        onChange()
        if (s.last) toast(s.last.ok ? `${handle}: Reel ist auf Instagram online` : `${handle}: Durchlauf fehlgeschlagen. ${s.last.message}`, s.last.ok ? "ok" : "error")
      } catch { /* next tick */ }
    }, 4000)
    return () => clearInterval(t)
  }, [watching, refresh, onChange, toast, handle])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  async function openDialog() {
    setOpen(true)
    try {
      const s = await refresh()
      setMode(hasSources || !s.postable ? "full" : "post")
    } catch { /* dialog still works with the last state */ }
  }

  async function start() {
    setBusy(true)
    try {
      await api(`/accounts/${account.id}/run`, { method: "POST", body: { mode } })
      setOpen(false)
      setWatching(true)
      setState((s) => (s ? { ...s, running: true } : s))
      toast(mode === "full" ? "Workflow gestartet: Reddit, Rendern, Posten. Den Fortschritt siehst du in der Warteschlange." : "Video wird auf Instagram gepostet. Den Fortschritt siehst du in der Warteschlange.")
      setTimeout(onChange, 1500)
    } catch (e) {
      toast((e as Error).message, "error")
    } finally {
      setBusy(false)
    }
  }

  const running = watching || !!state?.running
  const postable = state?.postable
  const options: { value: Mode; icon: typeof Rocket; title: string; text: string; disabled: string | null }[] = [
    {
      value: "full", icon: Rocket, title: "Komplett durchlaufen",
      text: "Neues Video von Reddit holen, rendern und direkt auf Instagram posten.",
      disabled: hasSources ? null : "Erst Subreddits hinzufügen",
    },
    {
      value: "post", icon: Film, title: "Fertiges Video posten",
      text: postable ? `„${postable.title}“ · r/${postable.subreddit} · gerendert ${fmtDateTime(postable.created_at)}` : "Das neueste gerenderte Video (z. B. eine Vorschau) ohne neues Rendern posten.",
      disabled: postable ? null : "Kein fertig gerendertes Video vorhanden",
    },
  ]
  const blocked = !connected || running || !!options.find((o) => o.value === mode)?.disabled

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={openDialog} aria-haspopup="dialog"
        title={running ? "Läuft gerade, Fortschritt in der Warteschlange" : "Workflow jetzt manuell starten"}>
        <Send size={16} /> {running ? "Läuft…" : "Start"}
      </button>
      <dialog ref={ref} className="modal m-auto" aria-labelledby="run-title" onClose={() => setOpen(false)}>
        {open && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 id="run-title" className="card-title">Workflow jetzt starten</h2>
              <p className="caption mt-1">Läuft sofort, unabhängig vom Zeitplan. Die geplanten Slots bleiben unverändert.</p>
            </div>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Was soll passieren?">
              {options.map((o) => {
                const active = mode === o.value
                return (
                  <button key={o.value} type="button" role="radio" aria-checked={active} disabled={!!o.disabled}
                    onClick={() => setMode(o.value)}
                    className={`flex gap-3 rounded-[10px] border p-3 text-left transition-colors disabled:opacity-45 ${active ? "border-primary-600 bg-primary-50" : "border-line hover:border-line-strong"}`}>
                    <o.icon size={18} className={`mt-0.5 flex-none ${active ? "text-primary-600" : "text-ink-3"}`} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium text-ink">{o.title}</span>
                      <span className="caption line-clamp-2">{o.disabled ?? o.text}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            {!connected ? (
              <p className="text-sm text-danger">Der Account ist nicht mit Instagram verbunden. Erst verbinden, dann starten.</p>
            ) : running ? (
              <p className="text-sm text-ink-2">Für diesen Account läuft gerade ein Durchlauf. Den Fortschritt siehst du in der <Link href="/queue" className="underline">Warteschlange</Link>.</p>
            ) : (
              <p className="text-sm text-ink-2">Das Reel geht ohne weitere Nachfrage öffentlich auf <b className="text-ink">{handle}</b> online.</p>
            )}
            <div className="mt-1 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setOpen(false)} autoFocus>Abbrechen</button>
              <button type="button" className="btn btn-primary" onClick={start} disabled={busy || blocked}>
                {busy ? "…" : mode === "full" ? "Jetzt durchlaufen lassen" : "Jetzt posten"}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  )
}

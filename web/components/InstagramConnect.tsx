"use client"

import { Check, ExternalLink, Loader2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { instagramConnectUrl } from "@/lib/api"

/** Same name as in app/main.py (_connect_result_page). */
const CHANNEL = "reels-instagram"
export type ConnectResult = { ig: "connected" | "error"; message: string; account_id: number | null }

/**
 * Opens the Meta login in a new tab and covers the page with a loading overlay until the
 * callback tab reports back (BroadcastChannel / postMessage) or the tab is closed.
 */
export function useInstagramConnect(onDone: (r: ConnectResult | null) => void) {
  const [waiting, setWaiting] = useState(false)
  const [tabClosed, setTabClosed] = useState(false)
  const popup = useRef<Window | null>(null)
  const url = useRef("")
  const done = useRef(onDone)
  done.current = onDone

  const active = useRef(false)
  const finish = useCallback((r: ConnectResult | null) => {
    // The result can arrive twice (BroadcastChannel and postMessage): handle it once
    if (!active.current) return
    active.current = false
    popup.current = null
    setWaiting(false)
    setTabClosed(false)
    done.current(r)
  }, [])

  useEffect(() => {
    if (!waiting) return
    const onResult = (data: unknown) => {
      const d = data as Partial<ConnectResult> & { type?: string }
      if (d && (d.ig === "connected" || d.ig === "error")) finish({ ig: d.ig, message: d.message ?? "", account_id: d.account_id ?? null })
    }
    const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null
    if (bc) bc.onmessage = (e) => onResult(e.data)
    const onMessage = (e: MessageEvent) => { if (e.origin === location.origin && e.data?.type === CHANNEL) onResult(e.data) }
    window.addEventListener("message", onMessage)
    // Only a hint, no auto-cancel: some login pages cut the link to this tab, then `closed` reads true too early
    const timer = setInterval(() => setTabClosed(!!popup.current?.closed), 1000)
    return () => { bc?.close(); window.removeEventListener("message", onMessage); clearInterval(timer) }
  }, [waiting, finish])

  const start = useCallback((accountId: number) => {
    url.current = instagramConnectUrl(accountId)
    const w = window.open(url.current, "_blank")
    if (!w) {  // popup blocked: classic redirect in this tab, the callback page redirects back
      try { sessionStorage.setItem("ig-same-tab", "1") } catch { /* ignore */ }
      location.href = url.current
      return
    }
    popup.current = w
    active.current = true
    setTabClosed(false)
    setWaiting(true)
  }, [])

  const reopen = useCallback(() => {
    if (popup.current && !popup.current.closed) popup.current.focus()
    else popup.current = window.open(url.current, "_blank")
  }, [])

  const cancel = useCallback(() => {
    popup.current?.close()
    finish(null)
  }, [finish])

  return { waiting, tabClosed, start, reopen, cancel }
}

export function ConnectOverlay({ onReopen, onCancel, tabClosed }: { onReopen: () => void; onCancel: () => void; tabClosed?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="ig-wait-title">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-[16px] border border-line bg-surface p-6 text-center shadow-lg">
        <Loader2 size={36} className="animate-spin text-primary-600" aria-hidden />
        <h3 id="ig-wait-title" className="text-[17px] font-semibold text-ink">Anmeldung im neuen Tab</h3>
        <p className="caption">Melde dich dort an und wähle Portfolio und Instagram-Konto. Dieser Tab aktualisiert sich danach von selbst.</p>
        {tabClosed && <p className="caption text-warning">Login-Tab geschlossen? Dann öffne ihn wieder oder brich ab.</p>}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-sm" onClick={onReopen}><ExternalLink size={14} /> Tab wieder öffnen</button>
          <button type="button" className="btn btn-sm" onClick={onCancel}>Abbrechen</button>
        </div>
      </div>
    </div>
  )
}

type Step = { id: string; title: string; body: ReactNode }

function steps(business: string, appId: string): { prepare: Step[]; login: Step[] } {
  const rolesUrl = appId ? `https://developers.facebook.com/apps/${appId}/roles/roles/` : "https://developers.facebook.com/apps/"
  const portfolio = business ? <b>„{business}“</b> : "deinem Business-Portfolio"
  return {
    prepare: [
      { id: "pro", title: "Professionelles Konto", body: <>Das Instagram-Konto ist ein <b>Business- oder Creator-Konto</b> (Instagram-App → Einstellungen → Kontoart und Tools).</> },
      { id: "whitelist", title: "Im Meta-Dashboard als Tester eintragen", body: <>Unter <a className="link" href={rolesUrl} target="_blank" rel="noopener noreferrer">App-Rollen → Rollen</a> → <b>Personen hinzufügen</b> → <b>Instagram-Tester</b> den Instagram-Namen eintragen. Erst danach taucht die Einladung im Instagram-Konto auf.</> },
      { id: "tester", title: "Tester-Einladung angenommen", body: <>Auf <a className="link" href="https://www.instagram.com/accounts/manage_access/" target="_blank" rel="noopener noreferrer">instagram.com → Apps und Websites</a> unter <b>Tester-Einladungen</b> annehmen. Nötig, solange die Meta-App im Entwicklungsmodus ist.</> },
      { id: "portfolio", title: "Konto im richtigen Portfolio", body: <>In der <a className="link" href="https://business.facebook.com/latest/settings/instagram_account_v2" target="_blank" rel="noopener noreferrer">Business-Verwaltung</a> liegt das Instagram-Konto in {portfolio} (Konten → Instagram-Konten → Hinzufügen).</> },
    ],
    login: [
      { id: "facebook", title: "„Mit Facebook fortfahren“ wählen", body: <>Mit dem Facebook-Konto, das Admin von {portfolio} ist. Der Instagram-Login schlägt dagegen das Portfolio vor, in dem das Instagram-Konto gerade liegt, das kann ein altes sein.</> },
      { id: "select", title: "Portfolio und Konto auswählen", body: <>{business ? <>Portfolio {portfolio}</> : "Dein Portfolio"} wählen, dann das Instagram-Konto. Werbekonto überspringen, Berechtigungen bestätigen.</> },
    ],
  }
}

/** Tickable preparation list next to the connect button; ticks are remembered per account in this browser. */
export function ConnectChecklist({ accountId, business, appId = "" }: { accountId: number; business: string; appId?: string }) {
  const key = `ig-checklist-${accountId}`
  const [done, setDone] = useState<Record<string, boolean>>({})
  useEffect(() => {
    try { setDone(JSON.parse(localStorage.getItem(key) ?? "{}")) } catch { setDone({}) }
  }, [key])
  const toggle = (id: string) => setDone((d) => {
    const next = { ...d, [id]: !d[id] }
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* private mode */ }
    return next
  })
  const { prepare, login } = steps(business, appId)
  const group = (title: string, list: Step[], offset: number) => (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">{title}</p>
      <ol className="flex flex-col gap-2.5">
        {list.map((s, i) => (
          <li key={s.id} className="flex gap-2.5">
            <button
              type="button" role="checkbox" aria-checked={!!done[s.id]} aria-label={s.title} onClick={() => toggle(s.id)}
              className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold tabular transition-colors ${done[s.id] ? "border-success bg-success text-on-primary" : "border-line-strong text-ink-3 hover:border-primary-600"}`}
            >
              {done[s.id] ? <Check size={12} strokeWidth={3} /> : offset + i + 1}
            </button>
            <div className={done[s.id] ? "opacity-60" : ""}>
              <p className="text-[13px] font-medium text-ink">{s.title}</p>
              <p className="caption">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
  return (
    <div className="flex flex-col gap-4 rounded-[12px] border border-line bg-surface-2 p-4" aria-label="Checkliste zum Verbinden">
      {group("Vorher vorbereiten", prepare, 0)}
      {group("Im Login-Fenster", login, prepare.length)}
    </div>
  )
}

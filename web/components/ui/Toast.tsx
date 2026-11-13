"use client"

import { X } from "lucide-react"
import { createContext, useCallback, useContext, useState, type ReactNode } from "react"

type Toast = { id: number; text: string; kind: "ok" | "error" }
const Ctx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {})

export function useToast() {
  return useContext(Ctx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const drop = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    // Errors stay until closed (UIDesign.md 6.18)
    if (kind === "ok") setTimeout(() => drop(id), 5000)
  }, [drop])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-20 z-[60] flex flex-col items-center gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-[360px] items-start gap-3 rounded-[10px] border border-line bg-surface py-3 pl-4 pr-2 text-ink shadow-lg"
            style={{ borderLeft: `3px solid var(${t.kind === "error" ? "--danger" : "--success"})` }}
          >
            <span className="flex-1 py-0.5">{t.text}</span>
            <button type="button" className="icon-btn !size-7" aria-label="Schließen" onClick={() => drop(t.id)}><X size={16} /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

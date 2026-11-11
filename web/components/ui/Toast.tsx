"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"

type Toast = { id: number; text: string; kind: "ok" | "error" }
const Ctx = createContext<(text: string, kind?: Toast["kind"]) => void>(() => {})

export function useToast() {
  return useContext(Ctx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 4000)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`frost pointer-events-auto max-w-md px-5 py-3 text-sm font-medium ${t.kind === "error" ? "text-[#ffc2c2]" : ""}`}
            style={{ borderRadius: 999 }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

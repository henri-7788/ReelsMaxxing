"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { api, type Account, type Overview, type Post, type SystemInfo } from "./api"

/** Fetch with polling that pauses while the tab is hidden (UIDesign.md section 12). */
export function useApi<T>(path: string | null, intervalMs = 0) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!path)
  const alive = useRef(true)

  const reload = useCallback(async () => {
    if (!path) return
    try {
      const d = await api<T>(path)
      if (!alive.current) return
      setData(d)
      setError(null)
    } catch (e) {
      if (alive.current) setError((e as Error).message)
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [path])

  useEffect(() => {
    alive.current = true
    if (!path) {
      setData(null)
      setLoading(false)
      return
    }
    setLoading(true)
    reload()
    let timer: ReturnType<typeof setInterval> | undefined
    const start = () => {
      if (intervalMs && !timer) timer = setInterval(reload, intervalMs)
    }
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = undefined
    }
    const onVis = () => {
      if (document.visibilityState === "visible") {
        reload()
        start()
      } else stop()
    }
    if (document.visibilityState === "visible") start()
    document.addEventListener("visibilitychange", onVis)
    return () => {
      alive.current = false
      stop()
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [path, intervalMs, reload])

  return { data, error, loading, reload }
}

export type Theme = "light" | "dark"

type Ctx = {
  overview: Overview | null
  accounts: Account[]
  /** Latest posts (up to 300) of all accounts, newest first */
  allPosts: Post[]
  /** Posts filtered by the account switcher */
  posts: Post[]
  system: SystemInfo | null
  loading: boolean
  error: string | null
  reload: () => void
  accountId: number | null
  account: Account | null
  setAccountId: (id: number | null) => void
  theme: Theme
  /** null = follow the system setting */
  themeChoice: Theme | null
  setTheme: (t: Theme | null) => void
}

const DataCtx = createContext<Ctx | null>(null)

export function useData(): Ctx {
  const c = useContext(DataCtx)
  if (!c) throw new Error("DataProvider fehlt")
  return c
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function DataProvider({ children }: { children: ReactNode }) {
  const ov = useApi<Overview>("/overview", 30_000)
  const ps = useApi<{ posts: Post[] }>("/posts?limit=300", 30_000)
  const sys = useApi<SystemInfo>("/system", 10_000)
  const [accountId, setAccountIdState] = useState<number | null>(null)
  const [themeChoice, setThemeChoice] = useState<Theme | null>(null)
  const [theme, setThemeState] = useState<Theme>("light")

  useEffect(() => {
    const stored = Number(localStorage.getItem("account"))
    if (stored) setAccountIdState(stored)
    const t = localStorage.getItem("theme")
    const choice = t === "light" || t === "dark" ? t : null
    setThemeChoice(choice)
    setThemeState(choice ?? systemTheme())
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      if (localStorage.getItem("theme")) return
      const next = systemTheme()
      document.documentElement.dataset.theme = next
      setThemeState(next)
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const setTheme = useCallback((t: Theme | null) => {
    if (t) localStorage.setItem("theme", t)
    else localStorage.removeItem("theme")
    const next = t ?? systemTheme()
    document.documentElement.dataset.theme = next
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#0E1015" : "#F3F4F8")
    setThemeChoice(t)
    setThemeState(next)
  }, [])

  const setAccountId = useCallback((id: number | null) => {
    if (id) localStorage.setItem("account", String(id))
    else localStorage.removeItem("account")
    setAccountIdState(id)
  }, [])

  const accounts = useMemo(() => ov.data?.accounts ?? [], [ov.data])
  const account = accounts.find((a) => a.id === accountId) ?? null
  const effectiveId = account ? account.id : null
  const allPosts = useMemo(() => ps.data?.posts ?? [], [ps.data])
  const posts = useMemo(() => (effectiveId ? allPosts.filter((p) => p.account_id === effectiveId) : allPosts), [allPosts, effectiveId])
  const reloadOv = ov.reload, reloadPs = ps.reload
  const reload = useCallback(() => {
    reloadOv()
    reloadPs()
  }, [reloadOv, reloadPs])

  const value: Ctx = {
    overview: ov.data, accounts, allPosts, posts, system: sys.data,
    loading: ov.loading || ps.loading, error: ov.error ?? ps.error, reload,
    accountId: effectiveId, account, setAccountId, theme, themeChoice, setTheme,
  }
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>
}

export function useIsMobile(query = "(max-width: 767px)") {
  const [m, setM] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setM(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [query])
  return m
}

/** Close a popover on outside click or Escape. */
export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, close])
  return ref
}

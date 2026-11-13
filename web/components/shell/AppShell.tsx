"use client"

import { ArrowLeft, Bell, ChevronDown, Menu as MenuIcon, Moon, Plus, Search, Sun, X } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AccountDot, Segmented } from "@/components/ui/kit"
import { useToast } from "@/components/ui/Toast"
import { accountIssue, api, relTime, type Post } from "@/lib/api"
import { useData, useDismiss, type Theme } from "@/lib/data"
import { AccountSwitcher } from "./AccountSwitcher"
import { HELP, isActive, MAIN_NAV, OTHER_NAV, TITLES, type NavItem } from "./nav"

const DAY = 86_400_000

function useBadges() {
  const { allPosts } = useData()
  return useMemo(() => {
    const recent = (p: Post) => Date.now() - new Date(p.updated_at).getTime() < DAY
    const failed = allPosts.filter((p) => p.status === "failed" && recent(p)).length
    const waiting = allPosts.filter((p) => p.status === "preview").length
    return { "/queue": { n: failed + waiting, danger: failed > 0 }, "/logs": { n: failed, danger: true } } as Record<string, { n: number; danger: boolean }>
  }, [allPosts])
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-[10px]" aria-label="Reels-Manager, zum Dashboard">
      <svg viewBox="0 0 28 28" className="size-7 flex-none" aria-hidden="true">
        <circle cx="14" cy="14" r="14" fill="var(--primary-600)" />
        <path d="M11.2 8.6v10.8l8.6-5.4z" fill="var(--on-primary)" />
      </svg>
      <span className="card-title hidden lg:inline">Reels-Manager</span>
    </Link>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useData()
  return (
    <Segmented<Theme>
      label="Darstellung"
      value={theme}
      onChange={setTheme}
      options={[
        { value: "light", label: <><Sun size={16} /> Hell</> },
        { value: "dark", label: <><Moon size={16} /> Dunkel</> },
      ]}
    />
  )
}

function NavLink({ item, path, badge, onClick }: { item: NavItem; path: string; badge?: { n: number; danger: boolean }; onClick?: () => void }) {
  const active = isActive(item, path)
  const Icon = item.icon
  const external = item.href.startsWith("/api/")
  const cls = `group relative flex h-10 items-center gap-3 rounded-[10px] px-3 font-medium transition-colors ${active ? "bg-primary-50 font-semibold text-primary-700" : "text-ink-2 hover:bg-hover hover:text-ink"}`
  const inner = (
    <>
      <Icon size={20} strokeWidth={1.5} className="flex-none" />
      <span className="nav-text flex-1 truncate">{item.label}</span>
      {badge && badge.n > 0 && (
        <>
          <span className={`nav-text badge ${badge.danger ? "danger" : ""}`} aria-label={`${badge.n} offen`}>{badge.n > 99 ? "99+" : badge.n}</span>
          <span className={`nav-dot absolute right-2 top-2 size-2 rounded-full ${badge.danger ? "bg-danger" : "bg-warning"}`} aria-hidden="true" />
        </>
      )}
    </>
  )
  return external ? (
    <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls} title={item.label} onClick={onClick}>{inner}</a>
  ) : (
    <Link href={item.href} className={cls} aria-current={active ? "page" : undefined} title={item.label} onClick={onClick}>{inner}</Link>
  )
}

function SystemLine() {
  const { system } = useData()
  if (!system) return null
  const level = system.cpu > 85 || system.disk.percent > 95 ? "danger" : system.cpu > 60 || system.disk.percent > 85 ? "warning" : "success"
  const text = level === "success" ? "Mini-PC ok" : level === "warning" ? "Mini-PC ausgelastet" : "Mini-PC am Limit"
  return (
    <Link href="/system" className="caption flex items-center gap-2 rounded-[10px] px-3 py-2 hover:bg-hover" title="System öffnen">
      <span className={`size-2 flex-none rounded-full bg-${level}`} aria-hidden="true" />
      <span className="nav-text truncate">{text} · CPU {Math.round(system.cpu)} %</span>
    </Link>
  )
}

function SidebarContent({ path, onNavigate, full = false }: { path: string; onNavigate?: () => void; full?: boolean }) {
  const { accounts } = useData()
  const badges = useBadges()
  const [openAccounts, setOpenAccounts] = useState(true)
  return (
    <div className={`flex min-h-0 flex-1 flex-col ${full ? "sidebar-full" : ""}`}>
      <div className="nav-text px-4 pt-4"><AccountSwitcher /></div>
      <nav aria-label="Hauptnavigation" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 py-4 [&>*]:flex-none">
        {MAIN_NAV.map((item) => (
          <div key={item.href}>
            <div className="relative">
              <NavLink item={item} path={path} badge={badges[item.href]} onClick={onNavigate} />
              {item.href === "/accounts" && accounts.length > 0 && (
                <button type="button" className="nav-text icon-btn absolute right-1 top-1 !size-8" aria-expanded={openAccounts} aria-label="Accounts auf- oder zuklappen" onClick={() => setOpenAccounts((o) => !o)}>
                  <ChevronDown size={16} className={`transition-transform duration-200 ${openAccounts ? "rotate-180" : ""}`} />
                </button>
              )}
            </div>
            {item.href === "/accounts" && openAccounts && accounts.length > 0 && (
              <ul className="nav-text mt-1 flex flex-col gap-0.5">
                {accounts.map((a) => (
                  <li key={a.id}>
                    <Link href={`/account?id=${a.id}`} onClick={onNavigate} className={`flex h-9 items-center gap-2.5 rounded-[10px] pl-[44px] pr-3 hover:bg-hover hover:text-ink ${a.active ? "text-ink-2" : "text-ink-3"}`}>
                      <AccountDot id={a.id} />
                      <span className="truncate">{a.name}</span>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/account" onClick={onNavigate} className="flex h-9 items-center gap-2 rounded-[10px] pl-[40px] pr-3 text-primary-700 hover:bg-hover">
                    <Plus size={16} /> Neuer Account
                  </Link>
                </li>
              </ul>
            )}
          </div>
        ))}
        <div className="my-3 border-t border-line" />
        <div className="nav-text overline px-3 pb-1">Weitere</div>
        {OTHER_NAV.map((item) => <NavLink key={item.href} item={item} path={path} onClick={onNavigate} />)}
        <NavLink item={HELP} path={path} onClick={onNavigate} />
      </nav>
      <div className="flex flex-col gap-2 px-4 pb-5">
        <SystemLine />
        <div className="nav-text overline px-3 pt-2">Darstellung</div>
        <div className="nav-text px-1"><ThemeToggle /></div>
      </div>
    </div>
  )
}

type Notice = { key: string; tone: "danger" | "warning" | "success"; text: string; time: string | null; href: string }

function useNotices(): Notice[] {
  const { accounts, allPosts } = useData()
  return useMemo(() => {
    const out: Notice[] = []
    for (const a of accounts) {
      const issue = accountIssue(a, [])
      if (issue.tone === "warning") out.push({ key: `a${a.id}`, tone: "warning", text: `${a.name}: ${issue.label}`, time: null, href: `/account?id=${a.id}` })
    }
    for (const p of allPosts) {
      if (out.length >= 10) break
      if (Date.now() - new Date(p.updated_at).getTime() > 2 * DAY) continue
      if (p.status === "failed") out.push({ key: `p${p.id}`, tone: "danger", text: `Fehler bei ${p.account_name}: ${p.error ?? p.title}`, time: p.updated_at, href: "/logs" })
      else if (p.status === "published") out.push({ key: `p${p.id}`, tone: "success", text: `Reel gepostet auf ${p.account_name}`, time: p.updated_at, href: "/queue" })
    }
    return out
  }, [accounts, allPosts])
}

function BellButton() {
  const notices = useNotices()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState("")
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismiss(open, close)
  useEffect(() => setSeen(localStorage.getItem("bell-seen") ?? ""), [])
  const signature = notices.map((n) => n.key).join(",")
  const unread = notices.length > 0 && signature !== seen
  const toggle = () => {
    setOpen((o) => !o)
    localStorage.setItem("bell-seen", signature)
    setSeen(signature)
  }
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="icon-btn relative" aria-label={unread ? "Benachrichtigungen, neue Meldungen" : "Benachrichtigungen"} aria-expanded={open} onClick={toggle}>
        <Bell size={20} strokeWidth={1.5} />
        {unread && <span className="absolute right-2 top-1.5 size-2 rounded-full bg-warning ring-2 ring-surface" aria-hidden="true" />}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-[min(360px,calc(100vw-32px))] rounded-[10px] border border-line bg-surface shadow-lg">
          <div className="card-title border-b border-line px-4 py-3">Benachrichtigungen</div>
          {notices.length === 0 ? (
            <p className="px-4 py-6 text-center text-ink-3">Nichts Neues.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {notices.map((n) => (
                <li key={n.key}>
                  <Link href={n.href} onClick={close} className="flex items-start gap-3 px-4 py-2.5 hover:bg-hover">
                    <span className={`mt-1.5 size-2 flex-none rounded-full bg-${n.tone}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-ink">{n.text}</span>
                      {n.time && <span className="caption">{relTime(n.time)}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/logs" onClick={close} className="block border-t border-line px-4 py-3 text-center font-medium text-primary-700 hover:bg-hover">Alle Logs ansehen</Link>
        </div>
      )}
    </div>
  )
}

function SearchBox({ autoFocus = false, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const { accounts, allPosts } = useData()
  const router = useRouter()
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismiss(open, close)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    const has = (t: string) => t.toLowerCase().includes(s)
    const subs = new Map<string, number>()
    for (const a of accounts) for (const src of a.sources ?? []) if (has(src.subreddit) && !subs.has(src.subreddit)) subs.set(src.subreddit, a.id)
    return [
      { title: "Accounts", items: accounts.filter((a) => has(a.name)).slice(0, 5).map((a) => ({ key: `a${a.id}`, label: a.name, href: `/account?id=${a.id}` })) },
      { title: "Subreddits", items: [...subs].slice(0, 5).map(([sub, id]) => ({ key: `s${sub}`, label: `r/${sub}`, href: `/account?id=${id}&tab=content` })) },
      { title: "Videos", items: allPosts.filter((p) => has(p.title) || has(p.reddit_id)).slice(0, 6).map((p) => ({ key: `p${p.id}`, label: p.title, href: `/queue?view=history&post=${p.id}` })) },
      { title: "Seiten", items: [...MAIN_NAV, ...OTHER_NAV].filter((n) => has(n.label)).map((n) => ({ key: n.href, label: n.label, href: n.href })) },
    ].filter((g) => g.items.length)
  }, [q, accounts, allPosts])
  const first = groups[0]?.items[0]
  const go = (href: string) => {
    router.push(href)
    setQ("")
    close()
    onDone?.()
  }

  return (
    <div className="relative w-full" ref={ref} role="search">
      <Search size={18} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
      <input
        ref={input}
        autoFocus={autoFocus}
        className="field !pl-10 !pr-14"
        placeholder="Suchen …"
        aria-label="Suchen in Videos, Subreddits und Accounts"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && first) go(first.href)
        }}
      />
      <kbd className="caption pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 py-0.5 lg:block">Strg K</kbd>
      {open && q.trim() && (
        <div className="absolute inset-x-0 top-12 z-40 max-h-96 overflow-y-auto rounded-[10px] border border-line bg-surface p-1 shadow-lg">
          {groups.length === 0 ? (
            <p className="px-3 py-5 text-center text-ink-3">Nichts gefunden zu „{q}“</p>
          ) : (
            groups.map((g) => (
              <div key={g.title}>
                <div className="overline px-3 pb-1 pt-2">{g.title}</div>
                {g.items.map((it) => (
                  <button key={it.key} type="button" className="flex h-9 w-full items-center rounded-lg px-3 text-left hover:bg-hover" onClick={() => go(it.href)}>
                    <span className="truncate text-ink">{it.label}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function FetchVideoButton() {
  const { account, reload } = useData()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const ok = !!account && (account.sources?.length ?? 0) > 0
  const run = async () => {
    if (!account) return
    setBusy(true)
    try {
      await api(`/accounts/${account.id}/preview`, { method: "POST" })
      toast(`Video für „${account.name}“ wird gesucht und gerendert. Das dauert ein paar Minuten.`)
      setTimeout(reload, 4000)
    } catch (e) {
      toast((e as Error).message, "error")
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" className="btn hidden xl:inline-flex" disabled={!ok || busy} onClick={run} title={ok ? "Vorschau für den gewählten Account rendern" : account ? "Der Account hat noch keine Subreddits" : "Erst links einen Account wählen"}>
      <Plus size={18} /> Video holen
    </button>
  )
}

function SystemChip() {
  const { system } = useData()
  if (!system) return null
  const hot = system.cpu > 85 ? "text-danger" : system.cpu > 60 ? "text-warning" : "text-ink-2"
  return (
    <Link href="/system" className={`tag tabular hidden min-[1400px]:inline-flex ${hot}`} title="Auslastung des Mini-PCs">
      CPU {Math.round(system.cpu)} % · RAM {Math.round(system.memory.percent)} %
    </Link>
  )
}

function AvatarMenu() {
  const { themeChoice, setTheme } = useData()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismiss(open, close)
  return (
    <div className="relative hidden md:block" ref={ref}>
      <button type="button" className="flex size-9 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700" aria-label="Menü" aria-expanded={open} onClick={() => setOpen((o) => !o)}>RM</button>
      {open && (
        <div role="menu" className="popover absolute right-0 top-11 z-40 w-56 p-1">
          <Link role="menuitem" href="/settings?tab=look" onClick={close} className="flex h-9 items-center rounded-lg px-3 hover:bg-hover">Darstellung</Link>
          <button role="menuitem" type="button" disabled={!themeChoice} className="flex h-9 w-full items-center rounded-lg px-3 text-left hover:bg-hover disabled:text-ink-3" onClick={() => { setTheme(null); close() }}>
            {themeChoice ? "Systemstandard verwenden" : "Theme folgt dem System"}
          </button>
          <a role="menuitem" href="/api/docs" target="_blank" rel="noopener noreferrer" className="flex h-9 items-center rounded-lg px-3 hover:bg-hover">API-Doku</a>
        </div>
      )}
    </div>
  )
}

function Topbar({ path, onMenu }: { path: string; onMenu: () => void }) {
  const [mobileSearch, setMobileSearch] = useState(false)
  const clean = path.replace(/\/$/, "") || "/"
  const title = TITLES[clean] ?? "Reels-Manager"
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="flex h-14 items-center gap-2 px-4 md:h-16 md:gap-3 md:px-6 xl:px-8">
        <button type="button" className="icon-btn hidden md:inline-flex lg:hidden" aria-label="Navigation öffnen" onClick={onMenu}><MenuIcon size={20} /></button>
        <div className="md:hidden"><AccountSwitcher compact /></div>
        {clean === "/account" && <Link href="/accounts" className="icon-btn hidden md:inline-flex" aria-label="Zurück zu Accounts"><ArrowLeft size={20} /></Link>}
        <h1 className="page-title min-w-0 flex-1 truncate text-center md:text-left">{title}</h1>
        <div className="hidden w-80 lg:block"><SearchBox /></div>
        <button type="button" className="icon-btn lg:hidden" aria-label="Suchen" aria-expanded={mobileSearch} onClick={() => setMobileSearch((s) => !s)}>
          {mobileSearch ? <X size={20} /> : <Search size={20} strokeWidth={1.5} />}
        </button>
        <FetchVideoButton />
        <SystemChip />
        <BellButton />
        <AvatarMenu />
      </div>
      {mobileSearch && <div className="border-t border-line p-3 lg:hidden"><SearchBox autoFocus onDone={() => setMobileSearch(false)} /></div>}
    </header>
  )
}

const TABS = [MAIN_NAV[0], MAIN_NAV[2], MAIN_NAV[3], MAIN_NAV[1]]

function BottomTabs({ path }: { path: string }) {
  const badges = useBadges()
  const [more, setMore] = useState(false)
  const rest = [...MAIN_NAV.slice(4), ...OTHER_NAV, HELP]
  const moreActive = rest.some((r) => isActive(r, path))
  useEffect(() => setMore(false), [path])
  return (
    <>
      {more && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Mehr">
          <button type="button" className="absolute inset-0 bg-[var(--overlay)]" aria-label="Schließen" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[16px] border-t border-line bg-surface p-4 pb-[calc(80px+env(safe-area-inset-bottom))] shadow-lg">
            <div className="flex flex-col gap-1">
              {rest.map((item) => <NavLink key={item.href} item={item} path={path} badge={badges[item.href]} onClick={() => setMore(false)} />)}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
              <span className="overline">Darstellung</span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
      <nav aria-label="Hauptnavigation" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map((item) => {
          const active = !more && isActive(item, path)
          const Icon = item.icon
          const b = badges[item.href]
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? "text-primary-700" : "text-ink-3"}`}>
              <span className="relative">
                <Icon size={22} strokeWidth={1.5} />
                {b && b.n > 0 && <span className={`badge absolute -right-3 -top-1.5 !h-4 !min-w-4 !px-1 !text-[10px] ${b.danger ? "danger" : ""}`}>{b.n > 9 ? "9+" : b.n}</span>}
              </span>
              {item.label}
            </Link>
          )
        })}
        <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${more || moreActive ? "text-primary-700" : "text-ink-3"}`}>
          <MenuIcon size={22} strokeWidth={1.5} />
          Mehr
        </button>
      </nav>
    </>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname()
  const { error, overview, reload } = useData()
  const [drawer, setDrawer] = useState(false)
  useEffect(() => setDrawer(false), [path])

  return (
    <div className="app-frame flex min-h-dvh bg-surface">
      <a href="#inhalt" className="btn btn-primary sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70]">Zum Inhalt springen</a>
      <aside className="sidebar sticky top-0 hidden h-dvh w-[72px] flex-none flex-col border-r border-line bg-surface md:flex lg:w-[248px]">
        <div className="flex h-16 flex-none items-center border-b border-line px-[22px] lg:px-6"><Logo /></div>
        <SidebarContent path={path} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 hidden md:block lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" className="absolute inset-0 bg-[var(--overlay)]" aria-label="Schließen" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[264px] flex-col border-r border-line bg-surface shadow-lg">
            <div className="flex h-16 flex-none items-center justify-between border-b border-line px-6">
              <span className="card-title">Reels-Manager</span>
              <button type="button" className="icon-btn" aria-label="Schließen" onClick={() => setDrawer(false)}><X size={20} /></button>
            </div>
            <SidebarContent path={path} onNavigate={() => setDrawer(false)} full />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar path={path} onMenu={() => setDrawer(true)} />
        {error && (
          <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-danger bg-danger-bg px-4 py-2.5 text-ink md:px-6 xl:px-8">
            <span className="flex-1">{overview ? "Keine Verbindung zum Reels-Manager. Die Daten sind nicht aktuell." : `Keine Verbindung zum Reels-Manager. Läuft der Container? (${error})`}</span>
            <button type="button" className="btn btn-sm" onClick={reload}>Erneut versuchen</button>
          </div>
        )}
        <main id="inhalt" className={`w-full max-w-[1440px] flex-1 p-4 pb-24 md:p-6 xl:p-8 ${error && overview ? "opacity-60" : ""}`}>{children}</main>
      </div>
      <BottomTabs path={path} />
    </div>
  )
}

import { CalendarDays, ChartLine, Cpu, LayoutDashboard, LifeBuoy, ListVideo, Rss, ScrollText, Settings, Users, type LucideIcon } from "lucide-react"

export type NavItem = { href: string; label: string; icon: LucideIcon; match?: string[] }

export const MAIN_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Users, match: ["/accounts", "/account"] },
  { href: "/queue", label: "Warteschlange", icon: ListVideo, match: ["/queue", "/posts"] },
  { href: "/calendar", label: "Kalender", icon: CalendarDays },
  { href: "/stats", label: "Statistiken", icon: ChartLine },
  { href: "/sources", label: "Quellen", icon: Rss },
  { href: "/logs", label: "Logs", icon: ScrollText },
]

export const OTHER_NAV: NavItem[] = [
  { href: "/settings", label: "Einstellungen", icon: Settings },
  { href: "/system", label: "System", icon: Cpu },
]

export const HELP: NavItem = { href: "/api/docs", label: "Hilfe & Doku", icon: LifeBuoy }

export function isActive(item: NavItem, path: string): boolean {
  const clean = path.replace(/\/$/, "") || "/"
  if (item.href === "/") return clean === "/"
  return (item.match ?? [item.href]).some((m) => clean === m || clean.startsWith(m + "/"))
}

export const TITLES: Record<string, string> = {
  "/": "Dashboard", "/accounts": "Accounts", "/account": "Account", "/queue": "Warteschlange", "/posts": "Verlauf",
  "/calendar": "Kalender", "/stats": "Statistiken", "/sources": "Quellen", "/logs": "Logs", "/settings": "Einstellungen",
  "/system": "System",
}

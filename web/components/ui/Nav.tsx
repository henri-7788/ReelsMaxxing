"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { GlassSurface } from "@/components/glass"

const LINKS = [
  { href: "/", label: "Übersicht" },
  { href: "/posts", label: "Verlauf" },
]

export function Nav() {
  const path = usePathname()
  return (
    <div className="sticky top-4 z-50 flex justify-center px-4 pt-4">
      <GlassSurface variant="pill" padding="6px 8px">
        <nav aria-label="Hauptnavigation" className="flex items-center gap-1 text-sm font-medium">
          <Link href="/" className="mr-1 flex items-center gap-2 rounded-full px-3 py-1.5 font-semibold">
            <svg viewBox="0 0 64 64" className="size-5" aria-hidden="true">
              <rect x="4" y="4" width="56" height="56" rx="16" fill="#ff4f8b" />
              <path d="M26 21v22l18-11z" fill="#fff" />
            </svg>
            <span className="hidden sm:inline">Reels-Manager</span>
          </Link>
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 transition-colors ${active ? "bg-white/20" : "hover:bg-white/10"}`}
              >
                {l.label}
              </Link>
            )
          })}
          <Link
            href="/account"
            className={`rounded-full px-3 py-1.5 transition-colors ${path.startsWith("/account") ? "bg-white/20" : "hover:bg-white/10"}`}
          >
            + Account
          </Link>
        </nav>
      </GlassSurface>
    </div>
  )
}

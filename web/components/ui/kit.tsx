"use client"

import { MoreHorizontal, TriangleAlert, type LucideIcon } from "lucide-react"
import { useCallback, useState, type KeyboardEvent, type ReactNode } from "react"
import { accountColor, displayStatus, STATUS_LABEL, type Account, type Post } from "@/lib/api"
import { useDismiss } from "@/lib/data"

export function Card({ children, className = "", pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <section className={`card flex flex-col ${pad ? "card-pad" : ""} ${className}`}>{children}</section>
}

export type MenuItem = { label: string; onSelect?: () => void; href?: string; danger?: boolean }

export function Menu({ items, label = "Weitere Aktionen" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismiss(open, close)
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="icon-btn !size-8" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div role="menu" className="popover absolute right-0 top-9 z-30 min-w-48 p-1">
          {items.map((it) =>
            it.href ? (
              <a key={it.label} role="menuitem" href={it.href} target="_blank" rel="noopener noreferrer" className="flex h-9 items-center rounded-lg px-3 hover:bg-hover" onClick={close}>
                {it.label}
              </a>
            ) : (
              <button
                key={it.label}
                role="menuitem"
                type="button"
                className={`flex h-9 w-full items-center rounded-lg px-3 text-left hover:bg-hover ${it.danger ? "text-danger" : ""}`}
                onClick={() => {
                  close()
                  it.onSelect?.()
                }}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

export function CardHeader({ title, children, menu, sub }: { title: string; children?: ReactNode; menu?: MenuItem[]; sub?: ReactNode }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="card-title">{title}</h2>
        {sub && <p className="caption mt-0.5">{sub}</p>}
      </div>
      <div className="flex flex-none items-center gap-2">
        {children}
        {menu && menu.length > 0 && <Menu items={menu} />}
      </div>
    </header>
  )
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  const onKey = (e: KeyboardEvent) => {
    const i = options.findIndex((o) => o.value === value)
    if (e.key === "ArrowRight" || e.key === "ArrowDown") onChange(options[(i + 1) % options.length].value)
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") onChange(options[(i - 1 + options.length) % options.length].value)
    else return
    e.preventDefault()
  }
  return (
    <div className="seg" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary-50 text-primary-600"><Icon size={20} /></span>
      <h3 className="card-title">{title}</h3>
      {text && <p className="max-w-sm text-ink-2">{text}</p>}
      {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message?: string | null; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <TriangleAlert size={24} className="text-danger" />
      <h3 className="card-title">Konnte nicht geladen werden</h3>
      {message && <p className="caption">{message}</p>}
      {onRetry && <button type="button" className="btn btn-sm mt-2" onClick={onRetry}>Erneut versuchen</button>}
    </div>
  )
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Lädt">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-11" />)}
    </div>
  )
}

export function StatusPill({ post, status }: { post?: Post; status?: string }) {
  const s = post ? displayStatus(post) : status ?? ""
  const extra = s === "rendering" || s === "publishing" ? "pulse" : s === "scheduled" ? "hollow" : ""
  return <span className={`status s-${s} ${extra}`}>{STATUS_LABEL[s] ?? s}</span>
}

export function TonePill({ tone, children }: { tone: "success" | "warning" | "danger" | "muted"; children: ReactNode }) {
  return <span className={`status s-${tone}`}>{children}</span>
}

export function Switch({ checked, onChange, children, label }: { checked: boolean; onChange: (v: boolean) => void; children?: ReactNode; label?: string }) {
  return (
    <label className="switch" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="track" aria-hidden="true" />
      {children && <span>{children}</span>}
    </label>
  )
}

export function AccountAvatar({ account, size = 32 }: { account: Pick<Account, "id" | "name"> | null; size?: number }) {
  const color = account ? accountColor(account.id) : "var(--primary-600)"
  return (
    <span
      className="flex flex-none items-center justify-center rounded-full bg-surface font-semibold text-ink"
      style={{ width: size, height: size, boxShadow: `inset 0 0 0 2px ${color}`, fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >
      {account ? account.name.trim().charAt(0).toUpperCase() || "?" : "∑"}
    </span>
  )
}

export function AccountDot({ id }: { id: number }) {
  return <span className="inline-block size-2 flex-none rounded-full" style={{ background: accountColor(id) }} aria-hidden="true" />
}

export function Banner({ tone, children }: { tone: "warning" | "danger"; children: ReactNode }) {
  return (
    <div role="status" className={`flex items-start gap-3 rounded-[10px] border px-4 py-3 text-ink ${tone === "danger" ? "border-danger bg-danger-bg" : "border-warning bg-warning-bg"}`}>
      <TriangleAlert size={18} className={`mt-px flex-none ${tone === "danger" ? "text-danger" : "text-warning"}`} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

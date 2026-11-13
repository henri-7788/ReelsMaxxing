"use client"

import { Check, ChevronsUpDown, Plus, Search } from "lucide-react"
import Link from "next/link"
import { useCallback, useState } from "react"
import { AccountAvatar } from "@/components/ui/kit"
import { accountIssue, formatSlot } from "@/lib/api"
import { useData, useDismiss } from "@/lib/data"

/** Filters the whole UI to one account or "Alle Accounts" (UIDesign.md 6.2). */
export function AccountSwitcher({ compact = false }: { compact?: boolean }) {
  const { accounts, account, setAccountId, allPosts } = useData()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const close = useCallback(() => setOpen(false), [])
  const ref = useDismiss(open, close)
  const active = accounts.filter((a) => a.active).length
  const list = accounts.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()))
  const pick = (id: number | null) => {
    setAccountId(id)
    close()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Account wechseln"
        onClick={() => setOpen((o) => !o)}
        className={compact
          ? "flex h-10 max-w-44 items-center gap-2 rounded-[10px] pl-1 pr-2 hover:bg-hover"
          : "flex h-14 w-full items-center gap-3 rounded-[10px] border border-line bg-surface-2 px-3 text-left hover:border-line-strong"}
      >
        <AccountAvatar account={account} size={compact ? 28 : 32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-ink">{account ? account.name : "Alle Accounts"}</span>
          {!compact && (
            <span className="caption block truncate">
              {account ? (account.active ? `Nächster: ${formatSlot(account.next_slot)}` : "pausiert") : `${accounts.length} Accounts · ${active} aktiv`}
            </span>
          )}
        </span>
        <ChevronsUpDown size={16} className="flex-none text-ink-3" />
      </button>

      {open && (
        <div className={`absolute z-40 mt-2 w-72 rounded-[10px] border border-line bg-surface p-1 shadow-lg ${compact ? "left-0" : "left-0 right-0 w-auto"}`}>
          {accounts.length >= 6 && (
            <div className="relative p-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <input className="field !min-h-9 !py-1.5 !pl-8" placeholder="Account suchen" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            </div>
          )}
          <ul role="listbox" aria-label="Accounts" className="max-h-72 overflow-y-auto">
            <li>
              <button type="button" role="option" aria-selected={!account} className="flex h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-hover" onClick={() => pick(null)}>
                <AccountAvatar account={null} size={28} />
                <span className="flex-1 font-medium text-ink">Alle Accounts</span>
                {!account && <Check size={16} className="text-primary-600" />}
              </button>
            </li>
            {list.map((a) => {
              const issue = accountIssue(a, allPosts)
              return (
                <li key={a.id}>
                  <button type="button" role="option" aria-selected={account?.id === a.id} className="flex h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-hover" onClick={() => pick(a.id)}>
                    <AccountAvatar account={a} size={28} />
                    <span className={`min-w-0 flex-1 truncate font-medium ${a.active ? "text-ink" : "text-ink-3"}`}>{a.name}</span>
                    {issue.tone !== "success" ? <span className={`status s-${issue.tone}`}>{issue.label}</span> : <span className="caption tabular">{a.next_slot?.split(" ")[1]}</span>}
                    {account?.id === a.id && <Check size={16} className="flex-none text-primary-600" />}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-1 border-t border-line pt-1">
            <Link href="/account" onClick={close} className="flex h-9 items-center gap-2 rounded-lg px-3 font-medium text-primary-700 hover:bg-hover"><Plus size={16} /> Neuer Account</Link>
            <Link href="/accounts" onClick={close} className="flex h-9 items-center rounded-lg px-3 hover:bg-hover">Accounts verwalten</Link>
          </div>
        </div>
      )}
    </div>
  )
}

"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

/** Native <dialog>: focus trap, Esc and aria-modal come for free. */
export function ConfirmDialog({
  open, title, children, confirmLabel, onConfirm, onClose, busy, typeToConfirm,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
  busy?: boolean
  /** The user has to type this text before the action is enabled */
  typeToConfirm?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [typed, setTyped] = useState("")
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setTyped("")
      d.showModal()
    }
    if (!open && d.open) d.close()
  }, [open])
  const locked = !!typeToConfirm && typed.trim() !== typeToConfirm

  return (
    <dialog ref={ref} className="modal m-auto" aria-labelledby="dlg-title" onClose={onClose}>
      {open && (
        <div className="flex flex-col gap-4">
          <h2 id="dlg-title" className="card-title">{title}</h2>
          <div className="text-ink-2">{children}</div>
          {typeToConfirm && (
            <label className="label">
              <span>Zum Bestätigen <b className="text-ink">{typeToConfirm}</b> eintippen</span>
              <input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </label>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn" onClick={onClose} autoFocus={!typeToConfirm}>Abbrechen</button>
            <button type="button" className="btn btn-danger-solid" onClick={onConfirm} disabled={busy || locked}>
              {busy ? "…" : confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}

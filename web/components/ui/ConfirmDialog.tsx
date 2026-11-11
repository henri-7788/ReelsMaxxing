"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { GlassSurface } from "@/components/glass"

/** Native <dialog> (focus trap, Esc, aria-modal for free) with a liquid glass body. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  busy,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
  busy?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog ref={ref} className="glass-dialog m-auto" aria-labelledby="dlg-title" onClose={onClose}>
      {open && (
        <GlassSurface variant="modal" padding="28px">
          <div className="flex max-w-sm flex-col gap-4">
            <h2 id="dlg-title" className="text-xl font-semibold">{title}</h2>
            <div className="text-sm text-muted">{children}</div>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={onClose} autoFocus>Abbrechen</button>
              <button type="button" className="btn-ghost btn-danger !bg-[#ff5a5a]/25" onClick={onConfirm} disabled={busy}>
                {busy ? "…" : confirmLabel}
              </button>
            </div>
          </div>
        </GlassSurface>
      )}
    </dialog>
  )
}

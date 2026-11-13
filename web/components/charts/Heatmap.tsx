"use client"

import { useMemo, useRef, useState, type KeyboardEvent } from "react"
import { fmt } from "@/lib/api"
import { useIsMobile } from "@/lib/data"

const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
const DAYS_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]
const LEVELS = ["var(--primary-50)", "var(--primary-200)", "var(--primary-400)", "var(--primary-600)"]

/**
 * Weekday × hour, one hue in four steps like the template ("User by time of day").
 * `slots` marks the hours in which the selected account has a fixed posting time.
 */
export function Heatmap({ data, slots = [], unit = "Reels", asTable = false }: { data: number[][]; slots?: number[]; unit?: string; asTable?: boolean }) {
  const mobile = useIsMobile("(max-width: 639px)")
  const [detail, setDetail] = useState(false)
  const [tip, setTip] = useState<{ d: number; c: number; x: number; y: number } | null>(null)
  const [focus, setFocus] = useState<[number, number]>([0, 0])
  const wrap = useRef<HTMLDivElement>(null)
  const blocks = mobile && !detail
  const span = blocks ? 4 : 1
  const cols = 24 / span

  const grid = useMemo(() => data.map((row) => Array.from({ length: cols }, (_, c) => row.slice(c * span, c * span + span).reduce((a, b) => a + b, 0))), [data, cols, span])
  const max = Math.max(0, ...grid.flat())
  const level = (v: number) => (v <= 0 || max === 0 ? 0 : Math.min(3, Math.ceil((v / max) * 3)))
  const bounds = max === 0 ? [0, 0, 0, 0] : [0, Math.ceil(max / 3), Math.ceil((2 * max) / 3), max]
  const hasSlot = (c: number) => slots.some((h) => h >= c * span && h < c * span + span)
  const hourLabel = (c: number) => (span === 1 ? `${String(c).padStart(2, "0")}:00` : `${String(c * span).padStart(2, "0")}–${String(c * span + span).padStart(2, "0")} Uhr`)

  if (asTable) {
    return (
      <div className="max-h-72 overflow-auto rounded-[10px] border border-line">
        <table className="data-table">
          <thead><tr><th>Tag</th>{Array.from({ length: 24 }, (_, h) => <th key={h} className="num !px-2">{h}</th>)}</tr></thead>
          <tbody>{data.map((row, d) => <tr key={d}><td className="font-medium">{DAYS[d]}</td>{row.map((v, h) => <td key={h} className="num !px-2">{v || "·"}</td>)}</tr>)}</tbody>
        </table>
      </div>
    )
  }

  const show = (d: number, c: number, el: HTMLElement) => {
    const w = wrap.current?.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    if (w) setTip({ d, c, x: r.left - w.left + r.width / 2, y: r.top - w.top })
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const [d, c] = focus
    const next: [number, number] =
      e.key === "ArrowRight" ? [d, Math.min(cols - 1, c + 1)] : e.key === "ArrowLeft" ? [d, Math.max(0, c - 1)]
      : e.key === "ArrowDown" ? [Math.min(6, d + 1), c] : e.key === "ArrowUp" ? [Math.max(0, d - 1), c] : [d, c]
    if (next[0] === d && next[1] === c) return
    e.preventDefault()
    setFocus(next)
    wrap.current?.querySelector<HTMLElement>(`[data-cell="${next[0]}-${next[1]}"]`)?.focus()
  }

  return (
    <div className="flex flex-1 flex-col">
      <div ref={wrap} className="relative" onMouseLeave={() => setTip(null)}>
        <div role="grid" aria-label={`${unit} nach Wochentag und Uhrzeit`} onKeyDown={onKey} className={mobile && detail ? "overflow-x-auto pb-1" : ""}>
          <div style={{ minWidth: mobile && detail ? 640 : undefined }}>
            {grid.map((row, d) => (
              <div role="row" key={d} className="mb-[3px] flex items-center gap-[3px]">
                <span role="rowheader" className="caption sticky left-0 w-7 flex-none bg-surface" aria-label={DAYS_LONG[d]}>{DAYS[d]}</span>
                {row.map((v, c) => (
                  <div
                    key={c}
                    role="gridcell"
                    data-cell={`${d}-${c}`}
                    tabIndex={focus[0] === d && focus[1] === c ? 0 : -1}
                    aria-label={`${DAYS_LONG[d]} ${hourLabel(c)}: ${fmt(v)} ${unit}${hasSlot(c) ? ", eigener Posting-Slot" : ""}`}
                    className="h-[22px] min-w-0 flex-1 rounded-[6px] outline-none transition-shadow focus-visible:shadow-[var(--ring)] sm:h-[20px] xl:h-[22px]"
                    style={{ background: LEVELS[level(v)], boxShadow: hasSlot(c) ? "inset 0 0 0 2px var(--text)" : undefined }}
                    onMouseEnter={(e) => show(d, c, e.currentTarget)}
                    onFocus={(e) => {
                      setFocus([d, c])
                      show(d, c, e.currentTarget)
                    }}
                    onBlur={() => setTip(null)}
                  />
                ))}
              </div>
            ))}
            <div className="mt-1.5 flex gap-[3px] pl-[31px]" aria-hidden="true">
              {Array.from({ length: cols }, (_, c) => (
                <span key={c} className="caption min-w-0 flex-1 text-center tabular">{span === 1 ? (c % 2 === 0 ? c : "") : `${c * span}–${c * span + span}`}</span>
              ))}
            </div>
          </div>
        </div>
        {tip && (
          <div className="popover pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap px-2.5 py-1.5" style={{ left: tip.x, top: tip.y - 6 }}>
            <div className="text-xs font-medium text-ink">{DAYS[tip.d]} {hourLabel(tip.c)}</div>
            <div className="caption"><b className="font-semibold text-primary-700">{fmt(grid[tip.d][tip.c])}</b> {unit}{hasSlot(tip.c) ? " · eigener Slot" : ""}</div>
          </div>
        )}
      </div>

      <div className="mt-auto pt-5">
        <div className="flex gap-0 overflow-hidden rounded-full" aria-hidden="true">
          {LEVELS.map((c) => <span key={c} className="h-1.5 flex-1" style={{ background: c }} />)}
        </div>
        <div className="caption mt-1.5 flex justify-between tabular" aria-hidden="true">
          {bounds.map((b, i) => <span key={i} className="font-medium text-ink-2">{fmt(b)}</span>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="caption flex items-center gap-2">
            {slots.length > 0 && <><span className="inline-block size-3 rounded-[4px]" style={{ boxShadow: "inset 0 0 0 2px var(--text)" }} /> eigener Posting-Slot</>}
          </span>
          {mobile && <button type="button" className="btn btn-sm" onClick={() => setDetail((x) => !x)}>{detail ? "Kompakt" : "Detail"}</button>}
        </div>
      </div>
    </div>
  )
}

"use client"

import { useEffect, useId, useRef, useState } from "react"
import { fmt } from "@/lib/api"

export type Point = { label: string; tip?: string; value: number; value2?: number }

function niceMax(v: number): number {
  if (v <= 4) return 4
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 2, 4, 5, 8, 10]) if (v <= m * pow) return m * pow
  return 10 * pow
}

/**
 * Line with a soft area fill and a hover band + tooltip, like "Active Users" in the template.
 * One y-axis. An optional second series (same unit) is drawn as a plain line and gets a legend.
 */
export function AreaChart({
  points, unit, height = 260, max, suffix = "", series = ["", ""],
}: { points: Point[]; unit: string; height?: number; max?: number; suffix?: string; series?: [string, string] }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)
  const id = useId()
  const two = points.some((p) => p.value2 != null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const padL = 40, padR = 12, padT = 12, padB = 28
  const w = Math.max(0, width - padL - padR), h = height - padT - padB
  const top = max ?? niceMax(Math.max(1, ...points.map((p) => Math.max(p.value, p.value2 ?? 0))))
  const n = points.length
  const x = (i: number) => padL + (n <= 1 ? w / 2 : (i / (n - 1)) * w)
  const y = (v: number) => padT + h - (Math.min(v, top) / top) * h
  const line = (key: "value" | "value2") => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key] ?? 0).toFixed(1)}`).join(" ")
  const area = n ? `${line("value")} L${x(n - 1).toFixed(1)},${padT + h} L${x(0).toFixed(1)},${padT + h} Z` : ""
  const ticks = [0, 1, 2, 3, 4].map((i) => (top / 4) * i)
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 72))))
  const band = n > 1 ? Math.max(14, Math.min(40, w / (n - 1))) : 40
  const short = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })}k` : fmt(Math.round(v * 10) / 10))

  const onMove = (clientX: number) => {
    const r = wrap.current?.getBoundingClientRect()
    if (!r || n === 0) return
    const rel = (clientX - r.left - padL) / Math.max(1, w)
    setHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))))
  }
  const hp = hover != null ? points[hover] : null
  const tipLeft = hover != null ? Math.max(70, Math.min(width - 70, x(hover))) : 0

  return (
    <div>
      {two && (
        <div className="caption mb-2 flex gap-4">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-primary-600" /> {series[0]}</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-sky-400" /> {series[1]}</span>
        </div>
      )}
      <div
        ref={wrap}
        className="relative touch-pan-y select-none"
        style={{ height }}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => onMove(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        tabIndex={0}
        role="img"
        aria-label={`${unit} im Zeitverlauf, ${n} Werte, höchster Wert ${fmt(Math.max(0, ...points.map((p) => p.value)))}${suffix}`}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setHover((v) => Math.min(n - 1, (v ?? -1) + 1))
          else if (e.key === "ArrowLeft") setHover((v) => Math.max(0, (v ?? n) - 1))
          else if (e.key === "Escape") setHover(null)
        }}
        onBlur={() => setHover(null)}
      >
        {width > 0 && (
          <svg width={width} height={height} aria-hidden="true">
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--primary-600)" stopOpacity="0.18" />
                <stop offset="1" stopColor="var(--primary-600)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeDasharray={t === 0 ? undefined : "4 4"} />
                <text x={padL - 10} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-3)">{short(t)}{suffix}</text>
              </g>
            ))}
            {hover != null && <rect x={x(hover) - band / 2} y={padT} width={band} height={h} rx="4" fill="var(--primary-100)" />}
            {n > 0 && !two && <path d={area} fill={`url(#${id})`} />}
            {n > 0 && two && <path d={line("value2")} fill="none" stroke="var(--sky-400)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
            {n > 0 && <path d={line("value")} fill="none" stroke="var(--primary-600)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
            {n === 1 && <circle cx={x(0)} cy={y(points[0].value)} r="4" fill="var(--primary-600)" />}
            {points.map((p, i) => (i % every === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= every) ? (
              <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="11" fill="var(--text-3)">{p.label}</text>
            ) : null)}
            {hp && hover != null && (
              <>
                {two && <circle cx={x(hover)} cy={y(hp.value2 ?? 0)} r="4" fill="var(--surface)" stroke="var(--sky-400)" strokeWidth="2" />}
                <circle cx={x(hover)} cy={y(hp.value)} r="4" fill="var(--surface)" stroke="var(--primary-600)" strokeWidth="2" />
              </>
            )}
          </svg>
        )}
        {hp && hover != null && (
          <div className="popover pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap px-3 py-2" style={{ left: tipLeft, top: Math.max(52, y(Math.max(hp.value, hp.value2 ?? 0)) - 10) }}>
            <div className="text-xs font-medium text-ink">{hp.tip ?? hp.label}</div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-sm font-semibold text-primary-700 tabular">{fmt(Math.round(hp.value * 10) / 10)}{suffix}</span>
              <span className="caption">{two ? series[0] : unit}</span>
            </div>
            {two && (
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-semibold text-ink tabular">{fmt(Math.round((hp.value2 ?? 0) * 10) / 10)}{suffix}</span>
                <span className="caption">{series[1]}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

import type { ReactNode } from "react"

export type Segment = { value: number; color: string; label?: string }

/**
 * Thick ring with rounded ends and gaps between segments, tinted inner circle (template: "Sessions by device").
 * With `total` set, the segments fill only their share and the rest stays as a track.
 */
export function RingGauge({ segments, total, size = 200, children, label }: { segments: Segment[]; total?: number; size?: number; children: ReactNode; label: string }) {
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const visible = segments.filter((s) => s.value > 0)
  const raw = total ?? visible.reduce((a, s) => a + s.value, 0)
  const gap = visible.length > 1 ? stroke + 6 : 0
  // Without a fixed total, tiny segments get a minimum share so they stay visible next to the gaps
  const minShare = total == null && visible.length > 1 ? 0.07 : 0
  const shares = visible.map((s) => Math.max(minShare, raw ? s.value / raw : 0))
  const norm = total == null ? shares.reduce((a, b) => a + b, 0) || 1 : 1
  let offset = 0
  return (
    <div className="relative mx-auto flex-none" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        {raw > 0 && visible.map((s, i) => {
          const full = (shares[i] / norm) * c
          const len = Math.max(0.01, full - gap)
          const el = (
            <circle
              key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-(offset + gap / 2)}
            />
          )
          offset += full
          return el
        })}
      </svg>
      <div className="absolute flex flex-col items-center justify-center rounded-full bg-primary-50 text-center" style={{ inset: stroke + 12 }}>
        {children}
      </div>
    </div>
  )
}

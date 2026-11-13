import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Skeleton } from "@/components/ui/kit"

export type Kpi = {
  label: string
  value: ReactNode
  icon: LucideIcon
  /** Change vs. the previous period in percent; null = no comparison possible */
  delta?: number | null
  /** For numbers where a decrease is good (error rate) */
  lowerIsBetter?: boolean
  note?: string
}

/** Four cells in a 2×2 grid with a cross of dividers, like the template. `row` puts them in one line on desktop. */
export function KpiCard({ items, loading, row = false }: { items: Kpi[]; loading?: boolean; row?: boolean }) {
  return (
    <section className={`card relative grid grid-cols-2 ${row ? "lg:grid-cols-4" : ""}`} aria-label="Kennzahlen">
      {/* Cross of dividers that stops 20 px before the card edge, like the template */}
      <span aria-hidden="true" className="absolute inset-y-5 left-1/2 w-px bg-line" />
      <span aria-hidden="true" className={`absolute inset-x-5 top-1/2 h-px bg-line ${row ? "lg:hidden" : ""}`} />
      {row && <><span aria-hidden="true" className="absolute inset-y-5 left-1/4 hidden w-px bg-line lg:block" /><span aria-hidden="true" className="absolute inset-y-5 left-3/4 hidden w-px bg-line lg:block" /></>}
      {items.map((k) => {
        const Icon = k.icon
        const up = (k.delta ?? 0) >= 0
        const good = k.lowerIsBetter ? !up : up
        const Trend = up ? TrendingUp : TrendingDown
        return (
          <div key={k.label} className="flex flex-col p-4 md:p-6">
            <div className="contents">
              <span className="mb-3 flex size-9 items-center justify-center rounded-full border border-line text-primary-600"><Icon size={18} strokeWidth={1.5} /></span>
              <span className="text-[13px] font-medium leading-[18px] text-label">{k.label}</span>
              {loading ? <Skeleton className="mt-2 h-8 w-3/5" /> : <span className="kpi mt-1">{k.value}</span>}
              {loading ? (
                <Skeleton className="mt-2 h-3 w-2/5" />
              ) : k.delta != null && Math.abs(k.delta) >= 0.05 ? (
                <span className="caption mt-1 flex flex-wrap items-center gap-x-1">
                  <Trend size={14} className={good ? "text-success" : "text-danger"} aria-hidden="true" />
                  <span className={`font-medium tabular ${good ? "text-success" : "text-danger"}`}>
                    {up ? "+" : "−"}{Math.abs(k.delta).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %
                  </span>
                  <span className="hidden sm:inline">ggü. Vorwoche</span>
                </span>
              ) : (
                <span className="caption mt-1">{k.delta != null ? "unverändert ggü. Vorwoche" : k.note ?? "noch kein Vergleich"}</span>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}

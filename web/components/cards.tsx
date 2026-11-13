"use client"

import { ChevronRight, Cpu, Film, HardDrive, MemoryStick, ChartLine, Clock, Thermometer, Zap } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { AreaChart, type Point } from "@/components/charts/AreaChart"
import { Heatmap } from "@/components/charts/Heatmap"
import { RingGauge } from "@/components/charts/RingGauge"
import { Card, CardHeader, EmptyState, ErrorState, Segmented, Skeleton } from "@/components/ui/kit"
import { fmtBytes, parseTimes, relTime, type Account, type Stats, type SystemInfo } from "@/lib/api"
import { useApi } from "@/lib/data"

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
type Range = "week" | "month" | "year"
type Metric = "published" | "failed"
const RANGE_DAYS: Record<Range, number> = { week: 7, month: 30, year: 365 }

export function statsPath(accountId: number | null, days: number) {
  return `/stats?days=${days}${accountId ? `&account_id=${accountId}` : ""}`
}

function toPoints(stats: Stats, range: Range, metric: Metric): Point[] {
  if (range !== "year") {
    return stats.daily.map((d) => {
      const [y, m, day] = d.date.split("-").map(Number)
      return { label: `${day}. ${MONTHS[m - 1]}`, tip: `${day}. ${MONTHS[m - 1]} ${y}`, value: d[metric] }
    })
  }
  const byMonth = new Map<string, number>()
  for (const d of stats.daily) byMonth.set(d.date.slice(0, 7), (byMonth.get(d.date.slice(0, 7)) ?? 0) + d[metric])
  return [...byMonth].map(([k, v]) => {
    const [y, m] = k.split("-").map(Number)
    return { label: `${MONTHS[m - 1]} ${String(y).slice(2)}`, tip: `${MONTHS[m - 1]} ${y}`, value: v }
  })
}

/** Template: "Active Users". Without Instagram insights it shows published reels per day (UIDesign.md 6.5). */
export function PerformanceCard({ accountId, className = "", footerLink = true, height }: { accountId: number | null; className?: string; footerLink?: boolean; height?: number }) {
  const [range, setRange] = useState<Range>("month")
  const [metric, setMetric] = useState<Metric>("published")
  const [table, setTable] = useState(false)
  const { data, error, loading, reload } = useApi<Stats>(statsPath(accountId, RANGE_DAYS[range]), 60_000)
  const points = useMemo(() => (data ? toPoints(data, range, metric) : []), [data, range, metric])
  const total = points.reduce((a, p) => a + p.value, 0)
  const unit = metric === "published" ? "gepostete Reels" : "Fehler"

  return (
    <Card className={className} pad={false}>
      <div className="card-pad flex flex-1 flex-col !pb-4">
        <CardHeader title="Reels-Performance" sub={data ? `${total} ${unit} im Zeitraum` : undefined} menu={[{ label: table ? "Als Diagramm anzeigen" : "Als Tabelle anzeigen", onSelect: () => setTable((t) => !t) }]}>
          <select className="field !min-h-8 !w-auto !py-1 !pl-2.5 text-[13px]" aria-label="Kennzahl" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
            <option value="published">Gepostete Reels</option>
            <option value="failed">Fehler</option>
          </select>
        </CardHeader>
        {error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <Skeleton className="h-[260px]" />
        ) : total === 0 ? (
          <EmptyState icon={ChartLine} title="Noch zu wenig Daten" text="Sobald Reels gepostet werden, erscheint hier der Verlauf." />
        ) : table ? (
          <div className="max-h-[260px] overflow-auto rounded-[10px] border border-line">
            <table className="data-table">
              <thead><tr><th>Zeitraum</th><th className="num">{unit}</th></tr></thead>
              <tbody>{[...points].reverse().map((p) => <tr key={p.tip}><td>{p.tip}</td><td className="num">{p.value}</td></tr>)}</tbody>
            </table>
          </div>
        ) : (
          <AreaChart points={points} unit={unit} height={height} />
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-4 md:px-6">
        <Segmented<Range> label="Zeitraum" value={range} onChange={setRange} options={[{ value: "week", label: "Woche" }, { value: "month", label: "Monat" }, { value: "year", label: "Jahr" }]} />
        {footerLink && <Link href="/stats" className="btn">Statistiken öffnen <ChevronRight size={16} /></Link>}
      </footer>
    </Card>
  )
}

/** Template: "User by time of day", reused for the best posting times (UIDesign.md 6.4). */
export function PostingTimesCard({ accountId, account, className = "" }: { accountId: number | null; account: Account | null; className?: string }) {
  const [table, setTable] = useState(false)
  const { data, error, loading, reload } = useApi<Stats>(statsPath(accountId, 30), 60_000)
  const slots = useMemo(() => (account ? [...new Set(parseTimes(account.posting_times).map((t) => +t.slice(0, 2)))] : []), [account])
  const any = data?.heatmap.some((r) => r.some((v) => v > 0))
  return (
    <Card className={className}>
      <CardHeader title="Beste Posting-Zeiten" sub="Gepostete Reels nach Wochentag und Uhrzeit" menu={[{ label: table ? "Als Heatmap anzeigen" : "Als Tabelle anzeigen", onSelect: () => setTable((t) => !t) }]} />
      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="flex flex-col gap-[3px]">{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-[22px]" />)}</div>
      ) : (
        <>
          <Heatmap data={data?.heatmap ?? []} slots={slots} asTable={table} />
          {!any && <p className="caption mt-3">Noch keine geposteten Reels. Nach etwa einer Woche erscheinen hier Muster{slots.length ? "; die umrandeten Felder sind die eingestellten Slots" : ""}.</p>}
        </>
      )}
    </Card>
  )
}

export function loadColor(percent: number) {
  return percent > 85 ? "var(--danger)" : percent > 60 ? "var(--warning)" : "var(--primary-600)"
}

/** Replaces "Sessions by device": load of the mini PC (UIDesign.md 6.6). */
export function MiniPcCard({ system, error, className = "", size = 200 }: { system: SystemInfo | null; error?: string | null; className?: string; size?: number }) {
  const rows = system
    ? [
        { icon: MemoryStick, label: "RAM", value: `${fmtBytes(system.memory.used)} / ${fmtBytes(system.memory.total)}` },
        { icon: HardDrive, label: "Speicher frei", value: fmtBytes(system.disk.free) },
        { icon: Film, label: "Render-Warteschlange", value: `${system.render.rendering.length} ${system.render.rendering.length === 1 ? "Video" : "Videos"}` },
        { icon: Zap, label: "Encoder", value: system.encoder === "vaapi" ? "VAAPI" : "CPU (libx264)" },
        ...(system.temperature != null ? [{ icon: Thermometer, label: "Temperatur", value: `${Math.round(system.temperature)} °C` }] : []),
      ]
    : []
  return (
    <Card className={className}>
      <CardHeader title="Mini-PC" menu={[{ label: "System öffnen", onSelect: () => (window.location.href = "/system") }]}>
        {system && <span className="caption flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-success" /> live</span>}
      </CardHeader>
      {!system && error ? (
        <ErrorState message={error} />
      ) : !system ? (
        <div className="flex flex-col items-center gap-5"><Skeleton className="!rounded-full" /><Skeleton className="h-24 w-full" /></div>
      ) : (
        <>
          <RingGauge size={size} total={100} segments={[{ value: Math.max(1, system.cpu), color: loadColor(system.cpu) }]} label={`CPU-Last ${Math.round(system.cpu)} Prozent`}>
            <Cpu size={18} strokeWidth={1.5} className="text-primary-600" />
            <span className="display mt-1">{Math.round(system.cpu)} %</span>
            <span className="caption">CPU-Last</span>
          </RingGauge>
          <ul className="mt-6 flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.label} className="flex items-center gap-3">
                <r.icon size={18} strokeWidth={1.5} className="flex-none text-primary-600" />
                <span className="flex-1 truncate font-medium text-ink">{r.label}</span>
                <span className="font-semibold text-ink tabular">{r.value}</span>
              </li>
            ))}
          </ul>
          <p className="caption mt-4 flex items-center gap-1.5"><Clock size={12} /> n8n zuletzt: {system.last_n8n_poll ? relTime(system.last_n8n_poll) : "noch nicht seit dem Start"}</p>
        </>
      )}
    </Card>
  )
}

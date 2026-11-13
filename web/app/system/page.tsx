"use client"

import { Cpu, Film, HardDrive, MemoryStick } from "lucide-react"
import { useMemo, useState } from "react"
import { MiniPcCard } from "@/components/cards"
import { AreaChart } from "@/components/charts/AreaChart"
import { KpiCard } from "@/components/charts/KpiCard"
import { Card, CardHeader, EmptyState, ErrorState, Skeleton } from "@/components/ui/kit"
import { useToast } from "@/components/ui/Toast"
import { api, fmtBytes, relTime } from "@/lib/api"
import { useData } from "@/lib/data"

function uptime(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d ? `${d} T ${h} h` : h ? `${h} h ${m} min` : `${m} min`
}

export default function SystemPage() {
  const { system, error } = useData()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const points = useMemo(() => (system?.history ?? []).map((p) => {
    const t = new Date(p.t * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    return { label: t, tip: `${t} Uhr`, value: p.cpu, value2: p.ram }
  }), [system])

  async function cleanup() {
    setBusy(true)
    try {
      const r = await api<{ removed: number }>("/cleanup", { method: "POST" })
      toast(r.removed ? `${r.removed} alte Videodateien gelöscht` : "Nichts zu löschen, alles aktuell")
    } catch (e) {
      toast((e as Error).message, "error")
    } finally {
      setBusy(false)
    }
  }

  if (!system && error) return <Card><ErrorState message={error} /></Card>
  const rendering = system?.render.rendering ?? []

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12">
        <KpiCard row loading={!system} items={[
          { label: "CPU-Last", value: system ? `${Math.round(system.cpu)} %` : "–", icon: Cpu, note: system ? `${system.cores} Kerne` : "" },
          { label: "RAM", value: system ? `${Math.round(system.memory.percent)} %` : "–", icon: MemoryStick, note: system ? `${fmtBytes(system.memory.used)} von ${fmtBytes(system.memory.total)}` : "" },
          { label: "Speicher frei", value: system ? fmtBytes(system.disk.free) : "–", icon: HardDrive, note: system ? `${Math.round(system.disk.percent)} % belegt` : "" },
          { label: "Render-Warteschlange", value: rendering.length, icon: Film, note: "Videos werden nacheinander gerendert" },
        ]} />
      </div>

      <MiniPcCard system={system} error={error} className="col-span-12 xl:col-span-4" />

      <Card className="col-span-12 xl:col-span-8">
        <CardHeader title="Auslastung" sub="Ein Messwert pro Minute, höchstens 24 Stunden, seit dem Start des Containers" />
        {!system ? <Skeleton className="h-[260px]" /> : points.length < 2 ? (
          <EmptyState icon={Cpu} title="Noch zu wenig Daten" text="Der Verlauf füllt sich, sobald der Container ein paar Minuten läuft." />
        ) : (
          <AreaChart points={points} unit="%" suffix=" %" max={100} series={["CPU", "RAM"]} />
        )}
      </Card>

      <Card className="col-span-12 lg:col-span-6">
        <CardHeader title="Wird gerade gerendert" />
        {!system ? <Skeleton className="h-16" /> : rendering.length === 0 ? <p className="text-ink-3">Im Moment wird nichts gerendert.</p> : (
          <ul className="flex flex-col divide-y divide-line">
            {rendering.map((r) => (
              <li key={r.id} className="py-2.5">
                <div className="line-clamp-1 font-medium text-ink">{r.title}</div>
                <div className="caption">{r.account_name} · r/{r.subreddit} · gestartet {relTime(r.created_at)}</div>
                <div className="skeleton mt-2 h-1 !rounded-full" role="progressbar" aria-label="Rendert" />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="col-span-12 lg:col-span-6">
        <CardHeader title="Container und Speicher">
          <button type="button" className="btn btn-sm" onClick={cleanup} disabled={busy}>{busy ? "Räumt auf…" : "Jetzt aufräumen"}</button>
        </CardHeader>
        {!system ? <Skeleton className="h-24" /> : (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`Speicher zu ${Math.round(system.disk.percent)} Prozent belegt`}>
              <div className="h-full rounded-full" style={{ width: `${system.disk.percent}%`, background: system.disk.percent > 90 ? "var(--danger)" : "var(--primary-600)" }} />
            </div>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
              <dt className="text-ink-3">Speicher</dt><dd className="text-right text-ink tabular">{fmtBytes(system.disk.used)} von {fmtBytes(system.disk.total)} belegt</dd>
              <dt className="text-ink-3">Fertige Videos</dt><dd className="text-right text-ink tabular">{system.media.count} Dateien · {fmtBytes(system.media.bytes)}</dd>
              <dt className="text-ink-3">Läuft seit</dt><dd className="text-right text-ink tabular">{uptime(system.uptime_seconds)}</dd>
              <dt className="text-ink-3">n8n zuletzt</dt><dd className="text-right text-ink">{system.last_n8n_poll ? relTime(system.last_n8n_poll) : "noch nicht seit dem Start"}</dd>
              <dt className="text-ink-3">Healthcheck</dt><dd className="text-right text-success">ok</dd>
            </dl>
          </>
        )}
      </Card>
    </div>
  )
}

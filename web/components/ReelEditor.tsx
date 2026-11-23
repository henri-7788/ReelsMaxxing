"use client"

import { Check, Plus, Save, Trash2 } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import { Card, CardHeader, Segmented, Switch, TonePill } from "@/components/ui/kit"
import { useToast } from "@/components/ui/Toast"
import { api, type Account } from "@/lib/api"
import {
  BOTTOM_GAP, CREDIT_PAD, CREDIT_POSITIONS, DEFAULT_STYLE, EDGE, FRAME, HOOK_LINE_SPACING, HOOK_PAD, hookLines, LIMITS,
  normalizeStyle, sameStyle, TOP_Y, type CreditPosition, type OverlayStyle, type Preset,
} from "@/lib/overlay"

// Same TTF ffmpeg uses (served by the backend), so line breaks and widths match the render
const FONT_FACE = `@font-face{font-family:"ReelRender";src:url(/ui-api/render-font) format("truetype");font-weight:700;font-display:swap}`
const FONT = `"ReelRender","DejaVu Sans",Verdana,sans-serif`
// Measured against ffmpeg drawtext output: one hook line ≈ 1.09 em plus line_spacing, single credit line ≈ 1.16 em
const HOOK_LINE = 1.09
const LINE = 1.164

export type Sample = { title: string; author: string; subreddit: string }
export const SAMPLE: Sample = { title: "She is Timoncita, an elephant seal we are watching so people don't disturb her me-time here in Uruguay!", author: "leriz", subreddit: "aww" }

function creditBoxStyle(pos: CreditPosition): React.CSSProperties {
  const edge = EDGE - CREDIT_PAD
  const top = TOP_Y - CREDIT_PAD
  const bottom = BOTTOM_GAP - CREDIT_PAD
  switch (pos) {
    case "top_left": return { left: edge, top }
    case "top_right": return { right: edge, top }
    case "bottom_center": return { left: "50%", bottom, transform: "translateX(-50%)" }
    default: return { left: edge, bottom }
  }
}

/** Scaled 1080x1920 replica of a rendered reel: blurred background, video, hook text, credit. */
export function ReelPreview({ style, sample = SAMPLE, hook = true, width = 270, portrait = false, safeZone = false, onOverflow }: {
  style: OverlayStyle; sample?: Sample; hook?: boolean; width?: number; portrait?: boolean; safeZone?: boolean
  onOverflow?: (overflow: boolean) => void
}) {
  const scale = width / FRAME.w
  hook = hook && style.hook_enabled
  const { lines } = hookLines(sample.title, style.hook_chars_per_line, style.hook_max_lines)
  const hookRef = useRef<HTMLDivElement>(null)
  // Re-measure once the render font has loaded (it changes the text width)
  const [, setFontsLoaded] = useState(0)
  useEffect(() => { document.fonts?.ready.then(() => setFontsLoaded((n) => n + 1)) }, [])
  // Hook box wider than the frame: the text would be cut off left and right in the render too
  useLayoutEffect(() => {
    onOverflow?.(!!hookRef.current && hookRef.current.offsetWidth > FRAME.w)
  })
  const fgH = portrait ? FRAME.h : Math.round(FRAME.w * 9 / 16)
  return (
    <div className="relative mx-auto overflow-hidden rounded-[16px] border border-line bg-black" style={{ width, height: FRAME.h * scale }}
      role="img" aria-label={`Vorschau: ${hook && lines.length ? lines.join(" ") + ", " : "ohne Titel, "}${style.credit_enabled ? `Quelle ${CREDIT_POSITIONS.find((p) => p.value === style.credit_position)?.label.toLowerCase()}` : "ohne Quellenangabe"}`}>
      <style>{FONT_FACE}</style>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: FRAME.w, height: FRAME.h, transform: `scale(${scale})`, fontFamily: FONT, fontWeight: 700 }}>
        {/* blurred background copy of the video */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(160deg,#6b7f5a 0%,#c9b48a 45%,#8d7a5c 100%)", filter: "brightness(0.92)" }} />
        {/* the original video, centered */}
        <div className="absolute left-0 flex items-center justify-center" style={{ top: (FRAME.h - fgH) / 2, width: FRAME.w, height: fgH, background: "linear-gradient(180deg,#d8c9a3 0%,#b89f73 55%,#e3d6b8 100%)" }}>
          <span style={{ fontSize: 44, color: "rgba(0,0,0,0.35)" }}>Original-Video</span>
        </div>
        {hook && lines.length > 0 && (
          <div ref={hookRef} className="absolute left-1/2 whitespace-pre text-white" style={{
            top: style.hook_top - HOOK_PAD, transform: "translateX(-50%)", padding: HOOK_PAD, paddingBottom: HOOK_PAD - HOOK_LINE_SPACING,
            fontSize: style.hook_font_size, lineHeight: `${style.hook_font_size * HOOK_LINE + HOOK_LINE_SPACING}px`, background: `rgba(0,0,0,${style.hook_box_opacity})`,
          }}>
            {lines.join("\n")}
          </div>
        )}
        {style.credit_enabled && (
          <div className="absolute whitespace-pre" style={{
            ...creditBoxStyle(style.credit_position), padding: CREDIT_PAD, fontSize: style.credit_font_size,
            lineHeight: `${style.credit_font_size * LINE}px`, color: "rgba(255,255,255,0.9)", background: `rgba(0,0,0,${style.credit_box_opacity})`,
          }}>
            {`Video: u/${sample.author} · r/${sample.subreddit}`}
          </div>
        )}
        {safeZone && (
          <div aria-hidden="true">
            <div className="absolute inset-x-0 top-0" style={{ height: 220, background: "repeating-linear-gradient(135deg,rgba(255,80,80,.28) 0 18px,rgba(255,80,80,.12) 18px 36px)" }} />
            <div className="absolute inset-x-0 bottom-0" style={{ height: 450, background: "repeating-linear-gradient(135deg,rgba(255,80,80,.28) 0 18px,rgba(255,80,80,.12) 18px 36px)" }} />
            <div className="absolute right-0" style={{ top: 1000, width: 150, height: 470, background: "repeating-linear-gradient(135deg,rgba(255,80,80,.28) 0 18px,rgba(255,80,80,.12) 18px 36px)" }} />
          </div>
        )}
      </div>
    </div>
  )
}

function Slider({ label, k, value, onChange, format = (v) => String(v) }: {
  label: string; k: keyof typeof LIMITS; value: number; onChange: (v: number) => void; format?: (v: number) => string
}) {
  const [min, max, step] = LIMITS[k]
  return (
    <label className="label">
      <span className="flex justify-between"><span>{label}</span><span className="hint tabular">{format(value)}</span></span>
      <input type="range" className="w-full accent-[var(--primary-600)]" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

function Group({ title, on, onToggle, children }: { title: string; on: boolean; onToggle: (v: boolean) => void; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-3 flex w-full items-center justify-between gap-3">
        <span className="overline">{title}</span>
        <Switch checked={on} onChange={onToggle} label={`${title} anzeigen`}>{on ? "an" : "aus"}</Switch>
      </legend>
      {on ? children : <p className="hint">Wird nicht ins Video geschrieben.</p>}
    </fieldset>
  )
}

const pct = (v: number) => `${Math.round(v * 100)} %`

export type PresetsResponse = { presets: Preset[]; account?: Account; id?: number }

/** Editor in each account: live preview, global presets (save, rename, delete) and the preset this account renders with. */
export function PresetEditor({ account, presets, sample, onChange, onEnableHook }: {
  account: Account; presets: Preset[]; sample?: Sample; onChange: (r: PresetsResponse) => void; onEnableHook?: () => void
}) {
  const toast = useToast()
  const activeId = account.preset_id ?? null
  const [selected, setSelected] = useState<number | null>(activeId)
  const current = presets.find((p) => p.id === selected) ?? null
  const base = useMemo(() => normalizeStyle(current?.settings ?? DEFAULT_STYLE), [current])
  const [style, setStyle] = useState<OverlayStyle>(base)
  const [name, setName] = useState(current?.name ?? "")
  const [newName, setNewName] = useState("")
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [portrait, setPortrait] = useState(false)
  const [safeZone, setSafeZone] = useState(true)
  const [sampleTitle, setSampleTitle] = useState(sample?.title ?? SAMPLE.title)
  const [overflow, setOverflow] = useState(false)

  // Switching presets loads its values into the editor
  useEffect(() => { setStyle(base); setName(current?.name ?? "") }, [base, current])
  useEffect(() => { if (selected !== null && !presets.some((p) => p.id === selected)) setSelected(activeId) }, [presets, selected, activeId])

  const set = <K extends keyof OverlayStyle>(k: K, v: OverlayStyle[K]) => setStyle((s) => ({ ...s, [k]: v }))
  const dirty = !sameStyle(style, base) || (!!current && name.trim() !== current.name)
  const preview = { title: sampleTitle, author: sample?.author ?? SAMPLE.author, subreddit: sample?.subreddit ?? SAMPLE.subreddit }
  const cut = hookLines(preview.title, style.hook_chars_per_line, style.hook_max_lines).cut

  async function run(fn: () => Promise<PresetsResponse>, msg: string) {
    setBusy(true)
    try {
      const r = await fn()
      onChange(r)
      toast(msg)
      return r
    } catch (e) {
      toast((e as Error).message, "error")
    } finally {
      setBusy(false)
    }
  }

  const createPreset = async () => {
    const n = newName.trim()
    if (!n) return
    const r = await run(() => api("/presets", { method: "POST", body: { name: n, settings: style } }), `Preset „${n}“ gespeichert`)
    if (r?.id) { setSelected(r.id); setNewName("") }
  }
  const updatePreset = () => current && run(() => api(`/presets/${current.id}`, { method: "PUT", body: { name: name.trim() || current.name, settings: style } }),
    current.used_by.length > 1 ? `Preset gespeichert, gilt für ${current.used_by.length} Accounts` : "Preset gespeichert")
  const activate = (id: number | null) => run(() => api(`/accounts/${account.id}/preset`, { method: "PUT", body: { preset_id: id } }),
    id ? "Neue Renders nutzen jetzt dieses Preset" : "Neue Renders nutzen wieder den Standard")
  const remove = async () => {
    if (!current) return
    await run(() => api(`/presets/${current.id}`, { method: "DELETE" }), "Preset gelöscht")
    setConfirmDelete(false)
    setSelected(null)
  }

  const options = [{ id: null as number | null, name: "Standard" }, ...presets.map((p) => ({ id: p.id as number | null, name: p.name }))]

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <Card className="col-span-12 lg:col-span-5 xl:col-span-4">
        <CardHeader title="Live-Vorschau" sub="So sehen Text und Quelle im fertigen Reel aus" />
        <ReelPreview style={style} sample={preview} hook={account.hook_enabled} portrait={portrait} safeZone={safeZone} width={288} onOverflow={setOverflow} />
        <div className="mt-4 flex flex-col gap-3">
          <Segmented<"land" | "port"> label="Beispielvideo" value={portrait ? "port" : "land"} onChange={(v) => setPortrait(v === "port")}
            options={[{ value: "land", label: "Querformat" }, { value: "port", label: "Hochformat" }]} />
          <Switch checked={safeZone} onChange={setSafeZone}>Bereiche zeigen, die Instagram verdeckt</Switch>
          <label className="label">
            Beispieltitel
            <textarea className="field !text-[13px]" rows={3} value={sampleTitle} onChange={(e) => setSampleTitle(e.target.value)} />
          </label>
          {!account.hook_enabled && (
            <p className="rounded-[10px] border border-warning bg-warning-bg px-3 py-2 text-[13px] text-ink">
              Der Titel ist für diesen Account noch über den alten Schalter ausgeschaltet und erscheint deshalb nie.{" "}
              {onEnableHook && <button type="button" className="link" onClick={onEnableHook}>Wieder einschalten</button>}
            </p>
          )}
          {!style.hook_enabled && !style.credit_enabled && <p className="hint">Dieses Preset rendert das Video ganz ohne Text.</p>}
          {overflow && account.hook_enabled && style.hook_enabled && <p role="alert" className="rounded-[10px] border border-warning bg-warning-bg px-3 py-2 text-[13px] text-ink">Der Hook-Text ist breiter als das Video und wird links und rechts abgeschnitten. Schrift kleiner stellen oder weniger Zeichen pro Zeile.</p>}
          {cut && account.hook_enabled && style.hook_enabled && <p className="hint">Der Titel ist zu lang und wird nach {style.hook_max_lines} Zeilen mit „…“ abgeschnitten.</p>}
        </div>
      </Card>

      <Card className="col-span-12 lg:col-span-7 xl:col-span-8">
        <CardHeader title="Presets" sub="Presets gelten für alle Accounts. Jeder Account wählt eins für seine Renders aus." />
        <div className="mb-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Preset bearbeiten">
          {options.map((o) => (
            <button key={o.id ?? "default"} type="button" role="radio" aria-checked={selected === o.id} onClick={() => setSelected(o.id)}
              className={`tag !h-8 !px-3 text-[13px] ${selected === o.id ? "!border-primary-600 !bg-primary-50 !text-primary-700" : "hover:border-line-strong"}`}>
              {o.name}{activeId === o.id && <Check size={14} aria-label="aktiv" />}
            </button>
          ))}
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-surface-2 px-3 py-2">
          <span className="min-w-0 flex-1 text-ink">
            {current ? <>Preset <b>{current.name}</b></> : "Standard-Einstellungen"}
            {current && current.used_by.length > 0 && <span className="caption block">Genutzt von: {current.used_by.map((u) => u.name).join(", ")}</span>}
          </span>
          {activeId === selected ? <TonePill tone="success">für Renders aktiv</TonePill>
            : <button type="button" className="btn btn-sm" disabled={busy || dirty} title={dirty ? "Erst speichern" : undefined} onClick={() => activate(selected)}>Für Renders verwenden</button>}
        </div>

        <div className="mb-5">
          <Switch checked={style.hook_enabled || style.credit_enabled} onChange={(v) => setStyle((s) => ({ ...s, hook_enabled: v, credit_enabled: v }))}>
            Text im Video anzeigen
          </Switch>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Group title="Titel oben" on={style.hook_enabled} onToggle={(v) => set("hook_enabled", v)}>
            <Slider label="Schriftgröße" k="hook_font_size" value={style.hook_font_size} onChange={(v) => set("hook_font_size", v)} format={(v) => `${v} px`} />
            <Slider label="Abstand von oben" k="hook_top" value={style.hook_top} onChange={(v) => set("hook_top", v)} format={(v) => `${v} px`} />
            <Slider label="Zeichen pro Zeile" k="hook_chars_per_line" value={style.hook_chars_per_line} onChange={(v) => set("hook_chars_per_line", v)} />
            <Slider label="Höchstens Zeilen" k="hook_max_lines" value={style.hook_max_lines} onChange={(v) => set("hook_max_lines", v)} format={(v) => `${v}, danach „…“`} />
            <Slider label="Hintergrund" k="hook_box_opacity" value={style.hook_box_opacity} onChange={(v) => set("hook_box_opacity", v)} format={pct} />
          </Group>
          <Group title="Quellenangabe" on={style.credit_enabled} onToggle={(v) => set("credit_enabled", v)}>
            <label className="label">
              Position
              <select className="field" value={style.credit_position} onChange={(e) => set("credit_position", e.target.value as CreditPosition)}>
                {CREDIT_POSITIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <Slider label="Schriftgröße" k="credit_font_size" value={style.credit_font_size} onChange={(v) => set("credit_font_size", v)} format={(v) => `${v} px`} />
            <Slider label="Hintergrund" k="credit_box_opacity" value={style.credit_box_opacity} onChange={(v) => set("credit_box_opacity", v)} format={pct} />
          </Group>
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-line pt-4">
          {current && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="label min-w-48 flex-1">
                Name
                <input className="field" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={updatePreset}><Save size={16} /> Speichern</button>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Löschen</button>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="label min-w-48 flex-1">
              Als neues Preset speichern
              <input className="field" maxLength={60} value={newName} placeholder="z. B. Große Schrift" onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createPreset() } }} />
            </label>
            <button type="button" className={current ? "btn" : "btn btn-primary"} disabled={busy || !newName.trim()} onClick={createPreset}><Plus size={16} /> Neues Preset</button>
            {dirty && <button type="button" className="btn btn-ghost" onClick={() => { setStyle(base); setName(current?.name ?? "") }}>Zurücksetzen</button>}
          </div>
          <p className="hint">Die Vorschau ist eine maßstabsgetreue Nachbildung mit der Render-Schrift. Ein echtes Probevideo erzeugt „Vorschau rendern“ oben rechts.</p>
        </div>
      </Card>

      <ConfirmDialog open={confirmDelete} title={`Preset „${current?.name ?? ""}“ löschen?`} confirmLabel="Löschen" onConfirm={remove} onClose={() => setConfirmDelete(false)} busy={busy}>
        {current && current.used_by.length > 0
          ? `Genutzt von ${current.used_by.map((u) => u.name).join(", ")}. Diese Accounts rendern danach wieder mit dem Standard.`
          : "Bereits gerenderte Videos bleiben unverändert."}
      </ConfirmDialog>
    </div>
  )
}

/**
 * Overlay style of a rendered reel ("preset"). Mirrors app/presets.py and app/captions.py
 * so the editor preview breaks and cuts the hook text exactly like the renderer.
 */
export type CreditPosition = "bottom_left" | "bottom_center" | "top_left" | "top_right"

export type OverlayStyle = {
  hook_enabled: boolean
  credit_enabled: boolean
  hook_font_size: number
  hook_top: number
  hook_max_lines: number
  hook_chars_per_line: number
  hook_box_opacity: number
  credit_position: CreditPosition
  credit_font_size: number
  credit_box_opacity: number
}

/** Presets are global: every account can use any of them. used_by = accounts rendering with it. */
export type Preset = { id: number; name: string; settings: OverlayStyle; used_by: { id: number; name: string }[]; created_at: string; updated_at: string }

export const DEFAULT_STYLE: OverlayStyle = {
  hook_enabled: true, credit_enabled: true,
  hook_font_size: 62, hook_top: 250, hook_max_lines: 3, hook_chars_per_line: 24, hook_box_opacity: 0.55,
  credit_position: "bottom_left", credit_font_size: 30, credit_box_opacity: 0.4,
}

type NumericKey = Exclude<keyof OverlayStyle, "credit_position" | "hook_enabled" | "credit_enabled">
export const LIMITS: Record<NumericKey, [number, number, number]> = {
  // min, max, step
  hook_font_size: [36, 96, 1],
  hook_top: [200, 900, 10],
  hook_max_lines: [1, 5, 1],
  hook_chars_per_line: [12, 40, 1],
  hook_box_opacity: [0, 0.9, 0.05],
  credit_font_size: [22, 48, 1],
  credit_box_opacity: [0, 0.9, 0.05],
}

export const CREDIT_POSITIONS: { value: CreditPosition; label: string }[] = [
  { value: "bottom_left", label: "Unten links" },
  { value: "bottom_center", label: "Unten mittig" },
  { value: "top_left", label: "Oben links" },
  { value: "top_right", label: "Oben rechts" },
]

// Frame and safe-area constants (app/presets.py)
export const FRAME = { w: 1080, h: 1920 }
export const EDGE = 54
export const TOP_Y = 240
export const BOTTOM_GAP = 480
// drawtext box padding (boxborderw) and extra space between hook lines (line_spacing)
export const HOOK_PAD = 26
export const HOOK_LINE_SPACING = 14
export const CREDIT_PAD = 12

export function cleanTitle(title: string): string {
  return title.replace(/\[.*?\]|\(.*?\)/g, "").replace(/\s+/g, " ").trim()
}

export function wrapWords(text: string, width: number): string[] {
  const lines: string[] = []
  let cur = ""
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (word.length > width) {
      if (cur) { lines.push(cur); cur = "" }
      lines.push(word.slice(0, width))
      word = word.slice(width)
    }
    if (!word) continue
    if (!cur) cur = word
    else if (cur.length + 1 + word.length <= width) cur += " " + word
    else { lines.push(cur); cur = word }
  }
  if (cur) lines.push(cur)
  return lines
}

/** Hook lines as the renderer draws them; too long titles end with "…". */
export function hookLines(title: string, width: number, maxLines: number): { lines: string[]; cut: boolean } {
  const lines = wrapWords(cleanTitle(title), width)
  if (lines.length <= maxLines) return { lines, cut: false }
  const kept = lines.slice(0, maxLines)
  kept[kept.length - 1] = kept[kept.length - 1].replace(/[.,;:!? ]+$/, "") + "…"
  return { lines: kept, cut: true }
}

export function normalizeStyle(raw: Partial<OverlayStyle> | null | undefined): OverlayStyle {
  const out: OverlayStyle = { ...DEFAULT_STYLE }
  for (const [k, [lo, hi]] of Object.entries(LIMITS) as [keyof typeof LIMITS, [number, number, number]][]) {
    const v = Number(raw?.[k])
    if (raw && k in raw && Number.isFinite(v)) out[k] = Math.min(hi, Math.max(lo, v))
  }
  for (const k of ["hook_enabled", "credit_enabled"] as const) if (typeof raw?.[k] === "boolean") out[k] = raw[k]
  if (raw?.credit_position && CREDIT_POSITIONS.some((p) => p.value === raw.credit_position)) out.credit_position = raw.credit_position
  return out
}

export const sameStyle = (a: OverlayStyle, b: OverlayStyle) =>
  (Object.keys(DEFAULT_STYLE) as (keyof OverlayStyle)[]).every((k) => a[k] === b[k])

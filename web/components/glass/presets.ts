export type GlassMode = "standard" | "polar" | "prominent" | "shader"
export type GlassVariant = "pill" | "button" | "card" | "panel" | "modal" | "badge"
export type GlassIntensity = "subtle" | "default" | "vivid"

export interface GlassParams {
  displacementScale: number
  blurAmount: number
  saturation: number
  aberrationIntensity: number
  elasticity: number
  cornerRadius: number
  padding: string
}

/**
 * Startwerte je Element-Typ. "card" und "button" entsprechen den Werten
 * der offiziellen Demo (liquid-glass.maxrovensky.com).
 * Blur in Pixeln = (overLight ? 12 : 4) + blurAmount * 32
 */
export const GLASS_PRESETS: Record<GlassVariant, GlassParams> = {
  pill:   { displacementScale: 64,  blurAmount: 0.1,  saturation: 130, aberrationIntensity: 2,   elasticity: 0.15, cornerRadius: 999, padding: "8px 16px" },
  button: { displacementScale: 64,  blurAmount: 0.1,  saturation: 130, aberrationIntensity: 2,   elasticity: 0.35, cornerRadius: 999, padding: "0px" },
  card:   { displacementScale: 100, blurAmount: 0.5,  saturation: 140, aberrationIntensity: 2,   elasticity: 0,    cornerRadius: 32,  padding: "24px 28px" },
  panel:  { displacementScale: 70,  blurAmount: 0.3,  saturation: 140, aberrationIntensity: 1.5, elasticity: 0,    cornerRadius: 24,  padding: "16px 24px" },
  modal:  { displacementScale: 80,  blurAmount: 0.6,  saturation: 140, aberrationIntensity: 2,   elasticity: 0,    cornerRadius: 32,  padding: "32px" },
  badge:  { displacementScale: 40,  blurAmount: 0.05, saturation: 140, aberrationIntensity: 1,   elasticity: 0.1,  cornerRadius: 999, padding: "4px 10px" },
}

/**
 * Multiplikatoren je Intensität. "vivid" verringert auch den Blur,
 * weil starker Frost die Lichtbrechung verdeckt.
 */
export const GLASS_INTENSITY: Record<GlassIntensity, { displacement: number; aberration: number; elasticity: number; blur: number }> = {
  subtle:  { displacement: 0.6, aberration: 0.5, elasticity: 0.5, blur: 1.3 },
  default: { displacement: 1,   aberration: 1,   elasticity: 1,   blur: 1 },
  vivid:   { displacement: 1.4, aberration: 1.5, elasticity: 1.5, blur: 0.4 },
}

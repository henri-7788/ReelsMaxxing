"use client"

/**
 * GlassSurface – robuste Hülle um liquid-glass-react für Next.js
 *
 * Löst diese Eigenheiten der Library:
 * - Sie liest navigator beim Rendern  -> wird erst nach dem Mount gerendert (SSR-sicher),
 *   vorher steht ein CSS-Fallback mit gleicher Größe da (kein Layout-Sprung).
 * - Sie zentriert sich per top/left 50% + translate(-50%,-50%) und rendert ihre
 *   Rand-/Glanz-Ebenen als lose Geschwister -> alles liegt absolut in einem
 *   gemessenen, relativ positionierten Container und verhält sich wie ein normales Element.
 * - Sie misst ihre Größe nur beim Mount und bei window-resize -> ResizeObserver
 *   meldet Größenänderungen (Fonts, dynamischer Inhalt) nach.
 * - onClick der Library ist ein div ohne Tastaturbedienung -> Aktionen immer über
 *   echte <button>/<a>-Kinder, Glas liefert nur Hover-/Press-Optik.
 */

import LiquidGlass from "liquid-glass-react"
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react"
import "./glass.css"
import {
  GLASS_INTENSITY,
  GLASS_PRESETS,
  type GlassIntensity,
  type GlassMode,
  type GlassVariant,
} from "./presets"

/* ------------------------------------------------------------------ */
/* GlassArea: Bereich, in dem die Gläser der Maus "entgegenfließen"    */
/* ------------------------------------------------------------------ */

const GlassAreaContext = createContext<RefObject<HTMLElement | null> | null>(null)

export function GlassArea({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <GlassAreaContext.Provider value={ref}>
      <div ref={ref} className={className} style={style}>
        {children}
      </div>
    </GlassAreaContext.Provider>
  )
}

/* ------------------------------------------------------------------ */
/* Umgebung erkennen (nur im Browser)                                  */
/* ------------------------------------------------------------------ */

type GlassEnv = {
  /** Chromium: volle Lichtbrechung. Safari/Firefox: nur Blur + Ränder. */
  chromium: boolean
  reducedMotion: boolean
  reducedTransparency: boolean
}

function readEnv(): GlassEnv {
  const ua = navigator.userAgent
  const firefox = /firefox|fxios/i.test(ua)
  const safari = /safari/i.test(ua) && !/chrome|chromium|crios|edg|android/i.test(ua)
  return {
    chromium: !firefox && !safari,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    reducedTransparency: window.matchMedia("(prefers-reduced-transparency: reduce)").matches,
  }
}

/* ------------------------------------------------------------------ */
/* GlassSurface                                                        */
/* ------------------------------------------------------------------ */

export type GlassSurfaceProps = {
  children: ReactNode
  /** Startwerte je Element-Typ (siehe presets.ts). */
  variant?: GlassVariant
  /** Stärke von Verzerrung, Farbsaum und Elastizität. */
  intensity?: GlassIntensity
  /** Brechungsmodus. "shader" ist am realistischsten, aber teurer; nur für kleine Elemente. */
  mode?: GlassMode
  /** Glas liegt über hellem Hintergrund (dunklere Tönung, halbe Verzerrung). */
  overLight?: boolean
  /** Textfarbe im Glas. "light" = weiß (Standard der Library), "dark" = fast schwarz, "inherit" = von außen. */
  text?: "light" | "dark" | "inherit"
  /** "auto" = so breit wie der Inhalt, "fill" = volle Breite des Elternelements. */
  layout?: "auto" | "fill"
  /** Hover-/Press-Effekt. Kind muss ein <button> oder <a>/<Link> sein, das die Aktion trägt. */
  interactive?: boolean
  /** Eigene Feinwerte, überschreiben Preset und Intensität. */
  displacementScale?: number
  blurAmount?: number
  saturation?: number
  aberrationIntensity?: number
  elasticity?: number
  cornerRadius?: number
  padding?: string
  /** Eigener Mausbereich; sonst der nächste <GlassArea>, sonst das Glas selbst. */
  mouseContainer?: RefObject<HTMLElement | null>
  /** Klassen für die äußere Hülle (Position, Abstände, z-index ...). */
  className?: string
  style?: CSSProperties
}

const noop = () => {}

export function GlassSurface({
  children,
  variant = "card",
  intensity = "default",
  mode = "standard",
  overLight = false,
  text = "light",
  layout = "auto",
  interactive = variant === "button",
  mouseContainer,
  className = "",
  style,
  ...overrides
}: GlassSurfaceProps) {
  const areaRef = useContext(GlassAreaContext)
  const innerRef = useRef<HTMLDivElement>(null)
  const [env, setEnv] = useState<GlassEnv | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  // Parameter zusammensetzen: Preset -> Intensität -> eigene Werte -> Bewegung reduzieren
  const preset = GLASS_PRESETS[variant]
  const mult = GLASS_INTENSITY[intensity]
  const p = {
    displacementScale: preset.displacementScale * mult.displacement,
    blurAmount: preset.blurAmount * mult.blur,
    saturation: preset.saturation,
    aberrationIntensity: preset.aberrationIntensity * mult.aberration,
    elasticity: Math.min(1, preset.elasticity * mult.elasticity),
    cornerRadius: preset.cornerRadius,
    padding: preset.padding,
    ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)),
  } as typeof preset
  if (env?.reducedMotion) p.elasticity = 0

  if (process.env.NODE_ENV !== "production" && overLight && text === "dark") {
    console.warn(
      '[GlassSurface] overLight + text="dark" wirkt trüb. Auf hellem Grund besser text="dark" ohne overLight, oder overLight mit text="light".',
    )
  }

  const showGlass = env !== null && !env.reducedTransparency

  // 1) Nach dem Mount: Umgebung lesen und Größe des Fallbacks übernehmen (kein Sprung)
  useLayoutEffect(() => {
    const fb = innerRef.current?.firstElementChild as HTMLElement | null
    if (fb) setSize({ w: fb.offsetWidth, h: fb.offsetHeight })
    setEnv(readEnv())
  }, [])

  // 2) Glas-Größe beobachten; Library per resize-Event zum Neumessen bringen
  useLayoutEffect(() => {
    if (!showGlass) return
    const el = innerRef.current?.querySelector<HTMLElement>(":scope > .lg-glass")
    if (!el) return
    let raf = 0
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }))
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")))
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [showGlass, layout])

  const rootClass = [
    "lg-root",
    layout === "fill" ? "lg-fill" : "lg-auto",
    interactive ? "lg-interactive" : "",
    overLight ? "lg-over-light" : "",
    text === "dark" ? "lg-text-dark" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ")

  const color = text === "light" ? "#fff" : text === "dark" ? "#111" : undefined

  return (
    <div className={rootClass} style={{ color, ...style }} data-glass={showGlass ? (env?.chromium ? "full" : "partial") : "fallback"}>
      <div
        ref={innerRef}
        style={
          showGlass
            ? { position: "relative", width: layout === "fill" ? "100%" : size?.w, height: size?.h }
            : { position: "relative", width: layout === "fill" ? "100%" : "fit-content" }
        }
      >
        {showGlass ? (
          <LiquidGlass
            {...p}
            mode={mode}
            overLight={overLight}
            className="lg-glass"
            mouseContainer={mouseContainer ?? areaRef ?? null}
            onClick={interactive ? noop : undefined}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: layout === "fill" ? "100%" : "max-content",
            }}
          >
            {children}
          </LiquidGlass>
        ) : (
          <div
            className="lg-fallback"
            style={
              {
                borderRadius: p.cornerRadius,
                padding: p.padding,
                "--lg-blur": `${(overLight ? 12 : 4) + p.blurAmount * 32}px`,
                "--lg-sat": `${p.saturation}%`,
              } as CSSProperties
            }
          >
            <div>{children}</div>
          </div>
        )}
      </div>
    </div>
  )
}

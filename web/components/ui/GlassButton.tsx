"use client"

import type { ButtonHTMLAttributes, ReactNode } from "react"
import Link from "next/link"
import { GlassSurface } from "@/components/glass"

type Common = { children: ReactNode; tone?: "glass" | "accent"; className?: string; size?: "md" | "lg" }

const pad = { md: "px-5 py-2.5 text-sm", lg: "px-6 py-3 text-base" }

/** Primary action: liquid glass shell, real <button>/<Link> inside carries the action. */
export function GlassButton({
  children,
  tone = "glass",
  size = "md",
  className = "",
  ...props
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <GlassSurface variant="button" className={className}>
      <button
        type="button"
        {...props}
        className={`${pad[size]} gap-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
          tone === "accent" ? "bg-gradient-to-br from-[#ff4f8b]/70 to-[#ff8a3d]/60" : ""
        }`}
      >
        {children}
      </button>
    </GlassSurface>
  )
}

export function GlassLink({ children, href, tone = "glass", size = "md", className = "" }: Common & { href: string }) {
  return (
    <GlassSurface variant="button" className={className}>
      <Link
        href={href}
        className={`${pad[size]} gap-2 font-semibold ${tone === "accent" ? "bg-gradient-to-br from-[#ff4f8b]/70 to-[#ff8a3d]/60" : ""}`}
      >
        {children}
      </Link>
    </GlassSurface>
  )
}

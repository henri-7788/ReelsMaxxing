import type { Metadata, Viewport } from "next"
import { GlassArea } from "@/components/glass"
import { Nav } from "@/components/ui/Nav"
import { ToastProvider } from "@/components/ui/Toast"
import "./globals.css"

export const metadata: Metadata = {
  title: "Reels-Manager",
  description: "Reddit-Videos als Instagram-Reels vorbereiten und planen",
}

export const viewport: Viewport = { themeColor: "#0c0a1d", width: "device-width", initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="font-sans">
        <div className="backdrop" aria-hidden="true" />
        <ToastProvider>
          <GlassArea className="min-h-dvh">
            <Nav />
            <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-6">{children}</main>
          </GlassArea>
        </ToastProvider>
      </body>
    </html>
  )
}

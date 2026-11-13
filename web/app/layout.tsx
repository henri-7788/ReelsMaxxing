import type { Metadata, Viewport } from "next"
import { Suspense } from "react"
import { AppShell } from "@/components/shell/AppShell"
import { ToastProvider } from "@/components/ui/Toast"
import { DataProvider } from "@/lib/data"
import "./globals.css"

export const metadata: Metadata = {
  title: "Reels-Manager",
  description: "Reddit-Videos als Instagram-Reels vorbereiten und planen",
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#F3F4F8" }

/** Runs before the first paint: saved choice, otherwise the system setting (UIDesign.md 9.1). */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m&&t==="dark")m.setAttribute("content","#0E1015")}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className="font-sans">
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <ToastProvider>
          <DataProvider>
            <Suspense>
              <AppShell>{children}</AppShell>
            </Suspense>
          </DataProvider>
        </ToastProvider>
      </body>
    </html>
  )
}

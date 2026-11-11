import type { NextConfig } from "next"

// Static export: Next.js only runs at build time. The mini-PC serves plain
// HTML/JS/CSS from FastAPI, so there is no Node.js process at runtime.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Dev only: forward backend routes to a local uvicorn on :8080
  ...(process.env.NODE_ENV === "development"
    ? {
        async rewrites() {
          return ["ui-api", "media", "api", "health"].map((p) => ({
            source: `/${p}/:path*`,
            destination: `http://127.0.0.1:8080/${p}/:path*`,
          }))
        },
      }
    : {}),
}

export default nextConfig

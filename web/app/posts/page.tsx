"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/** Old "Verlauf" page: now part of the queue. */
export default function PostsRedirect() {
  const router = useRouter()
  useEffect(() => router.replace("/queue?view=history"), [router])
  return null
}

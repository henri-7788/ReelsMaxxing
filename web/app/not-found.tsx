"use client"

import { SearchX } from "lucide-react"
import Link from "next/link"
import { Card, EmptyState } from "@/components/ui/kit"

export default function NotFound() {
  return (
    <Card>
      <EmptyState icon={SearchX} title="Seite nicht gefunden" text="Diese Adresse gibt es im Reels-Manager nicht.">
        <Link href="/" className="btn btn-primary">Zum Dashboard</Link>
      </EmptyState>
    </Card>
  )
}

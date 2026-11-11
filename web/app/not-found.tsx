import Link from "next/link"

export default function NotFound() {
  return (
    <div className="frost mt-14 flex flex-col items-center gap-4 px-6 py-16 text-center">
      <h1 className="text-3xl font-bold">Seite nicht gefunden</h1>
      <Link href="/" className="btn-ghost">← Zur Übersicht</Link>
    </div>
  )
}

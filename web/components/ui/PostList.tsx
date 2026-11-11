import { formatSlot, STATUS_LABEL, type Post } from "@/lib/api"

export function StatusPill({ status }: { status: string }) {
  return <span className={`status s-${status}`}>{STATUS_LABEL[status] ?? status}</span>
}

function canView(p: Post) {
  return p.media_file && ["ready", "preview", "publishing", "failed"].includes(p.status)
}

/** Frosted CSS list (no SVG glass: lists can be long). Table on desktop, cards on mobile. */
export function PostList({ posts, showAccount = true, empty = "Noch keine Videos." }: { posts: Post[]; showAccount?: boolean; empty?: string }) {
  if (!posts.length) {
    return <div className="frost px-6 py-10 text-center text-sm text-muted">{empty}</div>
  }
  return (
    <div className="frost overflow-hidden">
      <table className="data-table hidden md:table">
        <thead>
          <tr>
            <th className="w-14">#</th>
            {showAccount && <th>Account</th>}
            <th>Video</th>
            <th>Slot</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => (
            <tr key={p.id}>
              <td className="text-muted tabular-nums">{p.id}</td>
              {showAccount && <td className="font-medium">{p.account_name}</td>}
              <td className="max-w-md">
                <a className="link" href={`https://reddit.com${p.permalink}`} target="_blank" rel="noopener noreferrer">
                  {p.title.length > 80 ? p.title.slice(0, 80) + "…" : p.title}
                </a>
                <div className="mt-0.5 text-xs text-muted">r/{p.subreddit} · u/{p.author}</div>
                {p.error && <div className="mt-1 text-xs text-[#ffb4b4]">{p.error}</div>}
              </td>
              <td className="whitespace-nowrap text-muted">{formatSlot(p.slot)}</td>
              <td><StatusPill status={p.status} /></td>
              <td>
                {canView(p) && (
                  <a className="btn-ghost whitespace-nowrap" href={`/media/${p.media_file}`} target="_blank" rel="noopener">
                    ▶ Ansehen
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-white/10 md:hidden">
        {posts.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <StatusPill status={p.status} />
              <span className="text-xs text-muted">{showAccount ? `${p.account_name} · ` : ""}{formatSlot(p.slot)}</span>
            </div>
            <a className="link text-sm font-medium" href={`https://reddit.com${p.permalink}`} target="_blank" rel="noopener noreferrer">
              {p.title}
            </a>
            <div className="text-xs text-muted">r/{p.subreddit} · u/{p.author}</div>
            {p.error && <div className="text-xs text-[#ffb4b4]">{p.error}</div>}
            {canView(p) && (
              <a className="btn-ghost w-fit" href={`/media/${p.media_file}`} target="_blank" rel="noopener">▶ Ansehen</a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

import type { ReactNode } from 'react'

export function KeyValue ({ entries }: { entries: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {entries.map(([k, v], i) => (
        <span key={i} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </span>
      ))}
    </dl>
  )
}

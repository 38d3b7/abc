import type { ReactNode } from 'react'

export interface Stat {
  label: string
  value: ReactNode
  small?: boolean
}

export function StatStrip ({ stats }: { stats: Stat[] }) {
  return (
    <div className="stat-strip">
      {stats.map((s, i) => (
        <div className="stat-cell" key={i}>
          <span className="label">{s.label}</span>
          <span className={`stat-value mono${s.small ? ' small-val' : ''}`}>{s.value}</span>
        </div>
      ))}
    </div>
  )
}

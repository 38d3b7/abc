export function ProgressBar ({ frac, ok }: { frac: number; ok?: boolean }) {
  const pct = Math.max(0, Math.min(100, frac * 100))
  return (
    <div className={`progress${ok ? ' ok' : ''}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Display formatting for the board. Client-safe (no node imports). */

/** USDC amounts: $1,234.56 at size, 4 significant digits below $1. */
export function fmtUsd (n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n >= 1) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  if (n <= 0) return '$0.00'
  return '$' + n.toPrecision(4)
}

/** Token prices live far below $1 — always significant digits. */
export function fmtPrice (n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—'
  return '$' + n.toPrecision(4)
}

export function fmtPct (n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

/** 1,234 / 12.3K / 4.5M */
export function fmtCount (n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toPrecision(3) + 'M'
  if (n >= 10_000) return (n / 1_000).toPrecision(3) + 'K'
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function fmtAgo (iso: string | null): string {
  if (!iso) return '—'
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 90) return `${Math.round(secs)}s ago`
  if (secs < 5400) return `${Math.round(secs / 60)}m ago`
  if (secs < 129_600) return `${(secs / 3600).toFixed(1)}h ago`
  return `${Math.round(secs / 86_400)}d ago`
}

export function fmtDuration (seconds: number): string {
  if (seconds <= 0) return 'ending'
  if (seconds < 90) return `${Math.round(seconds)}s`
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`
  if (seconds < 129_600) return `${(seconds / 3600).toFixed(1)} h`
  return `${(seconds / 86_400).toFixed(1)} d`
}

export function shortAddr (addr: string | null): string {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** % change since the pool's launch price. */
export function changeSinceLaunch (price: number | null, launch: number | null): number | null {
  if (price == null || launch == null || launch <= 0) return null
  return ((price - launch) / launch) * 100
}

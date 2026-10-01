/**
 * Automation due-ness. Pure so the worker can re-validate at fire time
 * without going through pg-boss. Cron is elapsed-interval; fee_accrued is
 * the lock's same simple math (booked 25% vs a USDC threshold) and fires
 * once; price is not armed until a live quote is supplied on the row.
 */

export interface DueRow {
  kind: string
  spec: { intervalSeconds?: number; thresholdUsdc?: number }
  lastFiredAt: string | Date | null
  createdAt: string | Date
  /** participantFeesBooked on the agent's hook, 18-dec wei. */
  participantFeesBooked?: bigint | undefined
}

function at (v: string | Date | null | undefined): number {
  if (v == null) return NaN
  if (v instanceof Date) return v.getTime()
  return Date.parse(v)
}

/** Decimal USDC → 18-dec wei without `n * 1e18` float rounding. */
export function usdcToWei (usdc: number): bigint {
  const [whole = '0', frac = ''] = String(usdc).split('.')
  const frac18 = (frac + '0'.repeat(18)).slice(0, 18)
  const sign = usdc < 0 ? -1n : 1n
  return sign * (BigInt(whole.replace('-', '') || '0') * 10n ** 18n + BigInt(frac18))
}

export function isDue (row: DueRow, nowMs: number): boolean {
  if (row.kind === 'cron') {
    const interval = Number(row.spec.intervalSeconds ?? 0)
    if (!(interval > 0)) return false
    const last = at(row.lastFiredAt ?? row.createdAt)
    if (Number.isNaN(last)) return false
    return nowMs - last >= interval * 1000
  }
  if (row.kind === 'fee_accrued') {
    // Fire once when booked participant fees (the 25%) reach the threshold.
    // participantFeesBooked is cumulative, so without the one-shot a crossed
    // threshold would re-fire every tick.
    if (row.lastFiredAt) return false
    const usdc = Number(row.spec.thresholdUsdc ?? 0)
    if (!(usdc > 0) || row.participantFeesBooked === undefined) return false
    return row.participantFeesBooked >= usdcToWei(usdc)
  }
  return false
}

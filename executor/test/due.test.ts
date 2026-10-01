import { describe, expect, it } from 'vitest'
import { isDue, usdcToWei, type DueRow } from '../src/worker/due.js'

const t0 = Date.parse('2026-10-01T14:53:18.000Z')

function cron (over: Partial<DueRow> = {}): DueRow {
  return {
    kind: 'cron',
    spec: { intervalSeconds: 300 },
    lastFiredAt: null,
    createdAt: '2026-10-01T14:53:18.000Z',
    ...over
  }
}

describe('isDue', () => {
  it('cron is not due before the interval elapses', () => {
    expect(isDue(cron(), t0 + 299_000)).toBe(false)
  })

  it('cron is due once the interval elapses from createdAt', () => {
    expect(isDue(cron(), t0 + 300_000)).toBe(true)
  })

  it('cron measures from lastFiredAt once it has fired', () => {
    const row = cron({ lastFiredAt: '2026-10-01T14:58:18.000Z' })
    const last = row.lastFiredAt instanceof Date ? row.lastFiredAt.getTime() : Date.parse(row.lastFiredAt!)
    expect(isDue(row, last + 299_000)).toBe(false)
    expect(isDue(row, last + 300_000)).toBe(true)
  })

  it('cron with a missing interval is never due', () => {
    expect(isDue(cron({ spec: {} }), t0 + 1_000_000)).toBe(false)
  })

  it('fee_accrued is due when booked 25% reaches the threshold and has never fired', () => {
    const row: DueRow = {
      kind: 'fee_accrued',
      spec: { thresholdUsdc: 1.11 },
      lastFiredAt: null,
      createdAt: '2026-10-01T14:53:18.000Z',
      participantFeesBooked: 1110000000000000000n
    }
    expect(isDue(row, t0)).toBe(true)
    expect(isDue({ ...row, participantFeesBooked: 1100000000000000000n }, t0)).toBe(false)
  })

  it('fee_accrued does not re-fire after lastFiredAt (booked is cumulative)', () => {
    const row: DueRow = {
      kind: 'fee_accrued',
      spec: { thresholdUsdc: 1 },
      lastFiredAt: '2026-10-01T15:00:00.000Z',
      createdAt: '2026-10-01T14:53:18.000Z',
      participantFeesBooked: 10n * 10n ** 18n
    }
    expect(isDue(row, t0 + 86_400_000)).toBe(false)
  })

  it('usdcToWei does not float-round 1.11', () => {
    expect(usdcToWei(1.11)).toBe(1110000000000000000n)
    expect(usdcToWei(25)).toBe(25n * 10n ** 18n)
  })

  it('price is never due (no live quote on the row)', () => {
    expect(isDue({
      kind: 'price',
      spec: {},
      lastFiredAt: null,
      createdAt: '2026-10-01T14:53:18.000Z'
    }, t0)).toBe(false)
  })
})

/**
 * Token board derivation: sqrtPrice math in both currency orderings,
 * buy/sell classification from pool deltas, and the log-range splitter
 * (ported with its tests from openlaunch-api log-range.test.ts).
 */

import { describe, it, expect } from 'vitest'
import {
  sqrtPriceToPrice01, tokenPriceUsdc, deriveSwap,
  fetchLogsSplit, isRangeTooLarge
} from '../src/lge/board.js'

// 1:1 price at equal decimals: sqrtPriceX96 = 2^96.
const Q96 = 2n ** 96n

describe('sqrtPriceToPrice01', () => {
  it('2^96 is 1:1 at equal decimals', () => {
    expect(sqrtPriceToPrice01(Q96, 18, 18)).toBeCloseTo(1, 12)
  })

  it('decimal adjustment: currency0 18 decimals, currency1 6', () => {
    // raw price 1:1 means 1 raw unit of c0 buys 1 raw unit of c1, so
    // 1 human c0 (1e18 raw) buys 1e18 raw c1 = 1e12 human c1.
    expect(sqrtPriceToPrice01(Q96, 18, 6)).toBeCloseTo(1e12, 0)
  })

  it('zero sqrtPrice is 0, not NaN', () => {
    expect(sqrtPriceToPrice01(0n, 18, 18)).toBe(0)
  })
})

describe('tokenPriceUsdc', () => {
  it('token as currency0: price01 IS the token price in USDC', () => {
    // 2^96 with token(18) as c0 and USDC(6) as c1: 1 token = 1e12 USDC.
    expect(tokenPriceUsdc(Q96, true, 18, 6)).toBeCloseTo(1e12, 0)
  })

  it('token as currency1: token price is the reciprocal', () => {
    // USDC(6) as c0, token(18) as c1: price01 = 1e-12 tokens per USDC →
    // 1 token = 1e12 USDC. Same pool, same token price either ordering.
    expect(tokenPriceUsdc(Q96, false, 18, 6)).toBeCloseTo(1e12, 0)
  })

  it('a 4x raw-price move scales the token price by 4 (c0) or 1/4 (c1)', () => {
    const doubled = Q96 * 2n // sqrtPrice ×2 → raw price ×4
    expect(tokenPriceUsdc(doubled, true, 18, 6)).toBeCloseTo(4e12, 0)
    // token as c1: price01 is tokens per USDC; 4x that = token 4x cheaper.
    expect(tokenPriceUsdc(doubled, false, 18, 6)).toBeCloseTo(1e12 / 4, 0)
  })
})

describe('deriveSwap', () => {
  it('token currency0: pool paying token out (amount0 < 0) is a buy', () => {
    const d = deriveSwap(
      { amount0: -1_000_000n * 10n ** 18n, amount1: 500n * 10n ** 6n, sqrtPriceX96: Q96 },
      true, 18, 6
    )
    expect(d.isBuy).toBe(true)
    expect(d.tokenAmount).toBeCloseTo(1_000_000, 6)
    expect(d.usdcAmount).toBeCloseTo(500, 6)
  })

  it('token currency0: pool receiving token (amount0 > 0) is a sell', () => {
    const d = deriveSwap(
      { amount0: 2_000n * 10n ** 18n, amount1: -10n * 10n ** 6n, sqrtPriceX96: Q96 },
      true, 18, 6
    )
    expect(d.isBuy).toBe(false)
    expect(d.tokenAmount).toBeCloseTo(2_000, 6)
    expect(d.usdcAmount).toBeCloseTo(10, 6)
  })

  it('token currency1: pool paying token out (amount1 < 0) is a buy', () => {
    const d = deriveSwap(
      { amount0: 250n * 10n ** 6n, amount1: -5_000n * 10n ** 18n, sqrtPriceX96: Q96 },
      false, 18, 6
    )
    expect(d.isBuy).toBe(true)
    expect(d.tokenAmount).toBeCloseTo(5_000, 6)
    expect(d.usdcAmount).toBeCloseTo(250, 6)
  })

  it('token currency1: pool receiving token (amount1 > 0) is a sell', () => {
    const d = deriveSwap(
      { amount0: -7n * 10n ** 6n, amount1: 100n * 10n ** 18n, sqrtPriceX96: Q96 },
      false, 18, 6
    )
    expect(d.isBuy).toBe(false)
  })
})

describe('isRangeTooLarge', () => {
  it('recognises the size refusals of Arc and Alchemy, through viem\'s cause chain', () => {
    expect(isRangeTooLarge(new Error('request exceeded max allowed range: query exceeds max results 2000, retry with the range 21102592-21102595'))).toBe(true)
    expect(isRangeTooLarge(new Error('requested range too large'))).toBe(true)
    expect(isRangeTooLarge(new Error('Log response size exceeded. This block range should work: [0x1, 0x2]'))).toBe(true)
    expect(isRangeTooLarge({ message: 'HTTP request failed.', cause: { message: 'query returned more than 10000 results' } })).toBe(true)
    // observed 2026-10-04 on the canteenapp Arc node: a block-SPAN cap
    expect(isRangeTooLarge(new Error('query exceeds max block range 100000'))).toBe(true)
  })

  it('rejects outages, timeouts, and cyclic causes', () => {
    expect(isRangeTooLarge(new Error('fetch failed'))).toBe(false)
    expect(isRangeTooLarge(new Error('query timeout'))).toBe(false)
    expect(isRangeTooLarge(null)).toBe(false)
    const loop: { message: string; cause?: unknown } = { message: 'x' }
    loop.cause = loop
    expect(isRangeTooLarge(loop)).toBe(false)
  })
})

describe('fetchLogsSplit', () => {
  it('halves a refused range down to single blocks and keeps block order', async () => {
    const calls: [bigint, bigint][] = []
    // the node accepts at most 3 blocks per call
    const fetch = async (from: bigint, to: bigint): Promise<bigint[]> => {
      calls.push([from, to])
      if (to - from + 1n > 3n) throw new Error('query exceeds max results 2000, retry with the range 1-3')
      const out: bigint[] = []
      for (let b = from; b <= to; b++) out.push(b)
      return out
    }
    const logs = await fetchLogsSplit(fetch, 10n, 21n)
    expect(logs).toEqual([10n, 11n, 12n, 13n, 14n, 15n, 16n, 17n, 18n, 19n, 20n, 21n])
    expect(calls[0]).toEqual([10n, 21n])
    expect(calls.every(([f, t]) => t >= f)).toBe(true)
  })

  it('gives up at one block and passes other errors through untouched', async () => {
    await expect(fetchLogsSplit(async (): Promise<bigint[]> => { throw new Error('requested range too large') }, 5n, 5n))
      .rejects.toThrow(/range too large/)
    let n = 0
    await expect(fetchLogsSplit(async (): Promise<bigint[]> => { n++; throw new Error('fetch failed') }, 0n, 1999n))
      .rejects.toThrow(/fetch failed/)
    expect(n).toBe(1)
  })
})

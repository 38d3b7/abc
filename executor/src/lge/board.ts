/**
 * Token board: pure derivation logic for the LGE swap indexer.
 *
 * Ported from the OpenLaunch indexer (alenarc/openlaunch-api) and narrowed
 * to our pools: every pool pairs an LGE token with USDC, so USD prices and
 * volumes come straight off the Swap event — no quote-token conversion.
 * The worker (src/worker/index.ts) owns IO; everything here is testable
 * without chain or DB.
 */

const Q192 = 2n ** 192n

/** Human price of currency1 per 1 currency0 from a v4 sqrtPriceX96. */
export function sqrtPriceToPrice01 (sqrtPriceX96: bigint, decimals0: number, decimals1: number): number {
  if (sqrtPriceX96 <= 0n) return 0
  const raw = Number(sqrtPriceX96 * sqrtPriceX96) / Number(Q192)
  return raw * 10 ** (decimals0 - decimals1)
}

/** USDC per 1 token, given which side of the pool the token sits on. */
export function tokenPriceUsdc (sqrtPriceX96: bigint, tokenIsCurrency0: boolean, tokenDecimals: number, usdcDecimals: number): number {
  if (sqrtPriceX96 <= 0n) return 0
  const [d0, d1] = tokenIsCurrency0 ? [tokenDecimals, usdcDecimals] : [usdcDecimals, tokenDecimals]
  const price01 = sqrtPriceToPrice01(sqrtPriceX96, d0, d1)
  if (price01 <= 0) return 0
  return tokenIsCurrency0 ? price01 : 1 / price01
}

export interface SwapEventArgs {
  amount0: bigint
  amount1: bigint
  sqrtPriceX96: bigint
}

export interface DerivedSwap {
  isBuy: boolean
  /** Human units, absolute. */
  tokenAmount: number
  /** Human USDC, absolute. */
  usdcAmount: number
  priceUsdc: number
}

/**
 * Derive the board row from a PoolManager Swap event. Amounts are pool
 * deltas (negative = pool pays out). A buy is the pool paying the TOKEN
 * out: amount0 < 0 when the token is currency0, amount1 < 0 when it is
 * currency1. Token position comes from the hook's poolKey() at discovery —
 * never assumed.
 */
export function deriveSwap (args: SwapEventArgs, tokenIsCurrency0: boolean, tokenDecimals: number, usdcDecimals: number): DerivedSwap {
  const tokenDelta = tokenIsCurrency0 ? args.amount0 : args.amount1
  const usdcDelta = tokenIsCurrency0 ? args.amount1 : args.amount0
  const abs = (v: bigint): bigint => (v < 0n ? -v : v)
  return {
    isBuy: tokenDelta < 0n,
    tokenAmount: Number(abs(tokenDelta)) / 10 ** tokenDecimals,
    usdcAmount: Number(abs(usdcDelta)) / 10 ** usdcDecimals,
    priceUsdc: tokenPriceUsdc(args.sqrtPriceX96, tokenIsCurrency0, tokenDecimals, usdcDecimals)
  }
}

// ------------------------------------------------------------------
// Range halving (ported from openlaunch-api log-range.ts): Arc's public
// RPC caps eth_getLogs at 2000 results and refuses bigger answers.
// ------------------------------------------------------------------

// deliberately not "query timeout": an overloaded node times out on every range, and bisecting it 2000 → 1 would only multiply the calls
// "max block range": the canteenapp Arc node caps the SPAN (100k blocks);
// the result-count variants cap the ANSWER size (public Arc node: 2000).
const TOO_LARGE = /range too large|max allowed range|max block range|exceeds max results|more than \d+ results|response size exceeded|too many (results|logs)/i

/** True when the node refused the query for its size (as opposed to failing outright). */
export function isRangeTooLarge (err: unknown): boolean {
  const seen = new Set<unknown>()
  let cur: unknown = err
  // viem wraps the RPC error a few layers deep: check every message along the cause chain
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur)
    const e = cur as { message?: unknown; details?: unknown; cause?: unknown }
    for (const text of [e.message, e.details]) if (typeof text === 'string' && TOO_LARGE.test(text)) return true
    cur = e.cause
  }
  return typeof err === 'string' && TOO_LARGE.test(err)
}

/** Fetch logs over [from, to]; halve the range whenever the node refuses on
 *  size, down to a single block. Other errors propagate. Block order kept. */
export async function fetchLogsSplit<T> (fetch: (from: bigint, to: bigint) => Promise<T[]>, from: bigint, to: bigint): Promise<T[]> {
  try {
    return await fetch(from, to)
  } catch (err) {
    if (to <= from || !isRangeTooLarge(err)) throw err
    const mid = from + (to - from) / 2n
    const left = await fetchLogsSplit(fetch, from, mid)
    const right = await fetchLogsSplit(fetch, mid + 1n, to)
    return [...left, ...right]
  }
}

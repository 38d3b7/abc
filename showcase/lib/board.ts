/**
 * Live tokens — from the executor's public indexer API (the worker indexes
 * PoolManager.Swap per LGE pool; history-derived data cannot come from
 * chain-state reads). The executor down = an empty board, not a broken page.
 */

const EXECUTOR_URL = process.env.EXECUTOR_URL ?? 'http://localhost:8787'

export interface BoardToken {
  hookAddress: string
  tokenAddress: string
  poolId: string | null
  name: string | null
  symbol: string | null
  launchPriceUsdc: number | null
  priceUsdc: number | null
  mcapUsdc: number | null
  volume24hUsdc: number
  trades24h: number
  buys24h: number
  sells24h: number
  traders24h: number
  totalTrades: number
  agentSlug: string | null
  agentName: string | null
}

export interface BoardSwap {
  txHash: string
  hookAddress: string
  symbol: string | null
  blockTs: string | null
  trader: string | null
  isBuy: boolean
  tokenAmount: number
  usdcAmount: number
  priceUsdc: number | null
}

export interface Board {
  tokens: BoardToken[]
  activity: BoardSwap[]
  /** False when the executor was unreachable — the section says so. */
  live: boolean
}

export async function fetchBoard (): Promise<Board> {
  try {
    const [tokensRes, activityRes] = await Promise.all([
      fetch(`${EXECUTOR_URL}/public/tokens`, { cache: 'no-store' }),
      fetch(`${EXECUTOR_URL}/public/activity?limit=25`, { cache: 'no-store' })
    ])
    if (!tokensRes.ok || !activityRes.ok) return { tokens: [], activity: [], live: false }
    const tokens = await tokensRes.json() as { tokens: BoardToken[] }
    const activity = await activityRes.json() as { swaps: BoardSwap[] }
    return { tokens: tokens.tokens, activity: activity.swaps, live: true }
  } catch {
    return { tokens: [], activity: [], live: false }
  }
}

/**
 * Public token board endpoints: /public/tokens and /public/activity are
 * open paths (the apex site is unauthenticated), read-only, and shaped for
 * the board. Everything else stays behind auth.
 */

import { describe, it, expect, beforeEach } from 'vitest'

process.env.ABC_API_KEY = 'dev-key'
process.env.ABC_SESSION_SECRET = 'dev-session-secret'

const { createApp } = await import('./helpers.js')
const { MemoryStore } = await import('../src/db/memory.js')

let app: Awaited<ReturnType<typeof createApp>>
let store: InstanceType<typeof MemoryStore>

const HOOK_A = '0xaaaa000000000000000000000000000000000001'
const HOOK_B = '0xbbbb000000000000000000000000000000000002'

function seed () {
  store.seedLgeToken({
    hookAddress: HOOK_A,
    tokenAddress: '0x1111000000000000000000000000000000000001',
    poolId: '0xpoola',
    name: 'Alpha Token',
    symbol: 'ALPHA',
    launchPriceUsdc: 0.01,
    priceUsdc: 0.02,
    mcapUsdc: 20_000,
    volume24hUsdc: 0,
    trades24h: 0,
    buys24h: 0,
    sells24h: 0,
    traders24h: 0,
    totalTrades: 0,
    agentSlug: 'alpha',
    agentName: 'Alpha'
  })
  store.seedLgeToken({
    hookAddress: HOOK_B,
    tokenAddress: '0x1111000000000000000000000000000000000002',
    poolId: '0xpoolb',
    name: 'Beta Token',
    symbol: 'BETA',
    launchPriceUsdc: 0.5,
    priceUsdc: 0.25,
    mcapUsdc: 250_000,
    volume24hUsdc: 0,
    trades24h: 0,
    buys24h: 0,
    sells24h: 0,
    traders24h: 0,
    totalTrades: 0,
    agentSlug: null,
    agentName: null
  })
  const now = Date.now()
  store.seedLgeSwap({
    txHash: '0xtx1', logIndex: 0, hookAddress: HOOK_A, symbol: 'ALPHA',
    blockNumber: '100', blockTs: new Date(now - 3600_000).toISOString(),
    trader: '0xtrader1', isBuy: true, tokenAmount: 1000, usdcAmount: 20, priceUsdc: 0.02
  })
  store.seedLgeSwap({
    txHash: '0xtx2', logIndex: 0, hookAddress: HOOK_A, symbol: 'ALPHA',
    blockNumber: '101', blockTs: new Date(now - 1800_000).toISOString(),
    trader: '0xtrader2', isBuy: false, tokenAmount: 500, usdcAmount: 10, priceUsdc: 0.02
  })
  store.seedLgeSwap({
    txHash: '0xtx3', logIndex: 1, hookAddress: HOOK_B, symbol: 'BETA',
    blockNumber: '102', blockTs: new Date(now - 60_000).toISOString(),
    trader: '0xtrader1', isBuy: true, tokenAmount: 40, usdcAmount: 10, priceUsdc: 0.25
  })
}

beforeEach(() => {
  store = new MemoryStore()
  seed()
  app = createApp(store)
})

describe('public board endpoints', () => {
  it('serves /public/tokens with no credentials at all', async () => {
    const res = await app.request('/public/tokens')
    expect(res.status).toBe(200)
    const { tokens } = await res.json() as { tokens: { symbol: string }[] }
    expect(tokens.map(t => t.symbol).sort()).toEqual(['ALPHA', 'BETA'])
  })

  it('derives 24h windows from the swap rows, ranked by volume', async () => {
    const res = await app.request('/public/tokens')
    const { tokens } = await res.json() as {
      tokens: { symbol: string; volume24hUsdc: number; trades24h: number; buys24h: number; sells24h: number; traders24h: number; totalTrades: number }[]
    }
    // ALPHA: $30 across 2 trades; BETA: $10 across 1 → ALPHA first.
    expect(tokens[0]!.symbol).toBe('ALPHA')
    expect(tokens[0]!.volume24hUsdc).toBeCloseTo(30, 6)
    expect(tokens[0]!.trades24h).toBe(2)
    expect(tokens[0]!.buys24h).toBe(1)
    expect(tokens[0]!.sells24h).toBe(1)
    expect(tokens[0]!.traders24h).toBe(2)
    expect(tokens[0]!.totalTrades).toBe(2)
    expect(tokens[1]!.symbol).toBe('BETA')
    expect(tokens[1]!.volume24hUsdc).toBeCloseTo(10, 6)
  })

  it('serves the activity tape newest-first, no auth', async () => {
    const res = await app.request('/public/activity')
    expect(res.status).toBe(200)
    const { swaps } = await res.json() as { swaps: { txHash: string; isBuy: boolean }[] }
    expect(swaps.map(s => s.txHash)).toEqual(['0xtx3', '0xtx2', '0xtx1'])
  })

  it('honours the activity limit', async () => {
    const res = await app.request('/public/activity?limit=2')
    const { swaps } = await res.json() as { swaps: unknown[] }
    expect(swaps).toHaveLength(2)
  })

  it('empty state is an empty list, not an error', async () => {
    const empty = createApp(new MemoryStore())
    const res = await empty.request('/public/tokens')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tokens: [] })
  })

  it('the rest of the API still requires auth', async () => {
    expect((await app.request('/agents')).status).toBe(401)
  })
})

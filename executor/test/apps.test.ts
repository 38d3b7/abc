/**
 * Phase 3: effect intents (get_balances, lge_quote, app_publish, app_edit),
 * the lge_launch pipeline path (mine -> intent -> FINAL -> campaign), loop
 * tool gating behind capability skills, the apps store, and the freshness
 * gate for the executor's vendored contract artifacts.
 *
 * Chain doubles encode observed behaviour: FLAGS is a uint160 read (32-byte
 * word), getCode returns undefined on empty addresses, estimateGas succeeds
 * for well-formed calldata — the shapes viem returned against Arc testnet
 * during the WLK3 walkthrough and the phase-1 live runs.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { MockLanguageModelV4 } from 'ai/test'
import { MemoryStore } from '../src/db/memory.js'
import { PipelineRunner, type ChainReader } from '../src/pipeline/runner.js'
import { QuoteSigner } from '../src/quotes/sign.js'
import type { SignerAdapter } from '../src/signer/types.js'
import { assertTransition, IllegalTransition } from '../src/pipeline/states.js'
import { runAgentLoop } from '../src/agent/loop.js'
import { prepareLaunch } from '../src/lge/launch.js'
import type { AppRow } from '../src/db/store.js'

const WALLET = '0x00000000000000000000000000000000000000AA'
const HOOK = '0x0000000000000000000000000000000000000F00'

const MOCK_USAGE = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined }
}

/** FLAGS = 0: the mining loop targets low-14-bits == 0. */
const FLAGS_ZERO = `0x${0n.toString(16).padStart(64, '0')}` as `0x${string}`

function fakeChain (over: Partial<ChainReader> = {}): ChainReader {
  return {
    estimateGas: async () => 21_000n,
    call: async () => ({ data: FLAGS_ZERO }),
    waitForTransactionReceipt: async () => ({ status: 'success', transactionHash: '0xabc' }),
    getBalance: async () => 10n ** 18n,
    getBlockNumber: async () => 1_000_000n,
    getCode: async () => undefined,
    ...over
  }
}

function fakeSigner (): SignerAdapter {
  return {
    name: 'fake',
    ensureWallet: async () => ({ address: WALLET, providerRef: 'fake' }),
    send: async () => ({ kind: 'sent', txHash: `0x${'ab'.repeat(32)}` })
  }
}

async function setup (pushCapture?: AppRow[]) {
  const store = new MemoryStore()
  const agent = await store.createAgent('Test', 'test')
  await store.registerWallet(agent.id, WALLET, 'local_dev', 'fake')
  const quoteSigner = await QuoteSigner.create()
  const runner = new PipelineRunner({
    store,
    signer: fakeSigner(),
    chain: fakeChain(),
    quoteSigner,
    chainId: 5_042_002,
    policy: { confirmationThresholdWei: 10n ** 30n },
    ...(pushCapture
      ? {
          pushApp: async (app: AppRow) => {
            pushCapture.length = 0
            pushCapture.push(app)
          }
        }
      : {})
  })
  return { store, agent, quoteSigner, runner }
}

describe('effect state edge', () => {
  it('POLICY_PASSED -> FINAL is legal (effect intents settle off-chain)', () => {
    expect(() => assertTransition('POLICY_PASSED', 'FINAL')).not.toThrow()
  })

  it('POLICY_PASSED -> QUOTED is still illegal', () => {
    expect(() => assertTransition('POLICY_PASSED', 'QUOTED')).toThrow(IllegalTransition)
  })
})

describe('read effects', () => {
  let ctx: Awaited<ReturnType<typeof setup>>
  beforeEach(async () => { ctx = await setup() })

  it('get_balances settles FINAL with balances in the simulation record', async () => {
    const row = await ctx.runner.runIntent(ctx.agent.id, WALLET, 'get_balances', {}, {
      text: 'check balances', signature: 'sig'
    })
    expect(row.state).toBe('FINAL')
    const sim = row.simulation as { ok: boolean; effect: { nativeUsdcWei: string; erc20Usdc6: string } }
    expect(sim.ok).toBe(true)
    expect(sim.effect.nativeUsdcWei).toBe((10n ** 18n).toString())
    expect(sim.effect.erc20Usdc6).toBeDefined()
  })

  it('lge_quote settles FINAL with a priced quote', async () => {
    // currentTokenPrice = 20000 tokens/USDC (32-byte uint, as eth_call returns)
    const priceWord = `0x${(20_000n).toString(16).padStart(64, '0')}` as `0x${string}`
    const store = new MemoryStore()
    const agent = await store.createAgent('Test', 'test')
    await store.registerWallet(agent.id, WALLET, 'local_dev', 'fake')
    const quoteSigner = await QuoteSigner.create()
    const runner = new PipelineRunner({
      store, signer: fakeSigner(),
      chain: fakeChain({ call: async () => ({ data: priceWord }) }),
      quoteSigner, chainId: 5_042_002,
      policy: { confirmationThresholdWei: 10n ** 30n }
    })
    const row = await runner.runIntent(agent.id, WALLET, 'lge_quote', {
      hook: HOOK, amountOfTokens: '1000'
    }, { text: 'price check', signature: 'sig' })
    expect(row.state).toBe('FINAL')
    const sim = row.simulation as { ok: boolean; effect: { currentTokenPrice: string; valueWei: string } }
    expect(sim.ok).toBe(true)
    expect(sim.effect.currentTokenPrice).toBe('20000')
    // 1000 tokens at 20000 tokens/USDC = 0.05 USDC = 5e16 wei
    expect(sim.effect.valueWei).toBe((5n * 10n ** 16n).toString())
  })

  it('read effects write no ledger rows', async () => {
    await ctx.runner.runIntent(ctx.agent.id, WALLET, 'get_balances', {}, { text: 'r', signature: 's' })
    const ledger = await ctx.store.listLedger(ctx.agent.id)
    expect(ledger).toHaveLength(0)
  })
})

describe('app effects', () => {
  it('app_publish upserts the app, pushes it, and books a ledger note', async () => {
    const pushed: AppRow[] = []
    const { store, agent, runner } = await setup(pushed)

    const row = await runner.runIntent(agent.id, WALLET, 'app_publish', {
      name: 'Atlas Trading',
      tagline: 'Systematic macro',
      idea: 'Trades the basis.',
      roadmap: [{ text: 'Launch token', done: false }],
      links: [{ label: 'docs', url: 'https://example.com' }]
    }, { text: 'publish the storefront', signature: 'sig' })

    expect(row.state).toBe('FINAL')
    const sim = row.simulation as { effect: { slug: string; url: string } }
    expect(sim.effect.slug).toBe('test')
    expect(sim.effect.url).toBe('https://test.pumperp.com')

    const app = await store.getApp(agent.id)
    expect(app).toMatchObject({ name: 'Atlas Trading', tagline: 'Systematic macro', published: true })
    expect(pushed).toHaveLength(1)
    expect(pushed[0]!.slug).toBe('test')

    const ledger = await store.listLedger(agent.id)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({ note: 'app published', direction: 'debit' })
  })

  it('app_edit changes one field and the ledger note names it', async () => {
    const pushed: AppRow[] = []
    const { store, agent, runner } = await setup(pushed)
    await runner.runIntent(agent.id, WALLET, 'app_publish', {
      name: 'Atlas', tagline: '', idea: '', roadmap: [], links: []
    }, { text: 'publish', signature: 'sig' })

    const row = await runner.runIntent(agent.id, WALLET, 'app_edit', {
      field: 'tagline', value: 'New tagline'
    }, { text: 'sharpen the pitch', signature: 'sig' })

    expect(row.state).toBe('FINAL')
    const app = await store.getApp(agent.id)
    expect(app!.tagline).toBe('New tagline')
    const ledger = await store.listLedger(agent.id)
    // newest first (pg parity: ORDER BY id DESC)
    expect(ledger.map(l => l.note)).toEqual(['app field tagline changed', 'app published'])
    expect(pushed).toHaveLength(1) // last push carries the edit
    expect(pushed[0]!.tagline).toBe('New tagline')
  })

  it('app_edit before publish DROPPEDs with a named reason', async () => {
    const { agent, runner } = await setup()
    const row = await runner.runIntent(agent.id, WALLET, 'app_edit', {
      field: 'tagline', value: 'x'
    }, { text: 'edit nothing', signature: 'sig' })
    expect(row.state).toBe('DROPPED')
    expect(row.error).toContain('publish first')
  })

  it('app_edit validates the value shape per field', async () => {
    const { agent, runner } = await setup()
    await runner.runIntent(agent.id, WALLET, 'app_publish', {
      name: 'A', tagline: '', idea: '', roadmap: [], links: []
    }, { text: 'publish', signature: 'sig' })
    const row = await runner.runIntent(agent.id, WALLET, 'app_edit', {
      field: 'roadmap', value: 'not-an-array'
    }, { text: 'bad edit', signature: 'sig' })
    expect(row.state).toBe('DROPPED')
  })

  it('a failing push DROPPEDs the intent', async () => {
    const store = new MemoryStore()
    const agent = await store.createAgent('Test', 'test')
    await store.registerWallet(agent.id, WALLET, 'local_dev', 'fake')
    const quoteSigner = await QuoteSigner.create()
    const runner = new PipelineRunner({
      store, signer: fakeSigner(), chain: fakeChain(), quoteSigner,
      chainId: 5_042_002,
      pushApp: async () => { throw new Error('showcase 502') }
    })
    const row = await runner.runIntent(agent.id, WALLET, 'app_publish', {
      name: 'A', tagline: '', idea: '', roadmap: [], links: []
    }, { text: 'publish', signature: 'sig' })
    expect(row.state).toBe('DROPPED')
    expect(row.error).toContain('showcase 502')
  })
})

describe('lge_launch', () => {
  it('mines a launch deterministically against the fake chain', async () => {
    const prepared = await prepareLaunch(fakeChain(), 5_042_002, WALLET, {
      name: 'Atlas Token',
      symbol: 'ATLAS',
      capWei: (10n ** 27n).toString(),
      streamBlocks: '14400',
      minTokenPrice: '20000',
      maxTokenPrice: '2000',
      feeBps: 100
    })
    expect(prepared.tokenAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(prepared.hookAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)
    // FLAGS = 0 -> hook address low 14 bits are zero
    expect(BigInt(prepared.hookAddress) & 0x3fffn).toBe(0n)
    expect(BigInt(prepared.startBlock)).toBe(1_000_020n)
  })

  it('runs end to end: FINAL with the campaign registered', async () => {
    const { store, agent, runner } = await setup()
    const prepared = await runner.prepareLaunch(WALLET, {
      name: 'Atlas Token',
      symbol: 'ATLAS',
      capWei: (10n ** 27n).toString(),
      streamBlocks: '14400',
      minTokenPrice: '20000',
      maxTokenPrice: '2000',
      feeBps: 100
    })
    const row = await runner.runIntent(agent.id, WALLET, 'lge_launch', { ...prepared }, {
      text: 'launch the raise', signature: 'sig'
    })
    expect(row.state).toBe('FINAL')
    const campaigns = await store.listCampaigns(agent.id)
    expect(campaigns).toHaveLength(1)
    expect(campaigns[0]).toMatchObject({
      tokenAddress: prepared.tokenAddress,
      hookAddress: prepared.hookAddress,
      name: 'Atlas Token',
      symbol: 'ATLAS'
    })
  })
})

describe('loop tool gating', () => {
  function captureModel (): { model: MockLanguageModelV4; seen: () => string } {
    let seen = ''
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        seen = JSON.stringify(opts.tools?.map(t => t.name))
        return {
          content: [{ type: 'text', text: 'ok' }],
          finishReason: { unified: 'stop', raw: undefined },
          usage: MOCK_USAGE,
          warnings: []
        }
      }
    })
    return { model, seen: () => seen }
  }

  it('without capability skills only the base read tools are offered', async () => {
    const { store, agent, runner, quoteSigner } = await setup()
    const { model, seen } = captureModel()
    await runAgentLoop({ store, runner, agent, prompt: 'hi', quoteSigner, model })
    expect(seen()).toContain('get_balances')
    expect(seen()).toContain('lge_quote')
    expect(seen()).not.toContain('transfer')
    expect(seen()).not.toContain('lge_launch')
    expect(seen()).not.toContain('app_publish')
  })

  it('enabled capability skills grant their intent types', async () => {
    const { store, agent, runner, quoteSigner } = await setup()
    await store.installAgentSkill(agent.id, 'treasury-ops')
    await store.installAgentSkill(agent.id, 'app-builder')
    const { model, seen } = captureModel()
    await runAgentLoop({ store, runner, agent, prompt: 'hi', quoteSigner, model })
    expect(seen()).toContain('transfer')
    expect(seen()).toContain('fund_gas')
    expect(seen()).toContain('app_publish')
    expect(seen()).not.toContain('lge_launch') // token-launch not installed
  })

  it('a disabled skill revokes its grants', async () => {
    const { store, agent, runner, quoteSigner } = await setup()
    await store.installAgentSkill(agent.id, 'treasury-ops')
    await store.setAgentSkillEnabled(agent.id, 'treasury-ops', false)
    const { model, seen } = captureModel()
    await runAgentLoop({ store, runner, agent, prompt: 'hi', quoteSigner, model })
    expect(seen()).not.toContain('transfer')
  })
})

describe('app + ledger read routes', () => {
  it('GET /agents/:id/app 404s before publish and returns the record after', async () => {
    const pushed: AppRow[] = []
    const { store, agent, runner } = await setup(pushed)
    const { createApp } = await import('../src/api/server.js')
    const app = createApp({ store, runner, signer: fakeSigner() })
    const auth = { 'x-abc-key': 'dev-key' }

    const before = await app.request(`/agents/${agent.id}/app`, { headers: auth })
    expect(before.status).toBe(404)

    await runner.runIntent(agent.id, WALLET, 'app_publish', {
      name: 'Atlas', tagline: 't', idea: '', roadmap: [], links: []
    }, { text: 'publish', signature: 'sig' })

    const after = await app.request(`/agents/${agent.id}/app`, { headers: auth })
    expect(after.status).toBe(200)
    const body = await after.json() as { name: string; slug: string }
    expect(body).toMatchObject({ name: 'Atlas', slug: 'test' })

    const entries = await app.request(`/agents/${agent.id}/ledger/entries`, { headers: auth })
    const ledgerBody = await entries.json() as { entries: Array<{ note: string; amount: { usdc6: string } }> }
    expect(ledgerBody.entries[0]).toMatchObject({ note: 'app published', amount: { usdc6: '0' } })
  })
})

describe('vendored artifact freshness', () => {
  // The executor's src/lge artifacts are GENERATED by
  // contracts/script/sync-console.mjs from the same build as the console's.
  // Drift between the two is a launch-calldata bug; compare bytes.
  const pairs: Array<[string, string]> = [
    ['abis/LGEManagerAbi.ts', 'LGEManagerAbi.ts'],
    ['bytecode/LGEHookBytecode.ts', 'LGEHookBytecode.ts'],
    ['bytecode/LGETokenBytecode.ts', 'LGETokenBytecode.ts'],
    ['addresses.ts', 'addresses.ts']
  ]
  for (const [consoleRel, execRel] of pairs) {
    it(`executor/src/lge/${execRel} byte-equals the console artifact`, () => {
      const consoleFile = readFileSync(`${__dirname}/../../console/src/config/contracts/${consoleRel}`, 'utf8')
      const execFile = readFileSync(`${__dirname}/../src/lge/${execRel}`, 'utf8')
      expect(execFile).toBe(consoleFile)
    })
  }
})

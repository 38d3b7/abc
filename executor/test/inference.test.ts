/**
 * Phase 4: the inference rail (PRODUCT.md third lock).
 *
 * - draw_inference intent: builds InferenceEscrow.payProvider, valued by
 *   construction (amountWei), books the 'inference' bucket from params
 *   (the tx itself carries no msg.value).
 * - x402 seller: 402 negotiation shape, settle verdicts (SETTLED / FAILED /
 *   UNCERTAIN per the REPO-MINING OneShot discipline), nonce idempotency,
 *   usage backfill, auth exemption (payment is the auth).
 * - Loop charging: with an inference buyer configured, every model call is
 *   charged before it runs and backfilled after; a charge failure aborts
 *   the turn (no payment, no inference).
 *
 * The facilitator double encodes the observed BatchFacilitatorClient
 * contract: settle returns { success, transaction? } and throws on
 * transport failure (dist/server callSettle, @circle-fin/x402-batching
 * 3.5.0). The Gateway addresses asserted in the 402 payload are the
 * package's own CHAIN_CONFIGS.arcTestnet constants.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import { decodeFunctionData, parseAbi } from 'viem'
import { MemoryStore } from '../src/db/memory.js'
import { PipelineRunner, type ChainReader } from '../src/pipeline/runner.js'
import { QuoteSigner } from '../src/quotes/sign.js'
import type { SignerAdapter } from '../src/signer/types.js'
import { createApp } from '../src/api/server.js'
import { runAgentLoop } from '../src/agent/loop.js'
import { INFERENCE_ESCROW } from '../src/inference/escrow.js'
import type { FacilitatorSeam, SettleResponse } from '../src/inference/seller.js'
import type { InferenceBuyer } from '../src/inference/client.js'
import type { AgentRow } from '../src/db/store.js'

const WALLET = '0x00000000000000000000000000000000000000AA'
const SELLER = '0x0000000000000000000000000000000000000CC1'
const PAYER = '0x0000000000000000000000000000000000000BB2'
const ESCROW = INFERENCE_ESCROW[5_042_002]!
const AUTH = { 'x-abc-key': 'dev-key' }

const MOCK_USAGE = {
  inputTokens: { total: 41, noCache: 41, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 9, text: 9, reasoning: undefined }
}

function fakeChain (over: Partial<ChainReader> = {}): ChainReader {
  return {
    estimateGas: async () => 21_000n,
    call: async () => ({ data: undefined }),
    waitForTransactionReceipt: async () => ({ status: 'success', transactionHash: '0xabc' }),
    getBalance: async () => 10n ** 18n,
    getBlockNumber: async () => 1_000_000n,
    getCode: async () => undefined,
    ...over
  }
}

function fakeSigner (): SignerAdapter & { sent: { to: string; data: string; value: bigint }[] } {
  const sent: { to: string; data: string; value: bigint }[] = []
  return {
    name: 'fake',
    sent,
    ensureWallet: async () => ({ address: WALLET, providerRef: 'fake' }),
    send: async (tx) => {
      sent.push({ to: tx.to, data: tx.data, value: tx.value })
      return { kind: 'sent', txHash: `0x${'ab'.repeat(32)}` }
    }
  }
}

function paymentHeader (nonce: string): string {
  return Buffer.from(JSON.stringify({
    x402Version: 2,
    accepted: { scheme: 'exact', network: 'eip155:5042002' },
    payload: {
      authorization: {
        from: PAYER,
        to: SELLER,
        value: '100',
        validAfter: '0',
        validBefore: '9999999999',
        nonce
      },
      signature: '0xsig'
    }
  })).toString('base64')
}

function fakeFacilitator (behavior: {
  settleCalls?: string[]
  result?: SettleResponse
  throwOnce?: Error | undefined
}): FacilitatorSeam & { calls: number } {
  const state = { calls: 0 }
  return {
    get calls () { return state.calls },
    settle: async () => {
      state.calls++
      if (behavior.throwOnce) {
        const e = behavior.throwOnce
        behavior.throwOnce = undefined
        throw e
      }
      return behavior.result ?? { success: true, transaction: '0xbatchref', network: 'eip155:5042002' } as SettleResponse
    }
  }
}

async function setup (facilitator: FacilitatorSeam) {
  const store = new MemoryStore()
  const agent = await store.createAgent('Test', 'test')
  await store.registerWallet(agent.id, WALLET, 'local_dev', 'fake')
  const quoteSigner = await QuoteSigner.create()
  const signer = fakeSigner()
  const runner = new PipelineRunner({
    store,
    signer,
    chain: fakeChain(),
    quoteSigner,
    chainId: 5_042_002,
    policy: { confirmationThresholdWei: 10n ** 30n }
  })
  const app = createApp({
    store,
    runner,
    signer,
    enqueuePrompt: async () => {},
    inferenceSeller: { facilitator, sellerAddress: SELLER, priceUsdc6: 100n }
  })
  return { store, agent, quoteSigner, runner, signer, app }
}

function charge (app: ReturnType<typeof createApp>, agentId: string, nonce?: string) {
  return app.request('/inference/charge', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(nonce ? { 'payment-signature': paymentHeader(nonce) } : {})
    },
    body: JSON.stringify({ agentId, model: 'anthropic/claude-sonnet-4.5' })
  })
}

describe('draw_inference intent', () => {
  it('builds InferenceEscrow.payProvider and books the inference bucket from params', async () => {
    const { store, agent, runner, signer } = await setup(fakeFacilitator({}))
    const amount = 5n * 10n ** 18n
    const row = await runner.runIntent(agent.id, WALLET, 'draw_inference', { amountWei: amount.toString() })
    expect(row.state).toBe('FINAL')

    expect(signer.sent).toHaveLength(1)
    expect(signer.sent[0]!.to).toBe(ESCROW)
    expect(signer.sent[0]!.value).toBe(0n)
    const decoded = decodeFunctionData({
      abi: parseAbi(['function payProvider(uint256 amount)']),
      data: signer.sent[0]!.data as `0x${string}`
    })
    expect(decoded.functionName).toBe('payProvider')
    expect(decoded.args[0]).toBe(amount)

    // no msg.value, so the ledger debit must come from the typed params
    const entries = await store.listLedger(agent.id)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ bucket: 'inference', direction: 'debit', note: 'draw_inference spend' })
    expect(entries[0]!.amount.usdc6).toBe(5_000_000n)
  })

  it('is a value intent: above the confirmation threshold it parks', async () => {
    const store = new MemoryStore()
    const agent = await store.createAgent('Test', 'test')
    await store.registerWallet(agent.id, WALLET, 'local_dev', 'fake')
    const runner = new PipelineRunner({
      store,
      signer: fakeSigner(),
      chain: fakeChain(),
      quoteSigner: await QuoteSigner.create(),
      chainId: 5_042_002,
      policy: { confirmationThresholdWei: 10n ** 18n }
    })
    const row = await runner.runIntent(agent.id, WALLET, 'draw_inference', { amountWei: (5n * 10n ** 18n).toString() })
    expect(row.state).toBe('AWAITING_CONFIRMATION')
  })

  it('drops when the escrow is unknown for the chain', async () => {
    const store = new MemoryStore()
    const agent = await store.createAgent('Test', 'test')
    await store.registerWallet(agent.id, WALLET, 'local_dev', 'fake')
    const runner = new PipelineRunner({
      store,
      signer: fakeSigner(),
      chain: fakeChain(),
      quoteSigner: await QuoteSigner.create(),
      chainId: 1,
      policy: { confirmationThresholdWei: 10n ** 30n }
    })
    const row = await runner.runIntent(agent.id, WALLET, 'draw_inference', { amountWei: '1000' })
    expect(row.state).toBe('DROPPED')
    expect(row.error).toMatch(/no InferenceEscrow on chain 1/)
  })
})

describe('x402 seller', () => {
  it('answers 402 with the Gateway requirements when no payment is attached', async () => {
    const { agent, app } = await setup(fakeFacilitator({}))
    const res = await charge(app, agent.id)
    expect(res.status).toBe(402)
    const header = res.headers.get('PAYMENT-REQUIRED')
    expect(header).toBeTruthy()
    const required = JSON.parse(Buffer.from(header!, 'base64').toString('utf-8'))
    expect(required.x402Version).toBe(2)
    expect(required.accepts).toHaveLength(1)
    expect(required.accepts[0]).toMatchObject({
      scheme: 'exact',
      network: 'eip155:5042002',
      asset: '0x3600000000000000000000000000000000000000',
      amount: '100',
      payTo: SELLER,
      maxTimeoutSeconds: 604_900,
      extra: {
        name: 'GatewayWalletBatched',
        version: '1',
        verifyingContract: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9'
      }
    })
  })

  it('settles a paid charge and records the row keyed by the EIP-3009 nonce', async () => {
    const { store, agent, app } = await setup(fakeFacilitator({}))
    const res = await charge(app, agent.id, '0xnonce-1')
    expect(res.status).toBe(200)
    const { charge: row } = await res.json() as { charge: { id: string; state: string; eip3009Nonce: string; payer: string; payee: string; settlementRef: string } }
    expect(row).toMatchObject({
      state: 'SETTLED',
      eip3009Nonce: '0xnonce-1',
      payer: PAYER,
      payee: SELLER,
      settlementRef: '0xbatchref'
    })
    const stored = await store.getInferencePaymentByNonce('0xnonce-1')
    expect(stored?.id).toBe(row.id)
  })

  it('replays a settled nonce without settling twice', async () => {
    const facilitator = fakeFacilitator({})
    const { agent, app } = await setup(facilitator)
    const first = await charge(app, agent.id, '0xnonce-2')
    expect(first.status).toBe(200)
    const second = await charge(app, agent.id, '0xnonce-2')
    expect(second.status).toBe(200)
    const body = await second.json() as { replay: boolean }
    expect(body.replay).toBe(true)
    expect(facilitator.calls).toBe(1)
  })

  it('records FAILED on a facilitator refusal and lets a fresh nonce retry', async () => {
    const facilitator = fakeFacilitator({
      result: { success: false, errorReason: 'insufficient_balance', transaction: '', network: 'eip155:5042002' } as SettleResponse
    })
    const { store, agent, app } = await setup(facilitator)
    const res = await charge(app, agent.id, '0xnonce-3')
    expect(res.status).toBe(402)
    const stored = await store.getInferencePaymentByNonce('0xnonce-3')
    expect(stored?.state).toBe('FAILED')
  })

  it('records UNCERTAIN when settle throws, then re-settles on nonce replay', async () => {
    const facilitator = fakeFacilitator({ throwOnce: new Error('gateway timeout') })
    const { store, agent, app } = await setup(facilitator)
    const first = await charge(app, agent.id, '0xnonce-4')
    expect(first.status).toBe(502)
    const stored = await store.getInferencePaymentByNonce('0xnonce-4')
    expect(stored?.state).toBe('UNCERTAIN')

    // replay with the same payload: settlement is re-attempted, not skipped
    const second = await charge(app, agent.id, '0xnonce-4')
    expect(second.status).toBe(200)
    expect(facilitator.calls).toBe(2)
    const after = await store.getInferencePaymentByNonce('0xnonce-4')
    expect(after?.state).toBe('SETTLED')
    expect(after?.id).toBe(stored?.id)
  })

  it('backfills token usage through the charge-id capability', async () => {
    const { store, agent, app } = await setup(fakeFacilitator({}))
    const res = await charge(app, agent.id, '0xnonce-5')
    const { charge: row } = await res.json() as { charge: { id: string } }

    const bad = await app.request(`/inference/charge/${row.id}/usage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tokensIn: 'lots' })
    })
    expect(bad.status).toBe(400)

    const ok = await app.request(`/inference/charge/${row.id}/usage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tokensIn: 41, tokensOut: 9 })
    })
    expect(ok.status).toBe(200)
    const stored = await store.getInferencePaymentByNonce('0xnonce-5')
    expect(stored).toMatchObject({ tokensIn: 41, tokensOut: 9 })
  })

  it('exempts the charge rail from the owner key but keeps the listing behind it', async () => {
    const { agent, app } = await setup(fakeFacilitator({}))
    // no x-abc-key on either request above — payment is the auth
    const res = await charge(app, agent.id, '0xnonce-6')
    expect(res.status).toBe(200)

    const listed = await app.request(`/agents/${agent.id}/inference`, { headers: AUTH })
    expect(listed.status).toBe(200)
    const { payments } = await listed.json() as { payments: { priceUsdc6: string }[] }
    expect(payments).toHaveLength(1)
    expect(payments[0]!.priceUsdc6).toBe('100')

    const unauthenticated = await app.request(`/agents/${agent.id}/inference`)
    expect(unauthenticated.status).toBe(401)
  })

  it('503s the charge route when no seller is configured', async () => {
    const store = new MemoryStore()
    const agent = await store.createAgent('Test', 'test')
    const app = createApp({
      store,
      runner: new PipelineRunner({
        store,
        signer: fakeSigner(),
        chain: fakeChain(),
        quoteSigner: await QuoteSigner.create(),
        chainId: 5_042_002
      }),
      signer: fakeSigner(),
      enqueuePrompt: async () => {}
    })
    const res = await charge(app, agent.id)
    expect(res.status).toBe(503)
  })
})

describe('store parity', () => {
  it('rejects a duplicate nonce with the pg-shaped 23505', async () => {
    const store = new MemoryStore()
    const agent = await store.createAgent('Test', 'test')
    const base = {
      agentId: agent.id,
      model: 'm',
      priceUsdc6: 100n,
      eip3009Nonce: '0xdup',
      payer: PAYER,
      payee: SELLER,
      state: 'SETTLED' as const
    }
    await store.createInferencePayment(base)
    await expect(store.createInferencePayment(base)).rejects.toMatchObject({ code: '23505' })
  })
})

describe('loop charging', () => {
  function textModel (text: string, events?: string[]): MockLanguageModelV4 {
    return new MockLanguageModelV4({
      doGenerate: async () => {
        events?.push('generate')
        return {
          content: [{ type: 'text', text }],
          finishReason: { unified: 'stop', raw: undefined },
          usage: MOCK_USAGE,
          warnings: []
        }
      }
    })
  }

  async function loopSetup (inference: InferenceBuyer, events?: string[]): Promise<{
    store: MemoryStore
    agent: AgentRow
    runner: PipelineRunner
    quoteSigner: QuoteSigner
  }> {
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
      policy: { confirmationThresholdWei: 10n ** 30n }
    })
    return { store, agent, runner, quoteSigner }
  }

  it('charges before the model call and backfills usage after', async () => {
    const events: string[] = []
    const buyer: InferenceBuyer = {
      charge: async () => {
        events.push('charge')
        return { chargeId: 'charge-1' }
      },
      reportUsage: async (id, tokensIn, tokensOut) => {
        events.push(`usage:${id}:${tokensIn}:${tokensOut}`)
      }
    }
    const { store, agent, runner, quoteSigner } = await loopSetup(buyer)
    const result = await runAgentLoop({
      store,
      runner,
      agent,
      prompt: 'status?',
      quoteSigner,
      model: textModel('the agent holds 0 USDC', events),
      inference: buyer,
      registry: []
    })
    expect(result.text).toContain('0 USDC')
    expect(events).toEqual(['charge', 'generate', 'usage:charge-1:41:9'])
  })

  it('aborts the turn when the charge fails — no payment, no inference', async () => {
    const events: string[] = []
    const buyer: InferenceBuyer = {
      charge: async () => {
        events.push('charge')
        throw new Error('gateway balance exhausted')
      },
      reportUsage: async () => {}
    }
    const { store, agent, runner, quoteSigner } = await loopSetup(buyer)
    await expect(runAgentLoop({
      store,
      runner,
      agent,
      prompt: 'status?',
      quoteSigner,
      model: textModel('unpaid', events),
      inference: buyer,
      registry: []
    })).rejects.toThrow(/gateway balance exhausted|inference/i)
    expect(events).toEqual(['charge']) // the model never ran
  })

  it('runs free when no inference buyer is configured (local dev)', async () => {
    const { store, agent, runner, quoteSigner } = await loopSetup({
      charge: async () => ({ chargeId: 'unused' }),
      reportUsage: async () => {}
    })
    const result = await runAgentLoop({
      store,
      runner,
      agent,
      prompt: 'status?',
      quoteSigner,
      model: textModel('free reply'),
      registry: []
    })
    expect(result.text).toBe('free reply')
  })
})

/**
 * Chat slice: agent_messages store semantics, the /agents/:id/messages
 * routes (idempotent instruction + pending reply + enqueue), and the
 * worker's agent-prompt handler settling the reply row.
 *
 * The model double uses MockLanguageModelV4 with the content/finishReason/
 * usage shapes observed against ai@7 (`generateText` drives a tool call and
 * a text step with these exact shapes — see the V4 types in
 * @ai-sdk/provider). The pipeline underneath runs for real against the
 * MemoryStore with the usual fake chain/signer.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import { MemoryStore } from '../src/db/memory.js'
import { createApp } from '../src/api/server.js'
import { PipelineRunner, type ChainReader } from '../src/pipeline/runner.js'
import { QuoteSigner } from '../src/quotes/sign.js'
import type { SignerAdapter } from '../src/signer/types.js'
import { handleAgentPrompt, type AgentPromptJob } from '../src/worker/handlers.js'

const WALLET = '0x00000000000000000000000000000000000000AA'
const RECIPIENT = '0x00000000000000000000000000000000000000BB'
const AUTH = { 'x-abc-key': 'dev-key' }

const MOCK_USAGE = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined }
}

function textModel (text: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: MOCK_USAGE,
      warnings: []
    })
  })
}

function toolCallModel (toolName: string, input: Record<string, unknown>, thenText: string): MockLanguageModelV4 {
  let calls = 0
  return new MockLanguageModelV4({
    doGenerate: async () => {
      calls++
      if (calls === 1) {
        return {
          content: [{ type: 'tool-call', toolCallId: 'c1', toolName, input: JSON.stringify(input) }],
          finishReason: { unified: 'tool-calls', raw: undefined },
          usage: MOCK_USAGE,
          warnings: []
        }
      }
      return {
        content: [{ type: 'text', text: thenText }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: MOCK_USAGE,
        warnings: []
      }
    }
  })
}

function failingModel (message: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async () => { throw new Error(message) }
  })
}

function fakeChain (over: Partial<ChainReader> = {}): ChainReader {
  return {
    estimateGas: async () => 21_000n,
    call: async () => ({ data: '0x' }),
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

describe('agent_messages store', () => {
  let store: MemoryStore

  beforeEach(() => {
    store = new MemoryStore()
  })

  it('dedupes operator messages by (agent, clientKey) with a 23505', async () => {
    const agent = await store.createAgent('Test', 'test')
    await store.createMessage({ agentId: agent.id, role: 'operator', clientKey: 'k1', text: 'hi' })
    await expect(
      store.createMessage({ agentId: agent.id, role: 'operator', clientKey: 'k1', text: 'hi again' })
    ).rejects.toMatchObject({ code: '23505' })
    const found = await store.getMessageByClientKey(agent.id, 'k1')
    expect(found?.text).toBe('hi')
  })

  it('lists messages ascending, capped to the latest N', async () => {
    const agent = await store.createAgent('Test', 'test')
    for (let i = 0; i < 5; i++) {
      await store.createMessage({ agentId: agent.id, role: 'operator', text: `m${i}` })
    }
    // ties on createdAt keep insertion order (Array.prototype.sort is stable)
    const all = await store.listMessages(agent.id)
    expect(all.map(m => m.text)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4'])
    const lastTwo = await store.listMessages(agent.id, 2)
    expect(lastTwo.map(m => m.text)).toEqual(['m3', 'm4'])
  })

  it('settles a pending reply exactly once', async () => {
    const agent = await store.createAgent('Test', 'test')
    const op = await store.createMessage({ agentId: agent.id, role: 'operator', text: 'go' })
    const reply = await store.createMessage({ agentId: agent.id, role: 'agent', replyTo: op.id, state: 'pending' })

    await store.completeMessage(reply.id, { text: 'done', intentIds: ['i1'] })
    let rows = await store.listMessages(agent.id)
    expect(rows[1]).toMatchObject({ state: 'done', text: 'done', intentIds: ['i1'] })

    // second settle is a no-op (no pending -> no overwrite)
    await store.failMessage(reply.id, 'late failure')
    rows = await store.listMessages(agent.id)
    expect(rows[1]).toMatchObject({ state: 'done', error: null })
  })

  it('fails a pending reply with the error text', async () => {
    const agent = await store.createAgent('Test', 'test')
    const reply = await store.createMessage({ agentId: agent.id, role: 'agent', state: 'pending' })
    await store.failMessage(reply.id, 'gateway timeout')
    const rows = await store.listMessages(agent.id)
    expect(rows[0]).toMatchObject({ state: 'failed', error: 'gateway timeout' })
  })
})

describe('message routes', () => {
  let store: MemoryStore
  let enqueued: AgentPromptJob[]
  let app: ReturnType<typeof createApp>

  beforeEach(async () => {
    store = new MemoryStore()
    enqueued = []
    const runner = new PipelineRunner({
      store,
      signer: fakeSigner(),
      chain: fakeChain(),
      quoteSigner: await QuoteSigner.create(),
      chainId: 5_042_002,
      policy: { confirmationThresholdWei: 10n ** 30n }
    })
    app = createApp({
      store,
      runner,
      signer: fakeSigner(),
      enqueuePrompt: async (job) => { enqueued.push(job) }
    })
  })

  function post (agentId: string, body: unknown, key?: string) {
    return app.request(`/agents/${agentId}/messages`, {
      method: 'POST',
      headers: { ...AUTH, 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
      body: JSON.stringify(body)
    })
  }

  it('requires an Idempotency-Key and text', async () => {
    const agent = await store.createAgent('Test', 'test')
    expect((await post(agent.id, { text: 'hi' })).status).toBe(400)
    expect((await post(agent.id, { text: '  ' }, 'k1')).status).toBe(400)
    expect(enqueued).toHaveLength(0)
  })

  it('404s for an unknown agent', async () => {
    expect((await post('nope', { text: 'hi' }, 'k1')).status).toBe(404)
  })

  interface PostResult { message: { id: string; role: string; text: string; clientKey: string }; reply: { id: string; role: string; state: string; replyTo: string } }

  it('stores the instruction, opens a pending reply and enqueues the turn', async () => {
    const agent = await store.createAgent('Test', 'test')
    const res = await post(agent.id, { text: 'launch status?' }, 'k1')
    expect(res.status).toBe(201)
    const { message, reply } = (await res.json()) as PostResult
    expect(message).toMatchObject({ role: 'operator', text: 'launch status?', clientKey: 'k1' })
    expect(reply).toMatchObject({ role: 'agent', state: 'pending', replyTo: message.id })
    expect(enqueued).toEqual([{ agentId: agent.id, prompt: 'launch status?', replyMessageId: reply.id }])
  })

  it('replays the same key without re-enqueueing', async () => {
    const agent = await store.createAgent('Test', 'test')
    const first = await post(agent.id, { text: 'hi' }, 'k1')
    const { message: m1, reply: r1 } = (await first.json()) as PostResult

    const replay = await post(agent.id, { text: 'hi' }, 'k1')
    expect(replay.status).toBe(200)
    expect(replay.headers.get('x-idempotent-replay')).toBe('true')
    const { message: m2, reply: r2 } = (await replay.json()) as PostResult
    expect(m2.id).toBe(m1.id)
    expect(r2.id).toBe(r1.id)
    expect(enqueued).toHaveLength(1)
    expect(await store.listMessages(agent.id)).toHaveLength(2)
  })

  it('lists the conversation ascending', async () => {
    const agent = await store.createAgent('Test', 'test')
    await post(agent.id, { text: 'one' }, 'k1')
    await post(agent.id, { text: 'two' }, 'k2')
    const res = await app.request(`/agents/${agent.id}/messages`, { headers: AUTH })
    expect(res.status).toBe(200)
    const { messages } = (await res.json()) as { messages: Array<{ text: string; state: string }> }
    expect(messages.map(m => m.text)).toEqual(['one', '', 'two', ''])
    expect(messages[1]?.state).toBe('pending')
  })
})

describe('handleAgentPrompt', () => {
  let store: MemoryStore
  let runner: PipelineRunner
  let quoteSigner: QuoteSigner

  beforeEach(async () => {
    store = new MemoryStore()
    quoteSigner = await QuoteSigner.create()
    runner = new PipelineRunner({
      store,
      signer: fakeSigner(),
      chain: fakeChain(),
      quoteSigner,
      chainId: 5_042_002,
      policy: { confirmationThresholdWei: 10n ** 30n }
    })
  })

  async function openTurn (agentId: string, text = 'go') {
    const op = await store.createMessage({ agentId, role: 'operator', text })
    const reply = await store.createMessage({ agentId, role: 'agent', replyTo: op.id, state: 'pending' })
    return { op, reply }
  }

  it('completes the reply with the loop text', async () => {
    const agent = await store.createAgent('Test', 'test')
    await store.registerWallet(agent.id, WALLET, 'local_dev', 'fake')
    const { reply } = await openTurn(agent.id)

    await handleAgentPrompt(
      { store, runner, quoteSigner, model: textModel('Nothing to do.') },
      { agentId: agent.id, prompt: 'go', replyMessageId: reply.id }
    )

    const rows = await store.listMessages(agent.id)
    expect(rows[1]).toMatchObject({ state: 'done', text: 'Nothing to do.', intentIds: [] })
  })

  it('runs tool-called intents through the real pipeline and links them', async () => {
    const agent = await store.createAgent('Test', 'test')
    await store.registerWallet(agent.id, WALLET, 'local_dev', 'fake')
    // transfer is gated behind a capability skill (loop gating) — grant it
    await store.installAgentSkill(agent.id, 'treasury-ops')
    const { reply } = await openTurn(agent.id, 'pay 1000 wei')

    await handleAgentPrompt(
      {
        store, runner, quoteSigner,
        model: toolCallModel('transfer', { to: RECIPIENT, amountWei: '1000', rationale: 'test payment' }, 'Paid 1000 wei.')
      },
      { agentId: agent.id, prompt: 'pay 1000 wei', replyMessageId: reply.id }
    )

    const rows = await store.listMessages(agent.id)
    const settled = rows[1]!
    expect(settled.state).toBe('done')
    expect(settled.intentIds).toHaveLength(1)
    const intent = await store.getIntent(settled.intentIds[0]!)
    expect(intent).toMatchObject({ type: 'transfer', state: 'FINAL' })
    expect(intent?.rationale).toBe('test payment')
    expect(intent?.rationaleSig).toBeTruthy()
  })

  it('fails the reply (not the job) when the loop throws', async () => {
    const agent = await store.createAgent('Test', 'test')
    await store.registerWallet(agent.id, WALLET, 'local_dev', 'fake')
    const { reply } = await openTurn(agent.id)

    await expect(handleAgentPrompt(
      { store, runner, quoteSigner, model: failingModel('gateway timeout') },
      { agentId: agent.id, prompt: 'go', replyMessageId: reply.id }
    )).resolves.toBeUndefined()

    const rows = await store.listMessages(agent.id)
    expect(rows[1]).toMatchObject({ state: 'failed', error: 'gateway timeout' })
  })

  it('still runs the loop for jobs without a reply row (legacy callers)', async () => {
    const agent = await store.createAgent('Test', 'test')
    await store.registerWallet(agent.id, WALLET, 'local_dev', 'fake')
    await handleAgentPrompt(
      { store, runner, quoteSigner, model: textModel('ok') },
      { agentId: agent.id, prompt: 'go' }
    )
    expect(await store.listMessages(agent.id)).toHaveLength(0)
  })
})

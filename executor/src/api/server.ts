/**
 * Executor HTTP API (Hono). Owner auth: X-ABC-Key header (MVP; passkey
 * step-up later). Every write requires an Idempotency-Key header:
 *   replay with same body  -> 200 + the stored intent, header X-Idempotent-Replay: true
 *   replay with other body -> 409
 */

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { createHash } from 'node:crypto'
import type { Store } from '../db/store.js'
import { PgStore } from '../db/pg.js'
import { PipelineRunner } from '../pipeline/runner.js'
import { createSigner } from '../signer/index.js'
import { QuoteSigner } from '../quotes/sign.js'
import { config, arcTestnet } from '../config.js'
import { createPublicClient, http } from 'viem'
import { splitUsd } from '../ledger/usd.js'

function requestHash (body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex')
}

export interface ApiDeps {
  store: Store
  runner: PipelineRunner
}

export function createApp ({ store, runner }: ApiDeps): Hono {
  const app = new Hono()

  app.use('*', async (c, next) => {
    if (c.req.path === '/health') return next()
    if (c.req.header('X-ABC-Key') !== config.apiKey) {
      return c.json({ error: 'unauthorized' }, 401)
    }
    return next()
  })

  app.get('/health', c => c.json({ ok: true }))

  // ---- agents ----
  app.post('/agents', async c => {
    const body = await c.req.json<{ name: string; slug?: string }>()
    if (!body.name) return c.json({ error: 'name required' }, 400)
    const slug = body.slug ?? body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const agent = await store.createAgent(body.name, slug)
    return c.json({ agent }, 201)
  })

  app.get('/agents', async c => {
    const agents = await store.listAgents()
    return c.json({ agents })
  })

  app.get('/agents/:id', async c => {
    const agent = await store.getAgent(c.req.param('id'))
    if (!agent) return c.json({ error: 'not found' }, 404)
    return c.json({ agent })
  })

  app.patch('/agents/:id', async c => {
    const body = await c.req.json<{ policy: Record<string, unknown> }>()
    if (!body.policy || typeof body.policy !== 'object') return c.json({ error: 'policy object required' }, 400)
    const agent = await store.updateAgentPolicy(c.req.param('id'), body.policy)
    if (!agent) return c.json({ error: 'not found' }, 404)
    return c.json({ agent })
  })

  // ---- campaigns (launch registration; the indexer watches these hooks) ----
  app.post('/agents/:id/campaigns', async c => {
    const key = c.req.header('Idempotency-Key')
    if (!key) return c.json({ error: 'Idempotency-Key header required' }, 400)
    const body = await c.req.json<{
      tokenAddress: string; hookAddress: string; name?: string; symbol?: string
      cap: string; startBlock: string; streamBlocks: string
      minTokenPrice: string; maxTokenPrice: string; feeBps: number
    }>()
    if (!body.tokenAddress || !body.hookAddress) return c.json({ error: 'tokenAddress and hookAddress required' }, 400)
    await store.registerCampaign({
      agentId: c.req.param('id'),
      tokenAddress: body.tokenAddress,
      hookAddress: body.hookAddress,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.symbol !== undefined ? { symbol: body.symbol } : {}),
      cap: body.cap,
      startBlock: body.startBlock,
      streamBlocks: body.streamBlocks,
      minTokenPrice: body.minTokenPrice,
      maxTokenPrice: body.maxTokenPrice,
      feeBps: body.feeBps
    })
    return c.json({ ok: true }, 201)
  })

  // ---- automations ----
  app.get('/agents/:id/automations', async c => {
    const automations = await store.listAutomations(c.req.param('id'))
    return c.json({ automations })
  })

  app.post('/agents/:id/automations', async c => {
    const key = c.req.header('Idempotency-Key')
    if (!key) return c.json({ error: 'Idempotency-Key header required' }, 400)
    const body = await c.req.json<{ kind: 'cron' | 'price' | 'fee_accrued'; spec: Record<string, unknown>; intentTemplate: Record<string, unknown> }>()
    if (!body.kind || !body.spec || !body.intentTemplate) return c.json({ error: 'kind, spec and intentTemplate required' }, 400)
    const automation = await store.createAutomation({
      agentId: c.req.param('id'),
      kind: body.kind,
      spec: body.spec,
      intentTemplate: body.intentTemplate
    })
    return c.json({ automation }, 201)
  })

  app.patch('/automations/:id', async c => {
    const body = await c.req.json<{ active: boolean }>()
    if (typeof body.active !== 'boolean') return c.json({ error: 'active boolean required' }, 400)
    await store.setAutomationActive(c.req.param('id'), body.active)
    return c.json({ ok: true })
  })

  // ---- intents ----
  app.post('/agents/:id/intents', async c => {
    const agentId = c.req.param('id')
    const key = c.req.header('Idempotency-Key')
    if (!key) return c.json({ error: 'Idempotency-Key header required' }, 400)
    const body = await c.req.json<{ walletAddress: string; type: string; params: Record<string, unknown>; rationale?: { text: string; signature: string } }>()
    const hash = requestHash({ agentId, ...body })

    const existing = await store.getIdempotency(key, body.walletAddress)
    if (existing) {
      if (existing.requestHash !== hash) return c.json({ error: 'idempotency key reused with different request' }, 409)
      const intent = await store.getIntent(existing.intentId)
      return c.json({ intent, duplicate: true }, 200, { 'X-Idempotent-Replay': 'true' })
    }

    const intent = await runner.runIntent(agentId, body.walletAddress, body.type, body.params, body.rationale)
    await store.insertIdempotency({ key, walletAddress: body.walletAddress, requestHash: hash, intentId: intent.id })
    return c.json({ intent }, 201)
  })

  app.get('/agents/:id/intents', async c => {
    const intents = await store.listIntents(c.req.param('id'))
    return c.json({ intents })
  })

  app.get('/intents/:id', async c => {
    const intent = await store.getIntent(c.req.param('id'))
    if (!intent) return c.json({ error: 'not found' }, 404)
    return c.json({ intent })
  })

  app.post('/intents/:id/confirm', async c => {
    const body = await c.req.json<{ confirmedBy: string }>().catch(() => ({ confirmedBy: 'operator' }))
    try {
      const intent = await runner.confirm(c.req.param('id'), body.confirmedBy ?? 'operator')
      return c.json({ intent })
    } catch (e) {
      return c.json({ error: (e as Error).message }, 409)
    }
  })

  // ---- quotes (two-step flow) ----
  app.post('/agents/:id/quotes', async c => {
    const body = await c.req.json<{ walletAddress: string; type: string; params: Record<string, unknown> }>()
    const res = await runner.quoteIntent(c.req.param('id'), body.walletAddress, body.type, body.params)
    if (!res.quote) return c.json({ intent: res.intent, error: 'unpriceable — dropped' }, 422)
    return c.json(res, 201)
  })

  app.post('/intents/:id/execute', async c => {
    const body = await c.req.json<{ quoteId: string }>()
    try {
      const intent = await runner.executeQuote(c.req.param('id'), body.quoteId)
      return c.json({ intent })
    } catch (e) {
      return c.json({ error: (e as Error).message }, 409)
    }
  })

  // ---- ledger ----
  app.get('/agents/:id/ledger', async c => {
    const buckets = ['gas', 'inference', 'trading', 'treasury'] as const
    const balances: Record<string, string> = {}
    for (const b of buckets) {
      const wei = await store.ledgerBalance(c.req.param('id'), b)
      const parts = splitUsd(wei)
      balances[b] = JSON.stringify({ usdc6: parts.usdc6.toString(), residualWei: parts.residualWei.toString() })
    }
    return c.json({ balances })
  })

  return app
}

export async function serveApi (port = 8787): Promise<void> {
  const store = new PgStore(config.databaseUrl)
  const quoteSigner = await QuoteSigner.create(config.quoteSecret || undefined)
  const chain = createPublicClient({ chain: arcTestnet, transport: http() })
  const runner = new PipelineRunner({
    store,
    signer: createSigner(),
    chain,
    quoteSigner,
    chainId: arcTestnet.id
  })
  const app = createApp({ store, runner })
  serve({ fetch: app.fetch, port })
  console.log(`[api] executor listening on :${port}`)
}

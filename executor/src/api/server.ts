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
    const body = await c.req.json<{ name: string; slug: string }>()
    if (!body.name || !body.slug) return c.json({ error: 'name and slug required' }, 400)
    const agent = await store.createAgent(body.name, body.slug)
    return c.json({ agent }, 201)
  })

  app.get('/agents/:id', async c => {
    const agent = await store.getAgent(c.req.param('id'))
    if (!agent) return c.json({ error: 'not found' }, 404)
    return c.json({ agent })
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

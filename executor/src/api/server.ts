/**
 * Executor HTTP API (Hono). Owner auth: X-ABC-Key header (MVP; passkey
 * step-up later). Every write requires an Idempotency-Key header:
 *   replay with same body  -> 200 + the stored intent, header X-Idempotent-Replay: true
 *   replay with other body -> 409
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { createHash } from 'node:crypto'
import type { Store, AgentRow } from '../db/store.js'
import { newNonce, verifySiweLogin, issueSession, verifySession } from './auth.js'
import { PgStore } from '../db/pg.js'
import { PipelineRunner } from '../pipeline/runner.js'
import { createSigner } from '../signer/index.js'
import type { SignerAdapter } from '../signer/types.js'
import { QuoteSigner } from '../quotes/sign.js'
import { config, arcTestnet } from '../config.js'
import { createPublicClient, http, type PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { BatchFacilitatorClient } from '@circle-fin/x402-batching/server'
import { splitUsd } from '../ledger/usd.js'
import { enqueueAgentPrompt } from '../worker/enqueue.js'
import type { AgentPromptJob } from '../worker/handlers.js'
import { loadRegistry, resolveAgentSkills, SKILLS_DIR } from '../agent/skills.js'
import { importSkill, ImportRefused, type ImportOptions, type ImportResult } from '../agent/skillImport.js'
import { pushAppToShowcase } from '../apps/push.js'
import { registerInferenceSeller, type FacilitatorSeam } from '../inference/seller.js'
import { listAgentModels, resolveTurnModel } from '../agent/models.js'

function requestHash (body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex')
}

/** Who is calling: the operator backchannel (X-ABC-Key; local dev, scripts,
 *  keeper), or a SIWE session wallet. Admins (ABC_ADMIN_ADDRESSES) see and
 *  operate every agent; users only their own. */
export type Caller =
  | { kind: 'operator' }
  | { kind: 'admin' | 'user'; address: string }

/** Permissionless guardrails (users only; operator/admin are exempt). */
const MAX_AGENTS_PER_OWNER = 3
const CHAT_LIMIT_PER_HOUR = 30
const LAUNCH_LIMIT_PER_DAY = 2

export interface ApiDeps {
  store: Store
  runner: PipelineRunner
  signer: SignerAdapter
  /** Public client for SIWE signature verification (EOA paths verify
   *  locally; ERC-6492 contract accounts resolve against the chain).
   *  Defaults to an Arc testnet client. */
  chain?: PublicClient
  /** Send side of the agent-prompt queue; tests inject an in-memory capture. */
  enqueuePrompt?: (job: AgentPromptJob) => Promise<void>
  /** Skills catalog location; tests substitute a fixture dir. */
  skillsDir?: string
  /** Install-from-URL pipeline; tests inject a stub. */
  importSkillFromUrl?: (opts: ImportOptions) => Promise<ImportResult>
  /** Inference seller side. Absent = the charge routes 503 (free local dev
   *  runs no seller). Tests inject a fake facilitator. */
  inferenceSeller?: {
    facilitator: FacilitatorSeam
    sellerAddress: string
    priceUsdc6: bigint
  }
}

/** Hono env carrying the resolved caller through middleware -> routes. */
export type AppEnv = { Variables: { caller: Caller } }

export function createApp ({
  store,
  runner,
  signer,
  chain,
  enqueuePrompt = enqueueAgentPrompt,
  skillsDir = SKILLS_DIR,
  importSkillFromUrl = importSkill,
  inferenceSeller
}: ApiDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>()
  const siweChain = chain ?? createPublicClient({ chain: arcTestnet, transport: http() })

  /** The agent's wallet is executor-provisioned, never caller-supplied:
   *  resolve from the wallets table, provisioning lazily on first use. */
  async function resolveWallet (agentId: string, requested?: string): Promise<{ wallet: string } | { error: string; status: 400 | 404 }> {
    const agent = await store.getAgent(agentId)
    if (!agent) return { error: 'not found', status: 404 }
    let wallet = await store.agentWalletAddress(agentId)
    if (!wallet) {
      const w = await signer.ensureWallet(agentId)
      await store.registerWallet(agentId, w.address, signer.name as 'circle_sca' | 'local_dev' | 'agent_stack', w.providerRef)
      wallet = w.address
    }
    if (requested && requested.toLowerCase() !== wallet.toLowerCase()) {
      return { error: `walletAddress mismatch: agent wallet is ${wallet}`, status: 400 }
    }
    return { wallet }
  }

  // Chrome Private Network Access: a public-origin page (e.g. the deployed
  // console) calling this loopback executor sends
  // Access-Control-Request-Private-Network on the preflight, and Chrome
  // blocks the request without this echo even after the user clicks Allow
  // on the "access other apps and services on this device" prompt.
  // Registered BEFORE cors because hono/cors short-circuits OPTIONS without
  // calling next() — middleware after it never sees preflights.
  app.use('*', async (c, next) => {
    await next()
    if (c.req.method === 'OPTIONS' && c.req.header('access-control-request-private-network') === 'true') {
      c.res.headers.set('Access-Control-Allow-Private-Network', 'true')
    }
  })
  // CORS before auth so browser preflights (OPTIONS, no X-ABC-Key) are
  // answered here instead of 401ing. localhost/127.0.0.1 on any port is
  // always allowed (local dev); deployed console origins come from
  // ABC_ALLOWED_ORIGINS.
  const allowedOrigins = new Set(config.allowedOrigins.map(o => o.toLowerCase()))
  app.use('*', cors({
    origin: (o) =>
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o) || allowedOrigins.has(o.toLowerCase()) ? o : null,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['content-type', 'x-abc-key', 'idempotency-key', 'authorization']
  }))

  // Auth: SIWE session (console users) or X-ABC-Key (operator backchannel:
  // local dev, scripts). Open paths: /health, /inference/* (the x402 payment
  // is its own auth), /auth/* (login).
  app.use('*', async (c, next) => {
    if (c.req.path === '/health') return next()
    if (c.req.path.startsWith('/inference/')) return next()
    if (c.req.path.startsWith('/auth/')) return next()
    if (c.req.header('X-ABC-Key') === config.apiKey) {
      c.set('caller', { kind: 'operator' })
      return next()
    }
    const auth = c.req.header('Authorization')
    const address = auth?.startsWith('Bearer ') ? verifySession(config.sessionSecret, auth.slice(7)) : null
    if (!address) return c.json({ error: 'unauthorized' }, 401)
    c.set('caller', { kind: config.adminAddresses.includes(address) ? 'admin' : 'user', address })
    return next()
  })

  function getCaller (c: Context): Caller {
    return c.get('caller')
  }

  /** Only the owner (or operator/admin) may see an agent; everyone else gets
   *  a 404 so existence stays hidden. */
  function owns (caller: Caller, agent: AgentRow): boolean {
    return caller.kind !== 'user' || agent.ownerAddress?.toLowerCase() === caller.address
  }

  async function scopedAgent (id: string, caller: Caller): Promise<AgentRow | null> {
    const agent = await store.getAgent(id)
    return agent && owns(caller, agent) ? agent : null
  }

  async function scopedIntent (id: string, caller: Caller) {
    const intent = await store.getIntent(id)
    if (!intent) return null
    return (await scopedAgent(intent.agentId, caller)) ? intent : null
  }

  /** Fixed-window limiter; users only (operator/admin are exempt). */
  async function overLimit (scope: string, caller: Caller, limit: number, windowSeconds: number): Promise<boolean> {
    if (caller.kind !== 'user') return false
    const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000)
    return (await store.hitRateLimit(scope, caller.address, windowStart)) > limit
  }

  app.get('/health', c => c.json({ ok: true }))

  // ---- auth (SIWE login; open paths) ----
  app.get('/auth/nonce', async c => {
    const nonce = newNonce()
    await store.insertNonce(nonce)
    return c.json({ nonce })
  })

  app.post('/auth/verify', async c => {
    const body = await c.req.json<{ message?: string; signature?: `0x${string}` }>()
      .catch(() => ({}) as { message?: string; signature?: `0x${string}` })
    if (!body.message || !body.signature) return c.json({ error: 'message and signature required' }, 400)
    const address = await verifySiweLogin(store, siweChain, body.message, body.signature)
    if (!address) return c.json({ error: 'invalid login' }, 401)
    return c.json({ token: issueSession(config.sessionSecret, address), address })
  })

  // ---- agents ----
  app.post('/agents', async c => {
    const caller = getCaller(c)
    const body = await c.req.json<{ name: string; slug?: string }>()
    if (!body.name) return c.json({ error: 'name required' }, 400)
    const owner = caller.kind === 'operator' ? null : caller.address
    if (caller.kind === 'user' && (await store.countAgentsByOwner(caller.address)) >= MAX_AGENTS_PER_OWNER) {
      return c.json({ error: `agent limit reached (${MAX_AGENTS_PER_OWNER} per wallet)` }, 429)
    }
    const slug = body.slug ?? body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const agent = await store.createAgent(body.name, slug, owner)
    const w = await signer.ensureWallet(agent.id)
    await store.registerWallet(agent.id, w.address, signer.name as 'circle_sca' | 'local_dev' | 'agent_stack', w.providerRef)
    return c.json({ agent: { ...agent, walletAddress: w.address } }, 201)
  })

  app.get('/agents', async c => {
    const caller = getCaller(c)
    const agents = caller.kind === 'user' ? await store.listAgents(caller.address) : await store.listAgents()
    return c.json({ agents })
  })

  app.get('/agents/:id', async c => {
    const agent = await scopedAgent(c.req.param('id'), getCaller(c))
    if (!agent) return c.json({ error: 'not found' }, 404)
    return c.json({ agent })
  })

  app.patch('/agents/:id', async c => {
    const caller = getCaller(c)
    const body = await c.req.json<{ policy: Record<string, unknown> }>()
    if (!body.policy || typeof body.policy !== 'object') return c.json({ error: 'policy object required' }, 400)
    if (!(await scopedAgent(c.req.param('id'), caller))) return c.json({ error: 'not found' }, 404)
    const agent = await store.updateAgentPolicy(c.req.param('id'), body.policy)
    if (!agent) return c.json({ error: 'not found' }, 404)
    return c.json({ agent })
  })

  // ---- campaigns (launch registration; the indexer watches these hooks) ----
  app.post('/agents/:id/campaigns', async c => {
    const key = c.req.header('Idempotency-Key')
    if (!key) return c.json({ error: 'Idempotency-Key header required' }, 400)
    if (!(await scopedAgent(c.req.param('id'), getCaller(c)))) return c.json({ error: 'not found' }, 404)
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
    if (!(await scopedAgent(c.req.param('id'), getCaller(c)))) return c.json({ error: 'not found' }, 404)
    const automations = await store.listAutomations(c.req.param('id'))
    return c.json({ automations })
  })

  app.post('/agents/:id/automations', async c => {
    const key = c.req.header('Idempotency-Key')
    if (!key) return c.json({ error: 'Idempotency-Key header required' }, 400)
    if (!(await scopedAgent(c.req.param('id'), getCaller(c)))) return c.json({ error: 'not found' }, 404)
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
    const caller = getCaller(c)
    const body = await c.req.json<{ active: boolean }>()
    if (typeof body.active !== 'boolean') return c.json({ error: 'active boolean required' }, 400)
    const agentId = await store.getAutomationAgentId(c.req.param('id'))
    if (!agentId || !(await scopedAgent(agentId, caller))) return c.json({ error: 'not found' }, 404)
    await store.setAutomationActive(c.req.param('id'), body.active)
    return c.json({ ok: true })
  })

  // ---- intents ----
  app.post('/agents/:id/intents', async c => {
    const agentId = c.req.param('id')
    const key = c.req.header('Idempotency-Key')
    if (!key) return c.json({ error: 'Idempotency-Key header required' }, 400)
    if (!(await scopedAgent(agentId, getCaller(c)))) return c.json({ error: 'not found' }, 404)
    const body = await c.req.json<{ walletAddress?: string; type: string; params: Record<string, unknown>; rationale?: { text: string; signature: string } }>()
    const resolved = await resolveWallet(agentId, body.walletAddress)
    if ('error' in resolved) return c.json({ error: resolved.error }, resolved.status)
    const wallet = resolved.wallet
    const hash = requestHash({ agentId, ...body, walletAddress: wallet })

    const existing = await store.getIdempotency(key, wallet)
    if (existing) {
      if (existing.requestHash !== hash) return c.json({ error: 'idempotency key reused with different request' }, 409)
      const intent = await store.getIntent(existing.intentId)
      return c.json({ intent, duplicate: true }, 200, { 'X-Idempotent-Replay': 'true' })
    }

    const intent = await runner.runIntent(agentId, wallet, body.type, body.params, body.rationale)
    await store.insertIdempotency({ key, walletAddress: wallet, requestHash: hash, intentId: intent.id })
    return c.json({ intent }, 201)
  })

  app.get('/agents/:id/intents', async c => {
    if (!(await scopedAgent(c.req.param('id'), getCaller(c)))) return c.json({ error: 'not found' }, 404)
    const intents = await store.listIntents(c.req.param('id'))
    return c.json({ intents })
  })

  app.get('/intents/:id', async c => {
    const intent = await scopedIntent(c.req.param('id'), getCaller(c))
    if (!intent) return c.json({ error: 'not found' }, 404)
    return c.json({ intent })
  })

  app.post('/intents/:id/confirm', async c => {
    if (!(await scopedIntent(c.req.param('id'), getCaller(c)))) return c.json({ error: 'not found' }, 404)
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
    const caller = getCaller(c)
    if (!(await scopedAgent(c.req.param('id'), caller))) return c.json({ error: 'not found' }, 404)
    const body = await c.req.json<{ walletAddress?: string; type: string; params: Record<string, unknown> }>()
    if (body.type === 'lge_launch' && await overLimit('launch', caller, LAUNCH_LIMIT_PER_DAY, 86_400)) {
      return c.json({ error: `launch rate limit reached (${LAUNCH_LIMIT_PER_DAY} per day)` }, 429)
    }
    const resolved = await resolveWallet(c.req.param('id'), body.walletAddress)
    if ('error' in resolved) return c.json({ error: resolved.error }, resolved.status)
    const res = await runner.quoteIntent(c.req.param('id'), resolved.wallet, body.type, body.params)
    if (!res.quote) return c.json({ intent: res.intent, error: 'unpriceable — dropped' }, 422)
    return c.json(res, 201)
  })

  app.post('/intents/:id/execute', async c => {
    if (!(await scopedIntent(c.req.param('id'), getCaller(c)))) return c.json({ error: 'not found' }, 404)
    const body = await c.req.json<{ quoteId: string }>()
    try {
      const intent = await runner.executeQuote(c.req.param('id'), body.quoteId)
      return c.json({ intent })
    } catch (e) {
      return c.json({ error: (e as Error).message }, 409)
    }
  })

  app.get('/models', c => c.json(listAgentModels()))

  // ---- messages (operator instruction -> pending agent reply -> worker settles) ----
  app.post('/agents/:id/messages', async c => {
    const agentId = c.req.param('id')
    const caller = getCaller(c)
    const key = c.req.header('Idempotency-Key')
    if (!key) return c.json({ error: 'Idempotency-Key header required' }, 400)
    const agent = await scopedAgent(agentId, caller)
    if (!agent) return c.json({ error: 'not found' }, 404)
    if (await overLimit('chat', caller, CHAT_LIMIT_PER_HOUR, 3600)) {
      return c.json({ error: `chat rate limit reached (${CHAT_LIMIT_PER_HOUR} per hour)` }, 429)
    }
    const body = await c.req.json<{ text?: string; model?: string }>()
    const text = body.text?.trim()
    if (!text) return c.json({ error: 'text required' }, 400)
    let modelId: string
    try {
      modelId = resolveTurnModel(body.model)
    } catch {
      return c.json({ error: 'model not allowed' }, 400)
    }

    const existing = await store.getMessageByClientKey(agentId, key)
    if (existing) {
      const reply = (await store.listMessages(agentId)).find(m => m.replyTo === existing.id) ?? null
      return c.json({ message: existing, reply }, 200, { 'X-Idempotent-Replay': 'true' })
    }

    let message
    try {
      message = await store.createMessage({ agentId, role: 'operator', clientKey: key, text })
    } catch (e) {
      // lost a race with the same key — serve the stored row as a replay
      if ((e as { code?: string }).code === '23505') {
        const dup = await store.getMessageByClientKey(agentId, key)
        const reply = dup ? (await store.listMessages(agentId)).find(m => m.replyTo === dup.id) ?? null : null
        return c.json({ message: dup, reply }, 200, { 'X-Idempotent-Replay': 'true' })
      }
      throw e
    }
    const reply = await store.createMessage({ agentId, role: 'agent', replyTo: message.id, state: 'pending' })
    try {
      await enqueuePrompt({ agentId, prompt: text, modelId, replyMessageId: reply.id })
    } catch (e) {
      // never leave a silent pending row: fail it with the reason
      await store.failMessage(reply.id, `enqueue failed: ${(e as Error).message}`)
      return c.json({ error: 'failed to enqueue the agent turn' }, 502)
    }
    return c.json({ message, reply }, 201)
  })

  app.get('/agents/:id/messages', async c => {
    const agent = await scopedAgent(c.req.param('id'), getCaller(c))
    if (!agent) return c.json({ error: 'not found' }, 404)
    const limit = Number(c.req.query('limit') ?? 200)
    const messages = await store.listMessages(agent.id, Number.isFinite(limit) ? limit : 200)
    return c.json({ messages })
  })

  // ---- skills ----
  // Skill writes are naturally idempotent (PK upsert / boolean set), so no
  // Idempotency-Key header — requiring one we never store would be theater.
  app.get('/skills', c => {
    return c.json({ skills: loadRegistry(skillsDir) })
  })

  app.get('/agents/:id/skills', async c => {
    const agent = await scopedAgent(c.req.param('id'), getCaller(c))
    if (!agent) return c.json({ error: 'not found' }, 404)
    const installs = await store.listAgentSkills(agent.id)
    return c.json({ skills: resolveAgentSkills(loadRegistry(skillsDir), installs) })
  })

  app.post('/agents/:id/skills', async c => {
    const agent = await scopedAgent(c.req.param('id'), getCaller(c))
    if (!agent) return c.json({ error: 'not found' }, 404)
    const body = await c.req.json<{ slug?: string }>()
    if (!body.slug) return c.json({ error: 'slug required' }, 400)
    const manifest = loadRegistry(skillsDir).find(s => s.slug === body.slug)
    if (!manifest) return c.json({ error: 'not in the registry' }, 404)
    const row = await store.installAgentSkill(agent.id, manifest.slug)
    const [skill] = resolveAgentSkills([manifest], [row])
    return c.json({ skill }, 201)
  })

  app.post('/agents/:id/skills/install-url', async c => {
    const agent = await scopedAgent(c.req.param('id'), getCaller(c))
    if (!agent) return c.json({ error: 'not found' }, 404)
    const body = await c.req.json<{ url?: string; licenseSpdx?: string; provider?: string; slug?: string }>()
    if (!body.url || !body.licenseSpdx || !body.provider) {
      return c.json({ error: 'url, licenseSpdx and provider required (license is operator-asserted from the upstream LICENSE)' }, 400)
    }
    let result
    try {
      result = await importSkillFromUrl({
        url: body.url,
        licenseSpdx: body.licenseSpdx,
        provider: body.provider,
        ...(body.slug ? { slug: body.slug } : {}),
        skillsDir
      })
    } catch (e) {
      if (e instanceof ImportRefused) {
        return c.json({ error: e.message, findings: e.findings }, 422)
      }
      throw e
    }
    const row = await store.installAgentSkill(agent.id, result.slug)
    const [skill] = resolveAgentSkills([result.manifest], [row])
    return c.json({ skill, vendored: result.vendored }, 201)
  })

  app.patch('/agents/:id/skills/:slug', async c => {
    const body = await c.req.json<{ enabled?: boolean }>()
    if (typeof body.enabled !== 'boolean') return c.json({ error: 'enabled boolean required' }, 400)
    if (!(await scopedAgent(c.req.param('id'), getCaller(c)))) return c.json({ error: 'not found' }, 404)
    const row = await store.setAgentSkillEnabled(c.req.param('id'), c.req.param('slug'), body.enabled)
    if (!row) return c.json({ error: 'not installed' }, 404)
    return c.json({ skill: row })
  })

  // ---- ledger ----
  app.get('/agents/:id/ledger', async c => {
    if (!(await scopedAgent(c.req.param('id'), getCaller(c)))) return c.json({ error: 'not found' }, 404)
    const buckets = ['gas', 'inference', 'trading', 'treasury'] as const
    const balances: Record<string, string> = {}
    for (const b of buckets) {
      const wei = await store.ledgerBalance(c.req.param('id'), b)
      const parts = splitUsd(wei)
      balances[b] = JSON.stringify({ usdc6: parts.usdc6.toString(), residualWei: parts.residualWei.toString() })
    }
    return c.json({ balances })
  })

  app.get('/agents/:id/ledger/entries', async c => {
    if (!(await scopedAgent(c.req.param('id'), getCaller(c)))) return c.json({ error: 'not found' }, 404)
    const entries = await store.listLedger(c.req.param('id'))
    return c.json({
      entries: entries.map(e => ({
        ...e,
        amount: { usdc6: e.amount.usdc6.toString(), residualWei: e.amount.residualWei.toString() }
      }))
    })
  })

  // ---- showcase app (the agent's agenticbusinessconsole.com storefront record) ----
  app.get('/agents/:id/app', async c => {
    if (!(await scopedAgent(c.req.param('id'), getCaller(c)))) return c.json({ error: 'not found' }, 404)
    const appRecord = await store.getApp(c.req.param('id'))
    if (!appRecord) return c.json({ error: 'no app published' }, 404)
    return c.json(appRecord)
  })

  app.get('/agents/:id/campaigns', async c => {
    if (!(await scopedAgent(c.req.param('id'), getCaller(c)))) return c.json({ error: 'not found' }, 404)
    return c.json({ campaigns: await store.listCampaigns(c.req.param('id')) })
  })

  // ---- inference rail (x402 seller; PRODUCT.md third lock) ----
  app.get('/agents/:id/inference', async c => {
    const agent = await scopedAgent(c.req.param('id'), getCaller(c))
    if (!agent) return c.json({ error: 'not found' }, 404)
    const payments = await store.listInferencePayments(agent.id)
    return c.json({
      payments: payments.map(p => ({ ...p, priceUsdc6: p.priceUsdc6.toString() }))
    })
  })

  if (inferenceSeller) {
    registerInferenceSeller(app, { store, ...inferenceSeller })
  } else {
    app.post('/inference/charge', c => c.json({ error: 'inference seller not configured' }, 503))
  }

  return app
}

export async function serveApi (port = 8787): Promise<void> {
  const store = new PgStore(config.databaseUrl)
  const quoteSigner = await QuoteSigner.create(config.quoteSecret || undefined)
  const chain = createPublicClient({ chain: arcTestnet, transport: http() })
  const signer = createSigner()
  const runner = new PipelineRunner({
    store,
    signer,
    chain,
    quoteSigner,
    chainId: arcTestnet.id,
    pushApp: pushAppToShowcase
  })

  // Inference seller: enabled when the payee is known (explicit override, or
  // derived from the keeper key). The facilitator talks to Circle Gateway.
  let inferenceSeller: ApiDeps['inferenceSeller']
  const sellerAddress = config.inferenceSellerAddress ||
    (config.keeperKey ? privateKeyToAccount(config.keeperKey as `0x${string}`).address : '')
  if (sellerAddress) {
    inferenceSeller = {
      facilitator: new BatchFacilitatorClient({ url: config.gatewayFacilitatorUrl }),
      sellerAddress,
      priceUsdc6: config.inferencePriceUsdc6
    }
  }

  const app = createApp({ store, runner, signer, chain, ...(inferenceSeller ? { inferenceSeller } : {}) })
  serve({ fetch: app.fetch, port })
  console.log(`[api] executor listening on :${port}`)
}

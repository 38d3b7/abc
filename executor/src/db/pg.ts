/**
 * Postgres store — the production implementation of the Store interface.
 */

import pg from 'pg'
import type { State, StateChange } from '../pipeline/states.js'
import type {
  Store, IntentRow, NewIntent, QuoteRow, LedgerEntry, LedgerRow, IdempotencyRecord, AgentRow,
  AutomationRow, NewAutomation, NewCampaign, CampaignRow, MessageRow, NewMessage, AgentSkillRow,
  AppRow, AppBlocks, InferencePaymentRow, NewInferencePayment, LgeBoardToken, LgeActivityRow
} from './store.js'
import { joinUsd, partsFromRow } from '../ledger/usd.js'

interface AutomationDbRow {
  id: string
  agent_id: string
  kind: AutomationRow['kind']
  spec: Record<string, unknown>
  intent_template: Record<string, unknown>
  active: boolean
  last_fired_at: Date | null
  created_at: Date
}

function toAutomation (r: AutomationDbRow): AutomationRow {
  return {
    id: r.id,
    agentId: r.agent_id,
    kind: r.kind,
    spec: r.spec,
    intentTemplate: r.intent_template,
    active: r.active,
    lastFiredAt: r.last_fired_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString()
  }
}

interface IntentDbRow {
  id: string
  agent_id: string
  wallet_address: string
  type: string
  params: Record<string, unknown>
  state: State
  state_history: StateChange[]
  quote_id: string | null
  simulation: Record<string, unknown> | null
  policy: Record<string, unknown> | null
  tx_hash: string | null
  rationale: string | null
  rationale_sig: string | null
  error: string | null
  requote_count: number
  created_at: Date
  updated_at: Date
}

function toIntent (r: IntentDbRow): IntentRow {
  return {
    id: r.id,
    agentId: r.agent_id,
    walletAddress: r.wallet_address,
    type: r.type,
    params: r.params,
    state: r.state,
    stateHistory: r.state_history,
    quoteId: r.quote_id,
    simulation: r.simulation,
    policy: r.policy,
    txHash: r.tx_hash,
    rationale: r.rationale,
    rationaleSig: r.rationale_sig,
    error: r.error,
    requoteCount: r.requote_count,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString()
  }
}

interface QuoteDbRow {
  id: string
  intent_id: string | null
  wallet_address: string
  payload: QuoteRow['payload']
  signature: string
  consumed_at: Date | null
  expires_at: Date
  created_at: Date
}

function toQuote (r: QuoteDbRow): QuoteRow {
  return {
    id: r.id,
    intentId: r.intent_id,
    walletAddress: r.wallet_address,
    payload: r.payload,
    signature: r.signature,
    consumedAt: r.consumed_at?.toISOString() ?? null,
    expiresAt: r.expires_at.toISOString(),
    createdAt: r.created_at.toISOString()
  }
}

interface AgentDbRow {
  id: string
  name: string
  slug: string
  token_address: string | null
  hook_address: string | null
  wallet_address: string | null
  owner_address: string | null
  policy: Record<string, unknown>
  created_at: Date
}

interface MessageDbRow {
  id: string
  agent_id: string
  role: 'operator' | 'agent'
  client_key: string | null
  reply_to: string | null
  text: string
  intent_ids: string[]
  state: 'pending' | 'done' | 'failed'
  error: string | null
  created_at: Date
}

function toMessage (r: MessageDbRow): MessageRow {
  return {
    id: r.id,
    agentId: r.agent_id,
    role: r.role,
    clientKey: r.client_key,
    replyTo: r.reply_to,
    text: r.text,
    intentIds: r.intent_ids,
    state: r.state,
    error: r.error,
    createdAt: r.created_at.toISOString()
  }
}

const AGENT_SELECT = `
  SELECT a.*, (SELECT w.address FROM wallets w WHERE w.agent_id = a.id ORDER BY w.created_at ASC LIMIT 1) AS wallet_address
  FROM agents a`

function toAgent (r: AgentDbRow): AgentRow {
  return {
    id: r.id, name: r.name, slug: r.slug,
    tokenAddress: r.token_address, hookAddress: r.hook_address,
    walletAddress: r.wallet_address,
    ownerAddress: r.owner_address ?? null,
    policy: r.policy, createdAt: r.created_at.toISOString()
  }
}

export class PgStore implements Store {
  private readonly pool: pg.Pool

  constructor (connectionString: string) {
    this.pool = new pg.Pool({ connectionString })
  }

  async createAgent (name: string, slug: string, ownerAddress?: string | null): Promise<AgentRow> {
    const res = await this.pool.query<AgentDbRow>(
      `INSERT INTO agents (name, slug, owner_address) VALUES ($1, $2, $3) RETURNING *, NULL AS wallet_address`,
      [name, slug, ownerAddress ?? null]
    )
    return toAgent(res.rows[0]!)
  }

  async getAgent (id: string): Promise<AgentRow | null> {
    const res = await this.pool.query<AgentDbRow>(`${AGENT_SELECT} WHERE a.id = $1`, [id])
    return res.rows[0] ? toAgent(res.rows[0]) : null
  }

  async listAgents (ownerAddress?: string): Promise<AgentRow[]> {
    if (ownerAddress === undefined) {
      const res = await this.pool.query<AgentDbRow>(`${AGENT_SELECT} ORDER BY a.created_at ASC`)
      return res.rows.map(toAgent)
    }
    const res = await this.pool.query<AgentDbRow>(
      `${AGENT_SELECT} WHERE lower(a.owner_address) = lower($1) ORDER BY a.created_at ASC`,
      [ownerAddress]
    )
    return res.rows.map(toAgent)
  }

  async countAgentsByOwner (ownerAddress: string): Promise<number> {
    const res = await this.pool.query<{ count: string }>(
      'SELECT count(*) AS count FROM agents WHERE lower(owner_address) = lower($1)',
      [ownerAddress]
    )
    return Number(res.rows[0]!.count)
  }

  async updateAgentPolicy (id: string, policy: Record<string, unknown>): Promise<AgentRow | null> {
    const res = await this.pool.query<AgentDbRow>(
      'UPDATE agents SET policy = $2 WHERE id = $1 RETURNING *, NULL AS wallet_address',
      [id, JSON.stringify(policy)]
    )
    return res.rows[0] ? toAgent(res.rows[0]) : null
  }

  async registerCampaign (c: NewCampaign): Promise<void> {
    await this.pool.query(
      `INSERT INTO campaigns
         (agent_id, token_address, hook_address, name, symbol, cap, start_block, stream_blocks, min_token_price, max_token_price, fee_bps)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (hook_address) DO NOTHING`,
      [c.agentId, c.tokenAddress, c.hookAddress, c.name ?? null, c.symbol ?? null,
       c.cap, c.startBlock, c.streamBlocks, c.minTokenPrice, c.maxTokenPrice, c.feeBps]
    )
    await this.pool.query(
      'UPDATE agents SET token_address = $2, hook_address = $3 WHERE id = $1',
      [c.agentId, c.tokenAddress, c.hookAddress]
    )
    // Keep the published showcase app in sync so the public directory and
    // open-raises board pick up the new hook/token without a separate publish.
    await this.pool.query(
      'UPDATE apps SET token_address = $2, hook_address = $3, updated_at = now() WHERE agent_id = $1',
      [c.agentId, c.tokenAddress, c.hookAddress]
    )
  }

  async listCampaigns (agentId: string): Promise<CampaignRow[]> {
    const res = await this.pool.query<{
      id: string; agent_id: string; token_address: string; hook_address: string
      name: string | null; symbol: string | null; cap: string; start_block: string
      stream_blocks: string; min_token_price: string; max_token_price: string
      fee_bps: number; created_at: Date
    }>(
      'SELECT * FROM campaigns WHERE agent_id = $1 ORDER BY created_at DESC',
      [agentId]
    )
    return res.rows.map(r => ({
      id: r.id,
      agentId: r.agent_id,
      tokenAddress: r.token_address,
      hookAddress: r.hook_address,
      name: r.name,
      symbol: r.symbol,
      cap: r.cap,
      startBlock: r.start_block,
      streamBlocks: r.stream_blocks,
      minTokenPrice: r.min_token_price,
      maxTokenPrice: r.max_token_price,
      feeBps: r.fee_bps,
      createdAt: r.created_at.toISOString()
    }))
  }

  async listAutomations (agentId: string): Promise<AutomationRow[]> {
    const res = await this.pool.query(
      'SELECT * FROM automations WHERE agent_id = $1 ORDER BY created_at DESC',
      [agentId]
    )
    return res.rows.map(toAutomation)
  }

  async createAutomation (a: NewAutomation): Promise<AutomationRow> {
    const res = await this.pool.query(
      `INSERT INTO automations (agent_id, kind, spec, intent_template) VALUES ($1,$2,$3,$4) RETURNING *`,
      [a.agentId, a.kind, JSON.stringify(a.spec), JSON.stringify(a.intentTemplate)]
    )
    return toAutomation(res.rows[0])
  }

  async setAutomationActive (id: string, active: boolean): Promise<void> {
    await this.pool.query('UPDATE automations SET active = $2 WHERE id = $1', [id, active])
  }

  async createIntent (n: NewIntent): Promise<IntentRow> {
    const res = await this.pool.query<IntentDbRow>(
      `INSERT INTO intents (agent_id, wallet_address, type, params, rationale, rationale_sig)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [n.agentId, n.walletAddress, n.type, JSON.stringify(n.params), n.rationale ?? null, n.rationaleSig ?? null]
    )
    return toIntent(res.rows[0]!)
  }

  async getIntent (id: string): Promise<IntentRow | null> {
    const res = await this.pool.query<IntentDbRow>('SELECT * FROM intents WHERE id = $1', [id])
    return res.rows[0] ? toIntent(res.rows[0]) : null
  }

  async listIntents (agentId: string, limit = 100): Promise<IntentRow[]> {
    const res = await this.pool.query<IntentDbRow>(
      'SELECT * FROM intents WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2',
      [agentId, limit]
    )
    return res.rows.map(toIntent)
  }

  async transitionIntent (
    id: string,
    expectedFrom: State,
    change: StateChange,
    patch: Partial<Pick<IntentRow, 'quoteId' | 'simulation' | 'policy' | 'txHash' | 'error' | 'requoteCount'>> = {}
  ): Promise<void> {
    const res = await this.pool.query(
      `UPDATE intents SET
         state = $3,
         state_history = state_history || $4::jsonb,
         quote_id = COALESCE($5, quote_id),
         simulation = COALESCE($6, simulation),
         policy = COALESCE($7, policy),
         tx_hash = COALESCE($8, tx_hash),
         error = COALESCE($9, error),
         requote_count = COALESCE($10, requote_count),
         updated_at = now()
       WHERE id = $1 AND state = $2`,
      [
        id,
        expectedFrom,
        change.to,
        JSON.stringify([change]),
        patch.quoteId ?? null,
        patch.simulation ? JSON.stringify(patch.simulation) : null,
        patch.policy ? JSON.stringify(patch.policy) : null,
        patch.txHash ?? null,
        patch.error ?? null,
        patch.requoteCount ?? null
      ]
    )
    if (res.rowCount !== 1) {
      throw new Error(`concurrent transition on intent ${id}: expected state ${expectedFrom}`)
    }
  }

  async listByState (state: State): Promise<IntentRow[]> {
    const res = await this.pool.query<IntentDbRow>('SELECT * FROM intents WHERE state = $1', [state])
    return res.rows.map(toIntent)
  }

  async insertIdempotency (rec: IdempotencyRecord): Promise<'inserted' | 'exists'> {
    const res = await this.pool.query(
      `INSERT INTO idempotency (key, wallet_address, request_hash, intent_id)
       VALUES ($1, $2, $3, $4) ON CONFLICT (key, wallet_address) DO NOTHING`,
      [rec.key, rec.walletAddress, rec.requestHash, rec.intentId]
    )
    return res.rowCount === 1 ? 'inserted' : 'exists'
  }

  async getIdempotency (key: string, walletAddress: string): Promise<IdempotencyRecord | null> {
    const res = await this.pool.query(
      'SELECT * FROM idempotency WHERE key = $1 AND wallet_address = $2',
      [key, walletAddress]
    )
    const r = res.rows[0]
    if (!r) return null
    return { key: r.key, walletAddress: r.wallet_address, requestHash: r.request_hash, intentId: r.intent_id }
  }

  async createQuote (q: Omit<QuoteRow, 'createdAt' | 'consumedAt'>): Promise<QuoteRow> {
    const res = await this.pool.query<QuoteDbRow>(
      `INSERT INTO quotes (id, intent_id, wallet_address, payload, signature, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [q.id, q.intentId, q.walletAddress, JSON.stringify(q.payload), q.signature, q.expiresAt]
    )
    return toQuote(res.rows[0]!)
  }

  async getQuote (id: string): Promise<QuoteRow | null> {
    const res = await this.pool.query<QuoteDbRow>('SELECT * FROM quotes WHERE id = $1', [id])
    return res.rows[0] ? toQuote(res.rows[0]) : null
  }

  async consumeQuote (id: string): Promise<QuoteRow | null> {
    const res = await this.pool.query<QuoteDbRow>(
      'UPDATE quotes SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING *',
      [id]
    )
    return res.rows[0] ? toQuote(res.rows[0]) : null
  }

  async appendLedger (e: LedgerEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO ledger (agent_id, bucket, amount_usdc6, residual_wei, direction, intent_id, funding_tx_hash, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        e.agentId, e.bucket, e.amount.usdc6.toString(), e.amount.residualWei.toString(),
        e.direction, e.intentId ?? null, e.fundingTxHash ?? null, e.note ?? null
      ]
    )
  }

  async listLedger (agentId: string, limit = 200): Promise<LedgerRow[]> {
    const res = await this.pool.query<{
      id: string; agent_id: string; bucket: LedgerRow['bucket']
      amount_usdc6: string; residual_wei: string; direction: LedgerRow['direction']
      intent_id: string | null; funding_tx_hash: string | null; note: string | null; created_at: Date
    }>(
      'SELECT * FROM ledger WHERE agent_id = $1 ORDER BY id DESC LIMIT $2',
      [agentId, limit]
    )
    return res.rows.map(r => ({
      id: Number(r.id),
      agentId: r.agent_id,
      bucket: r.bucket,
      amount: { usdc6: BigInt(r.amount_usdc6), residualWei: BigInt(r.residual_wei) },
      direction: r.direction,
      ...(r.intent_id ? { intentId: r.intent_id } : {}),
      ...(r.funding_tx_hash ? { fundingTxHash: r.funding_tx_hash } : {}),
      ...(r.note ? { note: r.note } : {}),
      createdAt: r.created_at.toISOString()
    }))
  }

  async ledgerBalance (agentId: string, bucket: string): Promise<bigint> {
    const res = await this.pool.query<{ amount_usdc6: string; residual_wei: string; direction: string }>(
      'SELECT amount_usdc6, residual_wei, direction FROM ledger WHERE agent_id = $1 AND bucket = $2',
      [agentId, bucket]
    )
    let sum = 0n
    for (const r of res.rows) {
      const v = joinUsd(partsFromRow(r))
      sum += r.direction === 'credit' ? v : -v
    }
    return sum
  }

  async createMessage (m: NewMessage): Promise<MessageRow> {
    const res = await this.pool.query<MessageDbRow>(
      `INSERT INTO agent_messages (agent_id, role, client_key, reply_to, text, intent_ids, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        m.agentId, m.role, m.clientKey ?? null, m.replyTo ?? null,
        m.text ?? '', JSON.stringify(m.intentIds ?? []), m.state ?? 'done'
      ]
    )
    return toMessage(res.rows[0]!)
  }

  async getMessageByClientKey (agentId: string, clientKey: string): Promise<MessageRow | null> {
    const res = await this.pool.query<MessageDbRow>(
      'SELECT * FROM agent_messages WHERE agent_id = $1 AND client_key = $2',
      [agentId, clientKey]
    )
    return res.rows[0] ? toMessage(res.rows[0]) : null
  }

  async listMessages (agentId: string, limit = 200): Promise<MessageRow[]> {
    // latest N, rendered ascending (matches MemoryStore's sort-then-slice)
    const res = await this.pool.query<MessageDbRow>(
      `SELECT * FROM (
         SELECT * FROM agent_messages WHERE agent_id = $1
         ORDER BY created_at DESC, id DESC LIMIT $2
       ) t ORDER BY created_at ASC, id ASC`,
      [agentId, limit]
    )
    return res.rows.map(toMessage)
  }

  async completeMessage (id: string, patch: { text: string; intentIds: string[] }): Promise<void> {
    await this.pool.query(
      `UPDATE agent_messages SET state = 'done', text = $2, intent_ids = $3
       WHERE id = $1 AND state = 'pending'`,
      [id, patch.text, JSON.stringify(patch.intentIds)]
    )
  }

  async failMessage (id: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE agent_messages SET state = 'failed', error = $2
       WHERE id = $1 AND state = 'pending'`,
      [id, error]
    )
  }

  async listAgentSkills (agentId: string): Promise<AgentSkillRow[]> {
    const res = await this.pool.query<{
      agent_id: string; slug: string; enabled: boolean; config: Record<string, unknown>; added_at: Date
    }>(
      'SELECT * FROM agent_skills WHERE agent_id = $1 ORDER BY added_at ASC',
      [agentId]
    )
    return res.rows.map(r => ({
      agentId: r.agent_id, slug: r.slug, enabled: r.enabled, config: r.config, addedAt: r.added_at.toISOString()
    }))
  }

  async installAgentSkill (agentId: string, slug: string, config: Record<string, unknown> = {}): Promise<AgentSkillRow> {
    const res = await this.pool.query<{
      agent_id: string; slug: string; enabled: boolean; config: Record<string, unknown>; added_at: Date
    }>(
      `INSERT INTO agent_skills (agent_id, slug, config) VALUES ($1, $2, $3)
       ON CONFLICT (agent_id, slug) DO NOTHING
       RETURNING *`,
      [agentId, slug, JSON.stringify(config)]
    )
    const row = res.rows[0] ?? (await this.pool.query<{
      agent_id: string; slug: string; enabled: boolean; config: Record<string, unknown>; added_at: Date
    }>('SELECT * FROM agent_skills WHERE agent_id = $1 AND slug = $2', [agentId, slug])).rows[0]!
    return {
      agentId: row.agent_id, slug: row.slug, enabled: row.enabled, config: row.config, addedAt: row.added_at.toISOString()
    }
  }

  async setAgentSkillEnabled (agentId: string, slug: string, enabled: boolean): Promise<AgentSkillRow | null> {
    const res = await this.pool.query<{
      agent_id: string; slug: string; enabled: boolean; config: Record<string, unknown>; added_at: Date
    }>(
      'UPDATE agent_skills SET enabled = $3 WHERE agent_id = $1 AND slug = $2 RETURNING *',
      [agentId, slug, enabled]
    )
    const r = res.rows[0]
    if (!r) return null
    return { agentId: r.agent_id, slug: r.slug, enabled: r.enabled, config: r.config, addedAt: r.added_at.toISOString() }
  }

  // ------------------------------------------------------------------
  // apps (showcase blocks)
  // ------------------------------------------------------------------

  private static toApp (r: {
    id: string; agent_id: string; slug: string; name: string; tagline: string; idea: string
    roadmap: AppRow['roadmap']; links: AppRow['links']; x_handle: string | null; token_address: string | null
    hook_address: string | null; published: boolean; created_at: Date; updated_at: Date
  }): AppRow {
    return {
      id: r.id, agentId: r.agent_id, slug: r.slug, name: r.name, tagline: r.tagline, idea: r.idea,
      roadmap: r.roadmap, links: r.links, xHandle: r.x_handle, tokenAddress: r.token_address, hookAddress: r.hook_address,
      published: r.published, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString()
    }
  }

  async getApp (agentId: string): Promise<AppRow | null> {
    const res = await this.pool.query('SELECT * FROM apps WHERE agent_id = $1', [agentId])
    return res.rows[0] ? PgStore.toApp(res.rows[0]) : null
  }

  async getAppBySlug (slug: string): Promise<AppRow | null> {
    const res = await this.pool.query('SELECT * FROM apps WHERE slug = $1', [slug])
    return res.rows[0] ? PgStore.toApp(res.rows[0]) : null
  }

  async upsertApp (
    agentId: string,
    slug: string,
    blocks: AppBlocks,
    refs: { tokenAddress: string | null; hookAddress: string | null }
  ): Promise<AppRow> {
    const res = await this.pool.query(
      `INSERT INTO apps (agent_id, slug, name, tagline, idea, roadmap, links, x_handle, token_address, hook_address, published)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
       ON CONFLICT (agent_id) DO UPDATE SET
         name = EXCLUDED.name, tagline = EXCLUDED.tagline, idea = EXCLUDED.idea,
         roadmap = EXCLUDED.roadmap, links = EXCLUDED.links, x_handle = EXCLUDED.x_handle,
         token_address = EXCLUDED.token_address, hook_address = EXCLUDED.hook_address,
         published = true, updated_at = now()
       RETURNING *`,
      [
        agentId, slug, blocks.name, blocks.tagline, blocks.idea,
        JSON.stringify(blocks.roadmap), JSON.stringify(blocks.links), blocks.xHandle,
        refs.tokenAddress, refs.hookAddress
      ]
    )
    return PgStore.toApp(res.rows[0]!)
  }

  async updateAppField (agentId: string, field: keyof AppBlocks, value: unknown): Promise<AppRow | null> {
    // camelCase block field -> snake_case column (xHandle is the one that differs)
    const column = { name: 'name', tagline: 'tagline', idea: 'idea', roadmap: 'roadmap', links: 'links', xHandle: 'x_handle' }[field]
    if (!column) {
      throw new Error(`unknown app field: ${field}`)
    }
    const stored = field === 'roadmap' || field === 'links' ? JSON.stringify(value) : value
    const res = await this.pool.query(
      `UPDATE apps SET ${column} = $2, updated_at = now() WHERE agent_id = $1 RETURNING *`,
      [agentId, stored]
    )
    return res.rows[0] ? PgStore.toApp(res.rows[0]) : null
  }

  private static toInferencePayment (r: {
    id: string; agent_id: string; model: string; price_usdc6: string
    tokens_in: number | null; tokens_out: number | null; eip3009_nonce: string
    payer: string; payee: string; state: InferencePaymentRow['state']
    settlement_ref: string | null; created_at: Date; updated_at: Date
  }): InferencePaymentRow {
    return {
      id: r.id, agentId: r.agent_id, model: r.model, priceUsdc6: BigInt(r.price_usdc6),
      tokensIn: r.tokens_in, tokensOut: r.tokens_out, eip3009Nonce: r.eip3009_nonce,
      payer: r.payer, payee: r.payee, state: r.state, settlementRef: r.settlement_ref,
      createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString()
    }
  }

  async createInferencePayment (p: NewInferencePayment): Promise<InferencePaymentRow> {
    const res = await this.pool.query(
      `INSERT INTO inference_payments (agent_id, model, price_usdc6, eip3009_nonce, payer, payee, state, settlement_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [p.agentId, p.model, p.priceUsdc6.toString(), p.eip3009Nonce, p.payer, p.payee, p.state, p.settlementRef ?? null]
    )
    return PgStore.toInferencePayment(res.rows[0]!)
  }

  async getInferencePaymentByNonce (nonce: string): Promise<InferencePaymentRow | null> {
    const res = await this.pool.query('SELECT * FROM inference_payments WHERE eip3009_nonce = $1', [nonce])
    return res.rows[0] ? PgStore.toInferencePayment(res.rows[0]) : null
  }

  async updateInferenceUsage (id: string, tokensIn: number, tokensOut: number): Promise<void> {
    await this.pool.query(
      'UPDATE inference_payments SET tokens_in = $2, tokens_out = $3, updated_at = now() WHERE id = $1',
      [id, tokensIn, tokensOut]
    )
  }

  async setInferencePaymentState (id: string, state: InferencePaymentRow['state'], settlementRef: string | null = null): Promise<InferencePaymentRow> {
    const res = await this.pool.query(
      'UPDATE inference_payments SET state = $2, settlement_ref = COALESCE($3, settlement_ref), updated_at = now() WHERE id = $1 RETURNING *',
      [id, state, settlementRef]
    )
    if (!res.rows[0]) throw new Error(`inference payment ${id} not found`)
    return PgStore.toInferencePayment(res.rows[0])
  }

  async listInferencePayments (agentId: string, limit = 200): Promise<InferencePaymentRow[]> {
    const res = await this.pool.query(
      'SELECT * FROM inference_payments WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2',
      [agentId, limit]
    )
    return res.rows.map(PgStore.toInferencePayment)
  }

  async insertNonce (nonce: string): Promise<void> {
    await this.pool.query('INSERT INTO siwe_nonces (nonce) VALUES ($1) ON CONFLICT DO NOTHING', [nonce])
  }

  async consumeNonce (nonce: string, maxAgeSeconds: number): Promise<boolean> {
    // DELETE ... RETURNING is the atomic single-use consume; the age predicate
    // is the TTL. A replayed or expired nonce deletes nothing and returns 0.
    const res = await this.pool.query(
      `DELETE FROM siwe_nonces
       WHERE nonce = $1 AND created_at > now() - make_interval(secs => $2)
       RETURNING nonce`,
      [nonce, maxAgeSeconds]
    )
    return res.rowCount === 1
  }

  async hitRateLimit (scope: string, address: string, windowStart: Date): Promise<number> {
    const res = await this.pool.query<{ count: number }>(
      `INSERT INTO rate_limits (scope, address, window_start, count)
       VALUES ($1, lower($2), $3, 1)
       ON CONFLICT (scope, address, window_start)
       DO UPDATE SET count = rate_limits.count + 1
       RETURNING count`,
      [scope, address, windowStart]
    )
    return res.rows[0]!.count
  }

  async close (): Promise<void> {
    await this.pool.end()
  }

  // ------------------------------------------------------------------
  // worker-facing queries (not part of the pipeline's testable surface)
  // ------------------------------------------------------------------

  async getAutomation (id: string): Promise<{
    id: string; agent_id: string; kind: string; spec: unknown;
    intent_template: unknown; active: boolean
  } | null> {
    const res = await this.pool.query('SELECT * FROM automations WHERE id = $1', [id])
    return (res.rows[0] as never) ?? null
  }

  async markAutomationFired (id: string): Promise<void> {
    await this.pool.query('UPDATE automations SET last_fired_at = now() WHERE id = $1', [id])
  }

  async getAutomationAgentId (id: string): Promise<string | null> {
    const res = await this.pool.query('SELECT agent_id FROM automations WHERE id = $1', [id])
    return (res.rows[0]?.agent_id as string | undefined) ?? null
  }

  /** Worker-side scan: every active automation, with the agent's hook for
   *  fee_accrued evaluation. Due-ness is computed by the caller (and
   *  re-checked by the fire handler — re-validated at fire time). */
  async listActiveAutomations (): Promise<Array<{
    id: string; agent_id: string; kind: string; spec: { intervalSeconds?: number; thresholdUsdc?: number };
    intent_template: unknown; last_fired_at: string | null; created_at: string; hook_address: string | null
  }>> {
    const res = await this.pool.query(
      `SELECT a.id, a.agent_id, a.kind, a.spec, a.intent_template, a.last_fired_at, a.created_at, g.hook_address
       FROM automations a JOIN agents g ON g.id = a.agent_id
       WHERE a.active = true`
    )
    return res.rows as never
  }

  async registerWallet (agentId: string, address: string, provider: 'circle_sca' | 'local_dev' | 'agent_stack', providerRef: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO wallets (agent_id, address, provider, provider_ref) VALUES ($1, $2, $3, $4)
       ON CONFLICT (agent_id, provider) DO UPDATE SET address = EXCLUDED.address, provider_ref = EXCLUDED.provider_ref`,
      [agentId, address, provider, providerRef]
    )
  }

  async agentWalletAddress (agentId: string): Promise<string | null> {
    const w = await this.agentWallet(agentId)
    return w?.address ?? null
  }

  async agentWallet (agentId: string): Promise<{ address: string; provider: string; providerRef: string } | null> {
    const res = await this.pool.query(
      'SELECT address, provider, provider_ref FROM wallets WHERE agent_id = $1 ORDER BY created_at ASC LIMIT 1',
      [agentId]
    )
    const r = res.rows[0]
    if (!r?.address) return null
    return { address: r.address as string, provider: r.provider as string, providerRef: (r.provider_ref as string | null) ?? '' }
  }

  async listCampaignHooks (): Promise<string[]> {
    const res = await this.pool.query<{ hook_address: string }>('SELECT hook_address FROM campaigns')
    return res.rows.map(r => r.hook_address)
  }

  async indexerCheckpoint (name: string): Promise<bigint> {
    const res = await this.pool.query<{ last_block: string }>(
      'SELECT last_block FROM indexer_state WHERE name = $1', [name]
    )
    return res.rows[0] ? BigInt(res.rows[0].last_block) : 0n
  }

  async setIndexerCheckpoint (name: string, block: bigint): Promise<void> {
    await this.pool.query(
      `INSERT INTO indexer_state (name, last_block, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (name) DO UPDATE SET last_block = $2, updated_at = now()`,
      [name, block.toString()]
    )
  }

  async recordDeposit (
    hook: string,
    log: { transactionHash: string | null; args: { user?: string; amountOfTokens?: bigint; amountOfUSDC?: bigint } }
  ): Promise<void> {
    const campaign = await this.pool.query<{ agent_id: string }>(
      'SELECT agent_id FROM campaigns WHERE hook_address = $1', [hook]
    )
    if (!campaign.rows[0]) return
    const usdc = log.args.amountOfUSDC ?? 0n
    await this.appendLedger({
      agentId: campaign.rows[0].agent_id,
      bucket: 'trading',
      amount: { usdc6: usdc / 1_000_000_000_000n, residualWei: usdc % 1_000_000_000_000n },
      direction: 'credit',
      ...(log.transactionHash ? { fundingTxHash: log.transactionHash } : {}),
      note: `deposit by ${log.args.user ?? 'unknown'}`
    })
  }

  // ---- token board (worker write side; not on the Store interface) ----

  /** Discovery upsert: a TokenCreated log registers hook + token. */
  async upsertLgeToken (hookAddress: string, tokenAddress: string, createdBlock: bigint): Promise<void> {
    await this.pool.query(
      `INSERT INTO lge_tokens (hook_address, token_address, created_block) VALUES ($1, $2, $3)
       ON CONFLICT (hook_address) DO NOTHING`,
      [hookAddress.toLowerCase(), tokenAddress.toLowerCase(), createdBlock.toString()]
    )
  }

  /** State/statics refresh from chain reads. Only the fields the worker
   *  resolved are patched; unresolved fields keep their last value. */
  async updateLgeToken (hookAddress: string, patch: {
    poolId?: string
    name?: string
    symbol?: string
    decimals?: number
    totalSupply?: bigint
    tokenIsCurrency0?: boolean
    usdcDecimals?: number
    lgeFinished?: boolean
    lgeSuccessful?: boolean
    launchPriceUsdc?: number
    lastPriceUsdc?: number
  }): Promise<void> {
    const cols: Record<string, unknown> = {
      pool_id: patch.poolId,
      name: patch.name,
      symbol: patch.symbol,
      decimals: patch.decimals,
      total_supply: patch.totalSupply?.toString(),
      token_is_currency0: patch.tokenIsCurrency0,
      usdc_decimals: patch.usdcDecimals,
      lge_finished: patch.lgeFinished,
      lge_successful: patch.lgeSuccessful,
      launch_price_usdc: patch.launchPriceUsdc,
      last_price_usdc: patch.lastPriceUsdc
    }
    const sets: string[] = []
    const vals: unknown[] = [hookAddress.toLowerCase()]
    for (const [col, v] of Object.entries(cols)) {
      if (v === undefined) continue
      vals.push(v)
      sets.push(`${col} = $${vals.length}`)
    }
    if (sets.length === 0) return
    await this.pool.query(
      `UPDATE lge_tokens SET ${sets.join(', ')}, updated_at = now() WHERE hook_address = $1`,
      vals
    )
  }

  /** Idempotent swap insert — (tx_hash, log_index) is the natural key. */
  async recordLgeSwap (row: {
    txHash: string
    logIndex: number
    hookAddress: string
    blockNumber: bigint
    blockTs: Date | null
    trader: string | null
    isBuy: boolean
    tokenAmount: number
    usdcAmount: number
    priceUsdc: number | null
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO lge_swaps (tx_hash, log_index, hook_address, block_number, block_ts, trader, is_buy, token_amount, usdc_amount, price_usdc)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (tx_hash, log_index) DO NOTHING`,
      [row.txHash.toLowerCase(), row.logIndex, row.hookAddress.toLowerCase(), row.blockNumber.toString(),
        row.blockTs, row.trader?.toLowerCase() ?? null, row.isBuy, row.tokenAmount, row.usdcAmount, row.priceUsdc]
    )
  }

  /** Every discovered token row (worker refresh loop). */
  async listLgeTokenRows (): Promise<{
    hookAddress: string
    tokenAddress: string
    createdBlock: bigint
    poolId: string | null
    decimals: number | null
    totalSupply: bigint | null
    tokenIsCurrency0: boolean | null
    usdcDecimals: number | null
    lgeFinished: boolean
    lgeSuccessful: boolean
    launchPriceUsdc: number | null
  }[]> {
    const res = await this.pool.query(
      `SELECT hook_address, token_address, created_block, pool_id, decimals, total_supply,
              token_is_currency0, usdc_decimals, lge_finished, lge_successful, launch_price_usdc
       FROM lge_tokens ORDER BY created_block ASC`
    )
    return res.rows.map(r => ({
      hookAddress: r.hook_address as string,
      tokenAddress: r.token_address as string,
      createdBlock: BigInt(r.created_block as string),
      poolId: (r.pool_id as string | null) ?? null,
      decimals: (r.decimals as number | null) ?? null,
      totalSupply: r.total_supply != null ? BigInt(r.total_supply as string) : null,
      tokenIsCurrency0: (r.token_is_currency0 as boolean | null) ?? null,
      usdcDecimals: (r.usdc_decimals as number | null) ?? null,
      lgeFinished: r.lge_finished as boolean,
      lgeSuccessful: r.lge_successful as boolean,
      launchPriceUsdc: r.launch_price_usdc != null ? Number(r.launch_price_usdc) : null
    }))
  }

  // ---- token board (public read side; Store interface) ----

  async listLgeBoard (): Promise<LgeBoardToken[]> {
    const res = await this.pool.query(
      `SELECT t.hook_address, t.token_address, t.pool_id, t.name, t.symbol,
              t.launch_price_usdc, t.last_price_usdc, t.total_supply, t.decimals,
              a.slug AS agent_slug, a.name AS agent_name,
              COALESCE(w.trades, 0)::int AS trades_24h,
              COALESCE(w.buys, 0)::int AS buys_24h,
              COALESCE(w.traders, 0)::int AS traders_24h,
              COALESCE(w.volume, 0)::float8 AS volume_24h_usdc,
              COALESCE(tot.trades, 0)::int AS total_trades
       FROM lge_tokens t
       LEFT JOIN apps a ON lower(a.hook_address) = t.hook_address
       LEFT JOIN LATERAL (
         SELECT count(*) AS trades,
                count(*) FILTER (WHERE s.is_buy) AS buys,
                count(DISTINCT s.trader) AS traders,
                sum(s.usdc_amount) AS volume
         FROM lge_swaps s
         WHERE s.hook_address = t.hook_address
           AND s.block_ts > now() - interval '24 hours'
       ) w ON true
       LEFT JOIN LATERAL (
         SELECT count(*) AS trades FROM lge_swaps s WHERE s.hook_address = t.hook_address
       ) tot ON true
       WHERE t.lge_successful
       ORDER BY volume_24h_usdc DESC, t.updated_at DESC`
    )
    return res.rows.map(r => {
      const price = r.last_price_usdc != null ? Number(r.last_price_usdc)
        : r.launch_price_usdc != null ? Number(r.launch_price_usdc) : null
      const supply = r.total_supply != null && r.decimals != null
        ? Number(r.total_supply) / 10 ** Number(r.decimals) : null
      const trades = Number(r.trades_24h)
      const buys = Number(r.buys_24h)
      return {
        hookAddress: r.hook_address as string,
        tokenAddress: r.token_address as string,
        poolId: (r.pool_id as string | null) ?? null,
        name: (r.name as string | null) ?? null,
        symbol: (r.symbol as string | null) ?? null,
        launchPriceUsdc: r.launch_price_usdc != null ? Number(r.launch_price_usdc) : null,
        priceUsdc: price,
        mcapUsdc: price != null && supply != null ? price * supply : null,
        volume24hUsdc: Number(r.volume_24h_usdc),
        trades24h: trades,
        buys24h: buys,
        sells24h: trades - buys,
        traders24h: Number(r.traders_24h),
        totalTrades: Number(r.total_trades),
        agentSlug: (r.agent_slug as string | null) ?? null,
        agentName: (r.agent_name as string | null) ?? null
      }
    })
  }

  async listLgeActivity (limit = 50): Promise<LgeActivityRow[]> {
    const res = await this.pool.query(
      `SELECT s.tx_hash, s.log_index, s.hook_address, s.block_number, s.block_ts,
              s.trader, s.is_buy, s.token_amount, s.usdc_amount, s.price_usdc,
              t.symbol
       FROM lge_swaps s
       JOIN lge_tokens t ON t.hook_address = s.hook_address
       ORDER BY s.block_number DESC, s.log_index DESC
       LIMIT $1`,
      [Math.min(Math.max(1, limit), 200)]
    )
    return res.rows.map(r => ({
      txHash: r.tx_hash as string,
      logIndex: r.log_index as number,
      hookAddress: r.hook_address as string,
      symbol: (r.symbol as string | null) ?? null,
      blockNumber: (r.block_number as string).toString(),
      blockTs: r.block_ts instanceof Date ? r.block_ts.toISOString() : null,
      trader: (r.trader as string | null) ?? null,
      isBuy: r.is_buy as boolean,
      tokenAmount: Number(r.token_amount),
      usdcAmount: Number(r.usdc_amount),
      priceUsdc: r.price_usdc != null ? Number(r.price_usdc) : null
    }))
  }
}

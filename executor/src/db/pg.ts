/**
 * Postgres store — the production implementation of the Store interface.
 */

import pg from 'pg'
import type { State, StateChange } from '../pipeline/states.js'
import type {
  Store, IntentRow, NewIntent, QuoteRow, LedgerEntry, IdempotencyRecord, AgentRow
} from './store.js'
import { joinUsd, partsFromRow } from '../ledger/usd.js'

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
  policy: Record<string, unknown>
  created_at: Date
}

function toAgent (r: AgentDbRow): AgentRow {
  return {
    id: r.id, name: r.name, slug: r.slug,
    tokenAddress: r.token_address, hookAddress: r.hook_address,
    policy: r.policy, createdAt: r.created_at.toISOString()
  }
}

export class PgStore implements Store {
  private readonly pool: pg.Pool

  constructor (connectionString: string) {
    this.pool = new pg.Pool({ connectionString })
  }

  async createAgent (name: string, slug: string): Promise<AgentRow> {
    const res = await this.pool.query<AgentDbRow>(
      'INSERT INTO agents (name, slug) VALUES ($1, $2) RETURNING *',
      [name, slug]
    )
    return toAgent(res.rows[0]!)
  }

  async getAgent (id: string): Promise<AgentRow | null> {
    const res = await this.pool.query<AgentDbRow>('SELECT * FROM agents WHERE id = $1', [id])
    return res.rows[0] ? toAgent(res.rows[0]) : null
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

  async agentWalletAddress (agentId: string): Promise<string | null> {
    const res = await this.pool.query(
      'SELECT address FROM wallets WHERE agent_id = $1 ORDER BY created_at ASC LIMIT 1',
      [agentId]
    )
    return (res.rows[0]?.address as string | undefined) ?? null
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
}

/**
 * In-memory store for unit tests. Mirrors the Postgres implementation's
 * semantics exactly — notably atomic quote consume and optimistic state
 * transitions. Never used in production.
 */

import { randomUUID } from 'node:crypto'
import type { State, StateChange } from '../pipeline/states.js'
import type {
  Store, IntentRow, NewIntent, QuoteRow, LedgerEntry, IdempotencyRecord, AgentRow
} from './store.js'
import { joinUsd } from '../ledger/usd.js'

export class MemoryStore implements Store {
  private agents = new Map<string, AgentRow>()
  private intents = new Map<string, IntentRow>()
  private idem = new Map<string, IdempotencyRecord>()
  private quotes = new Map<string, QuoteRow>()
  private ledger: Array<LedgerEntry & { id: number }> = []

  createAgent (name: string, slug: string): Promise<AgentRow> {
    const row: AgentRow = {
      id: randomUUID(), name, slug,
      tokenAddress: null, hookAddress: null, policy: {},
      createdAt: new Date().toISOString()
    }
    this.agents.set(row.id, row)
    return Promise.resolve(structuredClone(row))
  }

  getAgent (id: string): Promise<AgentRow | null> {
    const r = this.agents.get(id)
    return Promise.resolve(r ? structuredClone(r) : null)
  }

  createIntent (n: NewIntent): Promise<IntentRow> {
    const now = new Date().toISOString()
    const row: IntentRow = {
      id: randomUUID(),
      agentId: n.agentId,
      walletAddress: n.walletAddress,
      type: n.type,
      params: n.params,
      state: 'QUEUED',
      stateHistory: [],
      quoteId: null,
      simulation: null,
      policy: null,
      txHash: null,
      rationale: n.rationale ?? null,
      rationaleSig: n.rationaleSig ?? null,
      error: null,
      requoteCount: 0,
      createdAt: now,
      updatedAt: now
    }
    this.intents.set(row.id, row)
    return Promise.resolve(structuredClone(row))
  }

  getIntent (id: string): Promise<IntentRow | null> {
    const r = this.intents.get(id)
    return Promise.resolve(r ? structuredClone(r) : null)
  }

  listIntents (agentId: string, limit = 100): Promise<IntentRow[]> {
    return Promise.resolve(
      [...this.intents.values()]
        .filter(i => i.agentId === agentId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map(i => structuredClone(i))
    )
  }

  transitionIntent (
    id: string,
    expectedFrom: State,
    change: StateChange,
    patch: Partial<Pick<IntentRow, 'quoteId' | 'simulation' | 'policy' | 'txHash' | 'error' | 'requoteCount'>> = {}
  ): Promise<void> {
    const row = this.intents.get(id)
    if (!row) throw new Error(`intent ${id} not found`)
    if (row.state !== expectedFrom) {
      throw new Error(`concurrent transition: expected ${expectedFrom}, found ${row.state}`)
    }
    row.stateHistory = [...row.stateHistory, change]
    row.state = change.to
    Object.assign(row, patch)
    row.updatedAt = new Date().toISOString()
    return Promise.resolve()
  }

  listByState (state: State): Promise<IntentRow[]> {
    return Promise.resolve([...this.intents.values()].filter(i => i.state === state).map(i => structuredClone(i)))
  }

  insertIdempotency (rec: IdempotencyRecord): Promise<'inserted' | 'exists'> {
    const k = `${rec.key}:${rec.walletAddress}`
    if (this.idem.has(k)) return Promise.resolve('exists')
    this.idem.set(k, rec)
    return Promise.resolve('inserted')
  }

  getIdempotency (key: string, walletAddress: string): Promise<IdempotencyRecord | null> {
    return Promise.resolve(this.idem.get(`${key}:${walletAddress}`) ?? null)
  }

  createQuote (q: Omit<QuoteRow, 'createdAt' | 'consumedAt'> & { consumedAt?: string | null }): Promise<QuoteRow> {
    const row: QuoteRow = { ...q, consumedAt: q.consumedAt ?? null, createdAt: new Date().toISOString() }
    this.quotes.set(row.id, row)
    return Promise.resolve(structuredClone(row))
  }

  getQuote (id: string): Promise<QuoteRow | null> {
    const r = this.quotes.get(id)
    return Promise.resolve(r ? structuredClone(r) : null)
  }

  consumeQuote (id: string): Promise<QuoteRow | null> {
    const row = this.quotes.get(id)
    if (!row || row.consumedAt !== null) return Promise.resolve(null)
    row.consumedAt = new Date().toISOString()
    return Promise.resolve(structuredClone(row))
  }

  appendLedger (e: LedgerEntry): Promise<void> {
    this.ledger.push({ ...e, id: this.ledger.length + 1 })
    return Promise.resolve()
  }

  ledgerBalance (agentId: string, bucket: string): Promise<bigint> {
    let sum = 0n
    for (const e of this.ledger) {
      if (e.agentId !== agentId || e.bucket !== bucket) continue
      const v = joinUsd(e.amount)
      sum += e.direction === 'credit' ? v : -v
    }
    return Promise.resolve(sum)
  }

  close (): Promise<void> {
    return Promise.resolve()
  }
}

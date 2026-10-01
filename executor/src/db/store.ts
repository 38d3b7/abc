/**
 * Executor store: the persistence boundary. The pipeline runner, idempotency
 * middleware and quote service depend ONLY on this interface, so unit tests
 * run against the in-memory implementation with zero Postgres.
 */

import type { State, StateChange } from '../pipeline/states.js'
import type { QuotePayload } from '../quotes/sign.js'
import type { UsdParts } from '../ledger/usd.js'

export interface IntentRow {
  id: string
  agentId: string
  walletAddress: string
  type: string
  params: Record<string, unknown>
  state: State
  stateHistory: StateChange[]
  quoteId: string | null
  simulation: Record<string, unknown> | null
  policy: Record<string, unknown> | null
  txHash: string | null
  rationale: string | null
  rationaleSig: string | null
  error: string | null
  requoteCount: number
  createdAt: string
  updatedAt: string
}

export interface NewIntent {
  agentId: string
  walletAddress: string
  type: string
  params: Record<string, unknown>
  rationale?: string
  rationaleSig?: string
}

export interface QuoteRow {
  id: string
  intentId: string | null
  walletAddress: string
  payload: QuotePayload
  signature: string
  consumedAt: string | null
  expiresAt: string
  createdAt: string
}

export interface LedgerEntry {
  agentId: string
  bucket: 'gas' | 'inference' | 'trading' | 'treasury'
  amount: UsdParts
  direction: 'credit' | 'debit'
  intentId?: string
  fundingTxHash?: string
  note?: string
}

export interface IdempotencyRecord {
  key: string
  walletAddress: string
  requestHash: string
  intentId: string
}

export interface AgentRow {
  id: string
  name: string
  slug: string
  tokenAddress: string | null
  hookAddress: string | null
  policy: Record<string, unknown>
  createdAt: string
}

export interface Store {
  createAgent (name: string, slug: string): Promise<AgentRow>
  getAgent (id: string): Promise<AgentRow | null>

  createIntent (n: NewIntent): Promise<IntentRow>
  getIntent (id: string): Promise<IntentRow | null>
  listIntents (agentId: string, limit?: number): Promise<IntentRow[]>
  /** Persist a state transition; throws if the stored state no longer
   *  matches `expectedFrom` (optimistic concurrency). */
  transitionIntent (id: string, expectedFrom: State, change: StateChange, patch?: Partial<Pick<IntentRow, 'quoteId' | 'simulation' | 'policy' | 'txHash' | 'error' | 'requoteCount'>>): Promise<void>
  listByState (state: State): Promise<IntentRow[]>

  insertIdempotency (rec: IdempotencyRecord): Promise<'inserted' | 'exists'>
  getIdempotency (key: string, walletAddress: string): Promise<IdempotencyRecord | null>

  createQuote (q: Omit<QuoteRow, 'createdAt' | 'consumedAt'> & { consumedAt?: string | null }): Promise<QuoteRow>
  getQuote (id: string): Promise<QuoteRow | null>
  /** Atomic single-use consume: returns the row iff this call consumed it. */
  consumeQuote (id: string): Promise<QuoteRow | null>

  appendLedger (e: LedgerEntry): Promise<void>
  ledgerBalance (agentId: string, bucket: string): Promise<bigint>

  close (): Promise<void>
}

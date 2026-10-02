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
  /** First provisioned wallet address, when one exists (wallets table). */
  walletAddress: string | null
  policy: Record<string, unknown>
  createdAt: string
}

export interface AutomationRow {
  id: string
  agentId: string
  kind: 'cron' | 'price' | 'fee_accrued'
  spec: Record<string, unknown>
  intentTemplate: Record<string, unknown>
  active: boolean
  lastFiredAt: string | null
  createdAt: string
}

export interface NewAutomation {
  agentId: string
  kind: AutomationRow['kind']
  spec: Record<string, unknown>
  intentTemplate: Record<string, unknown>
}

export interface NewCampaign {
  agentId: string
  tokenAddress: string
  hookAddress: string
  name?: string
  symbol?: string
  cap: string
  startBlock: string
  streamBlocks: string
  minTokenPrice: string
  maxTokenPrice: string
  feeBps: number
}

export interface CampaignRow {
  id: string
  agentId: string
  tokenAddress: string
  hookAddress: string
  name: string | null
  symbol: string | null
  cap: string
  startBlock: string
  streamBlocks: string
  minTokenPrice: string
  maxTokenPrice: string
  feeBps: number
  createdAt: string
}

export interface LedgerRow extends LedgerEntry {
  id: number
  createdAt: string
}

export interface AppBlock {
  text: string
  done: boolean
}

export interface AppLink {
  label: string
  url: string
}

export interface AppRow {
  id: string
  agentId: string
  slug: string
  name: string
  tagline: string
  idea: string
  roadmap: AppBlock[]
  links: AppLink[]
  xHandle: string | null
  tokenAddress: string | null
  hookAddress: string | null
  published: boolean
  createdAt: string
  updatedAt: string
}

export interface AppBlocks {
  name: string
  tagline: string
  idea: string
  roadmap: AppBlock[]
  links: AppLink[]
  xHandle: string | null
}

export interface AgentSkillRow {
  agentId: string
  slug: string
  enabled: boolean
  config: Record<string, unknown>
  addedAt: string
}

/** One paid model call (PRODUCT.md third lock). The EIP-3009 authorization
 *  nonce is the idempotency key; tokens_* and settlementRef backfill. */
export interface InferencePaymentRow {
  id: string
  agentId: string
  model: string
  priceUsdc6: bigint
  tokensIn: number | null
  tokensOut: number | null
  eip3009Nonce: string
  payer: string
  payee: string
  state: 'SETTLED' | 'UNCERTAIN' | 'FAILED'
  settlementRef: string | null
  createdAt: string
  updatedAt: string
}

export interface NewInferencePayment {
  agentId: string
  model: string
  priceUsdc6: bigint
  eip3009Nonce: string
  payer: string
  payee: string
  state: 'SETTLED' | 'UNCERTAIN' | 'FAILED'
  settlementRef?: string | null
}

export interface MessageRow {
  id: string
  agentId: string
  role: 'operator' | 'agent'
  clientKey: string | null
  replyTo: string | null
  text: string
  intentIds: string[]
  state: 'pending' | 'done' | 'failed'
  error: string | null
  createdAt: string
}

export interface NewMessage {
  agentId: string
  role: 'operator' | 'agent'
  clientKey?: string
  replyTo?: string
  text?: string
  intentIds?: string[]
  state?: 'pending' | 'done' | 'failed'
}

export interface Store {
  createAgent (name: string, slug: string): Promise<AgentRow>
  getAgent (id: string): Promise<AgentRow | null>
  listAgents (): Promise<AgentRow[]>
  updateAgentPolicy (id: string, policy: Record<string, unknown>): Promise<AgentRow | null>
  /** Record the provisioned wallet for an agent (idempotent per provider). */
  registerWallet (agentId: string, address: string, provider: 'circle_sca' | 'local_dev' | 'agent_stack', providerRef: string): Promise<void>
  agentWalletAddress (agentId: string): Promise<string | null>
  /** Full wallet row — the signer needs providerRef (e.g. Circle wallet id). */
  agentWallet (agentId: string): Promise<{ address: string; provider: string; providerRef: string } | null>
  registerCampaign (c: NewCampaign): Promise<void>
  listCampaigns (agentId: string): Promise<CampaignRow[]>
  listAutomations (agentId: string): Promise<AutomationRow[]>
  createAutomation (a: NewAutomation): Promise<AutomationRow>
  setAutomationActive (id: string, active: boolean): Promise<void>

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
  listLedger (agentId: string, limit?: number): Promise<LedgerRow[]>
  ledgerBalance (agentId: string, bucket: string): Promise<bigint>

  /** Throws a unique-violation (code 23505) if clientKey was already used for this agent. */
  createMessage (m: NewMessage): Promise<MessageRow>
  getMessageByClientKey (agentId: string, clientKey: string): Promise<MessageRow | null>
  listMessages (agentId: string, limit?: number): Promise<MessageRow[]>
  /** Worker fills the pending reply: pending -> done with text + produced intents. No-op otherwise. */
  completeMessage (id: string, patch: { text: string; intentIds: string[] }): Promise<void>
  /** pending -> failed with the error text. No-op otherwise. */
  failMessage (id: string, error: string): Promise<void>

  listAgentSkills (agentId: string): Promise<AgentSkillRow[]>
  /** Install is idempotent per (agent, slug): an existing row is returned unchanged. */
  installAgentSkill (agentId: string, slug: string, config?: Record<string, unknown>): Promise<AgentSkillRow>
  /** Returns the updated row, or null when the skill is not installed. */
  setAgentSkillEnabled (agentId: string, slug: string, enabled: boolean): Promise<AgentSkillRow | null>

  getApp (agentId: string): Promise<AppRow | null>
  getAppBySlug (slug: string): Promise<AppRow | null>
  /** Publish: upsert the agent's app blocks and mark it published. */
  upsertApp (agentId: string, slug: string, blocks: AppBlocks, refs: { tokenAddress: string | null; hookAddress: string | null }): Promise<AppRow>
  /** Edit one block; returns null when no app exists yet. */
  updateAppField (agentId: string, field: keyof AppBlocks, value: unknown): Promise<AppRow | null>

  /** Insert a settled/uncertain charge. Throws unique-violation (23505) on
   *  nonce replay — the seller catches it and serves the existing row. */
  createInferencePayment (p: NewInferencePayment): Promise<InferencePaymentRow>
  getInferencePaymentByNonce (nonce: string): Promise<InferencePaymentRow | null>
  /** Backfill token usage after the model call; no-op when the charge is unknown. */
  updateInferenceUsage (id: string, tokensIn: number, tokensOut: number): Promise<void>
  /** Reconciliation path: flip a FAILED/UNCERTAIN charge to SETTLED after a
   *  successful re-settle, and backfill the batch settlement reference. */
  setInferencePaymentState (id: string, state: InferencePaymentRow['state'], settlementRef?: string | null): Promise<InferencePaymentRow>
  listInferencePayments (agentId: string, limit?: number): Promise<InferencePaymentRow[]>

  close (): Promise<void>
}

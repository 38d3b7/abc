/**
 * In-memory store for unit tests. Mirrors the Postgres implementation's
 * semantics exactly — notably atomic quote consume and optimistic state
 * transitions. Never used in production.
 */

import { randomUUID } from 'node:crypto'
import type { State, StateChange } from '../pipeline/states.js'
import type {
  Store, IntentRow, NewIntent, QuoteRow, LedgerEntry, LedgerRow, IdempotencyRecord, AgentRow,
  AutomationRow, NewAutomation, NewCampaign, CampaignRow, MessageRow, NewMessage, AgentSkillRow,
  AppRow, AppBlocks, InferencePaymentRow, NewInferencePayment
} from './store.js'
import { joinUsd } from '../ledger/usd.js'

export class MemoryStore implements Store {
  private agents = new Map<string, AgentRow>()
  private intents = new Map<string, IntentRow>()
  private idem = new Map<string, IdempotencyRecord>()
  private quotes = new Map<string, QuoteRow>()
  private ledger: LedgerRow[] = []
  private automations = new Map<string, AutomationRow>()
  private campaigns: CampaignRow[] = []
  private wallets = new Map<string, { address: string; provider: string; providerRef: string }>()
  private messages = new Map<string, MessageRow>()

  createAgent (name: string, slug: string): Promise<AgentRow> {
    const row: AgentRow = {
      id: randomUUID(), name, slug,
      tokenAddress: null, hookAddress: null, walletAddress: null, policy: {},
      createdAt: new Date().toISOString()
    }
    this.agents.set(row.id, row)
    return Promise.resolve(structuredClone(row))
  }

  getAgent (id: string): Promise<AgentRow | null> {
    const r = this.agents.get(id)
    return Promise.resolve(r ? structuredClone(r) : null)
  }

  listAgents (): Promise<AgentRow[]> {
    return Promise.resolve(
      [...this.agents.values()]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(a => structuredClone(a))
    )
  }

  updateAgentPolicy (id: string, policy: Record<string, unknown>): Promise<AgentRow | null> {
    const r = this.agents.get(id)
    if (!r) return Promise.resolve(null)
    r.policy = structuredClone(policy)
    return Promise.resolve(structuredClone(r))
  }

  registerWallet (agentId: string, address: string, provider: string, providerRef: string): Promise<void> {
    this.wallets.set(`${agentId}:${provider}`, { address, provider, providerRef })
    const a = this.agents.get(agentId)
    if (a) a.walletAddress = address
    return Promise.resolve()
  }

  agentWalletAddress (agentId: string): Promise<string | null> {
    for (const [k, w] of this.wallets) {
      if (k.startsWith(`${agentId}:`)) return Promise.resolve(w.address)
    }
    return Promise.resolve(null)
  }

  agentWallet (agentId: string): Promise<{ address: string; provider: string; providerRef: string } | null> {
    for (const [k, w] of this.wallets) {
      if (k.startsWith(`${agentId}:`)) return Promise.resolve({ address: w.address, provider: w.provider, providerRef: w.providerRef })
    }
    return Promise.resolve(null)
  }

  registerCampaign (c: NewCampaign): Promise<void> {
    this.campaigns.push({
      id: randomUUID(),
      ...structuredClone(c),
      name: c.name ?? null,
      symbol: c.symbol ?? null,
      createdAt: new Date().toISOString()
    })
    const a = this.agents.get(c.agentId)
    if (a) {
      a.tokenAddress = c.tokenAddress
      a.hookAddress = c.hookAddress
    }
    return Promise.resolve()
  }

  listCampaigns (agentId: string): Promise<CampaignRow[]> {
    return Promise.resolve(structuredClone(this.campaigns.filter(c => c.agentId === agentId)))
  }

  listAutomations (agentId: string): Promise<AutomationRow[]> {
    return Promise.resolve(
      [...this.automations.values()]
        .filter(a => a.agentId === agentId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(a => structuredClone(a))
    )
  }

  createAutomation (a: NewAutomation): Promise<AutomationRow> {
    const row: AutomationRow = {
      id: randomUUID(),
      agentId: a.agentId,
      kind: a.kind,
      spec: structuredClone(a.spec),
      intentTemplate: structuredClone(a.intentTemplate),
      active: true,
      lastFiredAt: null,
      createdAt: new Date().toISOString()
    }
    this.automations.set(row.id, row)
    return Promise.resolve(structuredClone(row))
  }

  setAutomationActive (id: string, active: boolean): Promise<void> {
    const r = this.automations.get(id)
    if (r) r.active = active
    return Promise.resolve()
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
    this.ledger.push({ ...e, id: this.ledger.length + 1, createdAt: new Date().toISOString() })
    return Promise.resolve()
  }

  listLedger (agentId: string, limit = 200): Promise<LedgerRow[]> {
    // newest first, mirroring pg's ORDER BY id DESC
    const rows = this.ledger
      .filter(e => e.agentId === agentId)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
    return Promise.resolve(structuredClone(rows))
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

  // async so the duplicate-key rejection matches pg's async 23505
  async createMessage (m: NewMessage): Promise<MessageRow> {
    if (m.clientKey != null) {
      for (const row of this.messages.values()) {
        if (row.agentId === m.agentId && row.clientKey === m.clientKey) {
          const e = new Error(`duplicate client_key ${m.clientKey}`) as Error & { code: string }
          e.code = '23505'
          throw e
        }
      }
    }
    const row: MessageRow = {
      id: randomUUID(),
      agentId: m.agentId,
      role: m.role,
      clientKey: m.clientKey ?? null,
      replyTo: m.replyTo ?? null,
      text: m.text ?? '',
      intentIds: structuredClone(m.intentIds ?? []),
      state: m.state ?? 'done',
      error: null,
      createdAt: new Date().toISOString()
    }
    this.messages.set(row.id, row)
    return Promise.resolve(structuredClone(row))
  }

  getMessageByClientKey (agentId: string, clientKey: string): Promise<MessageRow | null> {
    for (const row of this.messages.values()) {
      if (row.agentId === agentId && row.clientKey === clientKey) return Promise.resolve(structuredClone(row))
    }
    return Promise.resolve(null)
  }

  listMessages (agentId: string, limit = 200): Promise<MessageRow[]> {
    return Promise.resolve(
      [...this.messages.values()]
        .filter(m => m.agentId === agentId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(-limit)
        .map(m => structuredClone(m))
    )
  }

  completeMessage (id: string, patch: { text: string; intentIds: string[] }): Promise<void> {
    const row = this.messages.get(id)
    if (!row || row.state !== 'pending') return Promise.resolve()
    row.state = 'done'
    row.text = patch.text
    row.intentIds = structuredClone(patch.intentIds)
    return Promise.resolve()
  }

  failMessage (id: string, error: string): Promise<void> {
    const row = this.messages.get(id)
    if (!row || row.state !== 'pending') return Promise.resolve()
    row.state = 'failed'
    row.error = error
    return Promise.resolve()
  }

  private skills = new Map<string, AgentSkillRow>()

  listAgentSkills (agentId: string): Promise<AgentSkillRow[]> {
    return Promise.resolve(
      [...this.skills.values()]
        .filter(s => s.agentId === agentId)
        .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
        .map(s => structuredClone(s))
    )
  }

  installAgentSkill (agentId: string, slug: string, config: Record<string, unknown> = {}): Promise<AgentSkillRow> {
    const k = `${agentId}:${slug}`
    const existing = this.skills.get(k)
    if (existing) return Promise.resolve(structuredClone(existing))
    const row: AgentSkillRow = {
      agentId, slug, enabled: true, config: structuredClone(config), addedAt: new Date().toISOString()
    }
    this.skills.set(k, row)
    return Promise.resolve(structuredClone(row))
  }

  setAgentSkillEnabled (agentId: string, slug: string, enabled: boolean): Promise<AgentSkillRow | null> {
    const row = this.skills.get(`${agentId}:${slug}`)
    if (!row) return Promise.resolve(null)
    row.enabled = enabled
    return Promise.resolve(structuredClone(row))
  }

  private apps = new Map<string, AppRow>()

  getApp (agentId: string): Promise<AppRow | null> {
    const r = this.apps.get(agentId)
    return Promise.resolve(r ? structuredClone(r) : null)
  }

  getAppBySlug (slug: string): Promise<AppRow | null> {
    for (const r of this.apps.values()) {
      if (r.slug === slug) return Promise.resolve(structuredClone(r))
    }
    return Promise.resolve(null)
  }

  upsertApp (
    agentId: string,
    slug: string,
    blocks: AppBlocks,
    refs: { tokenAddress: string | null; hookAddress: string | null }
  ): Promise<AppRow> {
    const existing = this.apps.get(agentId)
    const now = new Date().toISOString()
    const row: AppRow = {
      id: existing?.id ?? randomUUID(),
      agentId,
      slug,
      name: blocks.name,
      tagline: blocks.tagline,
      idea: blocks.idea,
      roadmap: structuredClone(blocks.roadmap),
      links: structuredClone(blocks.links),
      tokenAddress: refs.tokenAddress,
      hookAddress: refs.hookAddress,
      published: true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    this.apps.set(agentId, row)
    return Promise.resolve(structuredClone(row))
  }

  updateAppField (agentId: string, field: keyof AppBlocks, value: unknown): Promise<AppRow | null> {
    const row = this.apps.get(agentId)
    if (!row) return Promise.resolve(null)
    ;(row as unknown as Record<string, unknown>)[field] = structuredClone(value)
    row.updatedAt = new Date().toISOString()
    return Promise.resolve(structuredClone(row))
  }

  private inferencePayments = new Map<string, InferencePaymentRow>()

  // async so the duplicate-nonce rejection matches pg's async 23505
  async createInferencePayment (p: NewInferencePayment): Promise<InferencePaymentRow> {
    for (const row of this.inferencePayments.values()) {
      if (row.eip3009Nonce === p.eip3009Nonce) {
        const e = new Error(`duplicate eip3009_nonce ${p.eip3009Nonce}`) as Error & { code: string }
        e.code = '23505'
        throw e
      }
    }
    const now = new Date().toISOString()
    const row: InferencePaymentRow = {
      id: randomUUID(),
      agentId: p.agentId,
      model: p.model,
      priceUsdc6: p.priceUsdc6,
      tokensIn: null,
      tokensOut: null,
      eip3009Nonce: p.eip3009Nonce,
      payer: p.payer,
      payee: p.payee,
      state: p.state,
      settlementRef: p.settlementRef ?? null,
      createdAt: now,
      updatedAt: now
    }
    this.inferencePayments.set(row.id, row)
    return structuredClone(row)
  }

  getInferencePaymentByNonce (nonce: string): Promise<InferencePaymentRow | null> {
    for (const row of this.inferencePayments.values()) {
      if (row.eip3009Nonce === nonce) return Promise.resolve(structuredClone(row))
    }
    return Promise.resolve(null)
  }

  updateInferenceUsage (id: string, tokensIn: number, tokensOut: number): Promise<void> {
    const row = this.inferencePayments.get(id)
    if (!row) return Promise.resolve()
    row.tokensIn = tokensIn
    row.tokensOut = tokensOut
    row.updatedAt = new Date().toISOString()
    return Promise.resolve()
  }

  setInferencePaymentState (id: string, state: InferencePaymentRow['state'], settlementRef: string | null = null): Promise<InferencePaymentRow> {
    const row = this.inferencePayments.get(id)
    if (!row) return Promise.reject(new Error(`inference payment ${id} not found`))
    row.state = state
    if (settlementRef != null) row.settlementRef = settlementRef
    row.updatedAt = new Date().toISOString()
    return Promise.resolve(structuredClone(row))
  }

  listInferencePayments (agentId: string, limit = 200): Promise<InferencePaymentRow[]> {
    return Promise.resolve(
      [...this.inferencePayments.values()]
        .filter(p => p.agentId === agentId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map(p => structuredClone(p))
    )
  }

  close (): Promise<void> {
    return Promise.resolve()
  }
}

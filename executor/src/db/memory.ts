/**
 * In-memory store for unit tests. Mirrors the Postgres implementation's
 * semantics exactly — notably atomic quote consume and optimistic state
 * transitions. Never used in production.
 */

import { randomUUID } from 'node:crypto'
import type { State, StateChange } from '../pipeline/states.js'
import type {
  Store, IntentRow, NewIntent, QuoteRow, LedgerEntry, IdempotencyRecord, AgentRow,
  AutomationRow, NewAutomation, NewCampaign, MessageRow, NewMessage
} from './store.js'
import { joinUsd } from '../ledger/usd.js'

export class MemoryStore implements Store {
  private agents = new Map<string, AgentRow>()
  private intents = new Map<string, IntentRow>()
  private idem = new Map<string, IdempotencyRecord>()
  private quotes = new Map<string, QuoteRow>()
  private ledger: Array<LedgerEntry & { id: number }> = []
  private automations = new Map<string, AutomationRow>()
  private campaigns: NewCampaign[] = []
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
    this.campaigns.push(structuredClone(c))
    const a = this.agents.get(c.agentId)
    if (a) {
      a.tokenAddress = c.tokenAddress
      a.hookAddress = c.hookAddress
    }
    return Promise.resolve()
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

  close (): Promise<void> {
    return Promise.resolve()
  }
}

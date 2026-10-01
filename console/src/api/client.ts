/**
 * Executor API client. The console talks to the executor over HTTP with the
 * operator API key; on-chain data goes through wagmi directly.
 * Shapes mirror the executor's Store rows (camelCase).
 */

const BASE = (import.meta.env.VITE_EXECUTOR_URL as string | undefined) ?? 'http://localhost:8787'
const KEY = (import.meta.env.VITE_ABC_API_KEY as string | undefined) ?? ''

export interface Agent {
  id: string
  name: string
  slug: string
  tokenAddress: string | null
  hookAddress: string | null
  walletAddress: string | null
  policy: {
    maxPerTxUsdc6?: number
    confirmAboveUsdc6?: number
    recipientAllowlist?: string[]
    paused?: boolean
  }
  createdAt: string
}

export interface Intent {
  id: string
  agentId: string
  walletAddress: string
  type: string
  state: string
  stateHistory: { to: string; at: string; detail?: string }[]
  params: Record<string, unknown>
  txHash: string | null
  rationale: string | null
  rationaleSig: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface BucketBalance {
  usdc6: string
  residualWei: string
}

export interface Automation {
  id: string
  agentId: string
  kind: 'cron' | 'price' | 'fee_accrued'
  spec: Record<string, unknown>
  intentTemplate: Record<string, unknown>
  active: boolean
  lastFiredAt: string | null
  createdAt: string
}

export interface Skill {
  slug: string
  name: string
  version: string
  provider: string
  sourceUrl: string
  licenseSpdx: string
  kind: 'knowledge' | 'capability'
  description: string
  tools: string[]
  referenceOnly: boolean
}

export interface AgentSkill extends Skill {
  enabled: boolean
  config: Record<string, unknown>
  addedAt: string
}

export interface AgentMessage {
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

class ApiError extends Error {
  constructor (public status: number, message: string) { super(message) }
}

async function req<T> (method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(KEY ? { 'x-abc-key': KEY } : {}),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new ApiError(res.status, text)
  }
  return res.json() as Promise<T>
}

export const api = {
  listAgents: async () => (await req<{ agents: Agent[] }>('GET', '/agents')).agents,
  getAgent: async (id: string) => (await req<{ agent: Agent }>('GET', `/agents/${id}`)).agent,
  createAgent: async (name: string) =>
    (await req<{ agent: Agent }>('POST', '/agents', { name }, crypto.randomUUID())).agent,
  updateAgentPolicy: async (id: string, policy: Agent['policy']) =>
    (await req<{ agent: Agent }>('PATCH', `/agents/${id}`, { policy })).agent,

  listIntents: async (agentId: string) =>
    (await req<{ intents: Intent[] }>('GET', `/agents/${agentId}/intents`)).intents,
  getIntent: async (id: string) => (await req<{ intent: Intent }>('GET', `/intents/${id}`)).intent,
  postIntent: async (agentId: string, walletAddress: string, type: string, params: Record<string, unknown>) =>
    (await req<{ intent: Intent }>('POST', `/agents/${agentId}/intents`, { walletAddress, type, params }, crypto.randomUUID())).intent,
  confirmIntent: async (id: string) =>
    (await req<{ intent: Intent }>('POST', `/intents/${id}/confirm`, { confirmedBy: 'operator' })).intent,

  getLedger: async (agentId: string) =>
    (await req<{ balances: Record<string, string> }>('GET', `/agents/${agentId}/ledger`)).balances,

  listAutomations: async (agentId: string) =>
    (await req<{ automations: Automation[] }>('GET', `/agents/${agentId}/automations`)).automations,
  createAutomation: async (agentId: string, kind: Automation['kind'], spec: Record<string, unknown>, intentTemplate: Record<string, unknown>) =>
    (await req<{ automation: Automation }>('POST', `/agents/${agentId}/automations`, { kind, spec, intentTemplate }, crypto.randomUUID())).automation,
  setAutomationActive: (id: string, active: boolean) =>
    req<{ ok: true }>('PATCH', `/automations/${id}`, { active }),

  listMessages: async (agentId: string) =>
    (await req<{ messages: AgentMessage[] }>('GET', `/agents/${agentId}/messages`)).messages,
  sendMessage: async (agentId: string, text: string) =>
    req<{ message: AgentMessage; reply: AgentMessage | null }>('POST', `/agents/${agentId}/messages`, { text }, crypto.randomUUID()),

  listSkillCatalog: async () => (await req<{ skills: Skill[] }>('GET', '/skills')).skills,
  listAgentSkills: async (agentId: string) =>
    (await req<{ skills: AgentSkill[] }>('GET', `/agents/${agentId}/skills`)).skills,
  installSkill: async (agentId: string, slug: string) =>
    req<{ skill: AgentSkill }>('POST', `/agents/${agentId}/skills`, { slug }),
  installSkillFromUrl: async (agentId: string, url: string, licenseSpdx: string, provider: string) =>
    req<{ skill: AgentSkill; vendored: boolean }>('POST', `/agents/${agentId}/skills/install-url`, { url, licenseSpdx, provider }),
  setSkillEnabled: (agentId: string, slug: string, enabled: boolean) =>
    req<{ skill: AgentSkill }>('PATCH', `/agents/${agentId}/skills/${slug}`, { enabled }),

  registerCampaign: async (agentId: string, c: {
    tokenAddress: string; hookAddress: string; name?: string; symbol?: string
    cap: string; startBlock: string; streamBlocks: string
    minTokenPrice: string; maxTokenPrice: string; feeBps: number
  }) => req<{ ok: true }>('POST', `/agents/${agentId}/campaigns`, c, crypto.randomUUID())
}

export { BASE as EXECUTOR_BASE }

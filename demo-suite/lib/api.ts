import { createSiweMessage } from 'viem/siwe'
import { privateKeyToAccount } from 'viem/accounts'

const EXECUTOR_URL = process.env.EXECUTOR_URL ?? 'https://api.agenticbusinessconsole.com'

export interface Session {
  token: string
  address: string
}

export async function siweLogin (privateKey: `0x${string}`): Promise<Session> {
  const account = privateKeyToAccount(privateKey)
  const nonceRes = await fetch(`${EXECUTOR_URL}/auth/nonce`)
  const { nonce } = await nonceRes.json() as { nonce: string }
  const domain = process.env.CONSOLE_URL?.replace(/^https?:\/\//, '') ?? 'app.agenticbusinessconsole.com'
  const message = createSiweMessage({
    address: account.address,
    chainId: 5_042_002,
    domain,
    nonce,
    uri: `https://${domain}`,
    version: '1'
  })
  const signature = await account.signMessage({ message })
  const res = await fetch(`${EXECUTOR_URL}/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, signature })
  })
  if (!res.ok) throw new Error(`SIWE login failed: ${res.status}`)
  const { token, address } = await res.json() as { token: string; address: string }
  return { token, address }
}

async function api (path: string, session: Session, opts: { method?: string; body?: unknown; idempotency?: string } = {}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.token}`,
    'content-type': 'application/json'
  }
  if (opts.idempotency) headers['idempotency-key'] = opts.idempotency
  const res = await fetch(`${EXECUTOR_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  })
  const json = await res.json().catch(() => ({ error: 'no json' }))
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(json)}`)
  return json
}

export async function createAgent (session: Session, name: string, slug?: string) {
  const { agent } = await api('/agents', session, {
    method: 'POST',
    idempotency: `create-agent-${slug ?? name}`,
    body: { name, slug }
  }) as { agent: { id: string; slug: string; walletAddress: string } }
  return agent
}

export async function publishApp (session: Session, agentId: string, blocks: {
  name: string
  tagline: string
  idea: string
  roadmap?: Array<{ text: string; done: boolean }>
  links?: Array<{ label: string; url: string }>
  xHandle?: string | null
}) {
  const { intent } = await api(`/agents/${agentId}/intents`, session, {
    method: 'POST',
    idempotency: `publish-app-${agentId}`,
    body: {
      type: 'app_publish',
      params: {
        name: blocks.name,
        tagline: blocks.tagline,
        idea: blocks.idea,
        roadmap: blocks.roadmap ?? [],
        links: blocks.links ?? [],
        xHandle: blocks.xHandle ?? null
      }
    }
  }) as { intent: { id: string; state: string } }
  return intent
}

export async function registerCampaign (session: Session, agentId: string, campaign: {
  tokenAddress: string
  hookAddress: string
  name: string
  symbol: string
  cap: string
  startBlock: string
  streamBlocks: string
  minTokenPrice: string
  maxTokenPrice: string
  feeBps: number
}) {
  return api(`/agents/${agentId}/campaigns`, session, {
    method: 'POST',
    idempotency: `register-campaign-${hookAddress(campaign.hookAddress)}`,
    body: campaign
  })
}

function hookAddress (h: string): string {
  return h.toLowerCase().slice(2, 10)
}

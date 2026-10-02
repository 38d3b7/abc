/**
 * SIWE auth, ownership scoping, admin bypass, and the permissionless
 * guardrails (agent cap, chat and launch rate limits).
 *
 * Signing is real: Hardhat's well-known test keys sign genuine EIP-4361
 * messages, verified through viem's verifySiweMessage EOA path (local
 * ecrecover — no chain traffic). config.ts reads env at module load, so
 * ABC_ADMIN_ADDRESSES is set before the dynamic imports (vitest isolates
 * module registries per test file).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { createSiweMessage } from 'viem/siwe'

const USER_A = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
const USER_B = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const ADMIN = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a')

// Pin the env config reads (vitest auto-loads executor/.env locally, which
// would otherwise make these tests environment-dependent).
process.env.ABC_ADMIN_ADDRESSES = ADMIN.address.toLowerCase()
process.env.ABC_API_KEY = 'dev-key'
process.env.ABC_SESSION_SECRET = 'dev-session-secret'

const { createApp } = await import('./helpers.js')
const { MemoryStore } = await import('../src/db/memory.js')
const { issueSession } = await import('../src/api/auth.js')

const KEY = { 'X-ABC-Key': 'dev-key' }

let app: Awaited<ReturnType<typeof createApp>>

beforeEach(() => {
  app = createApp(new MemoryStore())
})

async function login (account: typeof USER_A, over: { domain?: string; chainId?: number } = {}): Promise<string> {
  const nonceRes = await app.request('/auth/nonce')
  const { nonce } = await nonceRes.json() as { nonce: string }
  const message = createSiweMessage({
    address: account.address,
    chainId: over.chainId ?? 5042002,
    domain: over.domain ?? 'localhost',
    nonce,
    uri: 'http://localhost:5174',
    version: '1'
  })
  const signature = await account.signMessage({ message })
  const res = await app.request('/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, signature })
  })
  expect(res.status).toBe(200)
  const { token } = await res.json() as { token: string }
  return token as string
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

describe('SIWE login', () => {
  it('nonce -> sign -> verify issues a session that authenticates requests', async () => {
    const token = await login(USER_A)
    const res = await app.request('/agents', { headers: bearer(token) })
    expect(res.status).toBe(200)
  })

  it('rejects a message for the wrong domain', async () => {
    const nonceRes = await app.request('/auth/nonce')
    const { nonce } = await nonceRes.json() as { nonce: string }
    const message = createSiweMessage({
      address: USER_A.address, chainId: 5042002, domain: 'evil.example',
      nonce, uri: 'https://evil.example', version: '1'
    })
    const signature = await USER_A.signMessage({ message })
    const res = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, signature })
    })
    expect(res.status).toBe(401)
  })

  it('rejects a message for the wrong chain', async () => {
    const res = await login(USER_A, { chainId: 1 }).catch(e => e)
    // login() asserts 200; a wrong-chain verify must fail instead
    expect(res).toBeInstanceOf(Error)
  })

  it('burns the nonce on use: replaying the same login fails', async () => {
    const nonceRes = await app.request('/auth/nonce')
    const { nonce } = await nonceRes.json() as { nonce: string }
    const message = createSiweMessage({
      address: USER_A.address, chainId: 5042002, domain: 'localhost',
      nonce, uri: 'http://localhost:5174', version: '1'
    })
    const signature = await USER_A.signMessage({ message })
    const body = JSON.stringify({ message, signature })
    const first = await app.request('/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    expect(first.status).toBe(200)
    const replay = await app.request('/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    expect(replay.status).toBe(401)
  })

  it('rejects tampered and expired session tokens', async () => {
    const token = await login(USER_A)
    const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa')
    expect((await app.request('/agents', { headers: bearer(tampered) })).status).toBe(401)

    const expired = issueSession('dev-session-secret', USER_A.address, Math.floor(Date.now() / 1000) - 25 * 3600)
    expect((await app.request('/agents', { headers: bearer(expired) })).status).toBe(401)
  })

  it('no credentials at all is a 401', async () => {
    expect((await app.request('/agents')).status).toBe(401)
  })
})

describe('ownership', () => {
  it('users see only their own agents; existence is hidden from others', async () => {
    const tokenA = await login(USER_A)
    const tokenB = await login(USER_B)

    const created = await app.request('/agents', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer(tokenA) },
      body: JSON.stringify({ name: 'Alpha' })
    })
    expect(created.status).toBe(201)
    const { agent } = await created.json() as { agent: { id: string; ownerAddress: string | null } }
    expect(agent.ownerAddress).toBe(USER_A.address.toLowerCase())

    // B's list is empty; direct access is 404, not 403 (no existence leak)
    const listB = await (await app.request('/agents', { headers: bearer(tokenB) })).json() as { agents: unknown[] }
    expect(listB.agents).toHaveLength(0)
    expect((await app.request(`/agents/${agent.id}`, { headers: bearer(tokenB) })).status).toBe(404)
    expect((await app.request(`/agents/${agent.id}/messages`, { headers: bearer(tokenB) })).status).toBe(404)

    // A sees the agent
    const listA = await (await app.request('/agents', { headers: bearer(tokenA) })).json() as { agents: unknown[] }
    expect(listA.agents).toHaveLength(1)
  })

  it('admin sees every agent, including operator-created (NULL-owner) ones', async () => {
    // operator backchannel creates an agent with no owner
    await app.request('/agents', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...KEY },
      body: JSON.stringify({ name: 'Ops Agent' })
    })
    const tokenUser = await login(USER_A)
    const tokenAdmin = await login(ADMIN)

    const userList = await (await app.request('/agents', { headers: bearer(tokenUser) })).json() as { agents: unknown[] }
    expect(userList.agents).toHaveLength(0)
    const adminList = await (await app.request('/agents', { headers: bearer(tokenAdmin) })).json() as { agents: unknown[] }
    expect(adminList.agents).toHaveLength(1)
    // the operator key still lists everything
    const opsList = await (await app.request('/agents', { headers: KEY })).json() as { agents: unknown[] }
    expect(opsList.agents).toHaveLength(1)
  })
})

describe('guardrails', () => {
  it('caps agents per wallet at 3', async () => {
    const token = await login(USER_A)
    for (let i = 0; i < 3; i++) {
      const res = await app.request('/agents', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...bearer(token) },
        body: JSON.stringify({ name: `Agent ${i}` })
      })
      expect(res.status).toBe(201)
    }
    const fourth = await app.request('/agents', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer(token) },
      body: JSON.stringify({ name: 'One Too Many' })
    })
    expect(fourth.status).toBe(429)
  })

  it('rate-limits chat at 30 user messages per hour', async () => {
    const token = await login(USER_A)
    const created = await app.request('/agents', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer(token) },
      body: JSON.stringify({ name: 'Chatterbox' })
    })
    const { agent } = await created.json() as { agent: { id: string; ownerAddress: string | null } }

    let lastStatus = 0
    for (let i = 0; i < 30; i++) {
      const res = await app.request(`/agents/${agent.id}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': `k${i}`, ...bearer(token) },
        body: JSON.stringify({ text: `hello ${i}` })
      })
      lastStatus = res.status
    }
    expect(lastStatus).toBe(201)
    const over = await app.request(`/agents/${agent.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'k-over', ...bearer(token) },
      body: JSON.stringify({ text: 'one too many' })
    })
    expect(over.status).toBe(429)
  })

  it('rate-limits lge_launch quotes at 2 per day; other quote types are unaffected', async () => {
    const token = await login(USER_A)
    const created = await app.request('/agents', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer(token) },
      body: JSON.stringify({ name: 'Launcher' })
    })
    const { agent } = await created.json() as { agent: { id: string; ownerAddress: string | null } }

    for (let i = 0; i < 2; i++) {
      const res = await app.request(`/agents/${agent.id}/quotes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...bearer(token) },
        body: JSON.stringify({ type: 'lge_launch', params: {} })
      })
      expect(res.status).toBe(422) // unpriceable stub — but not limited
    }
    const third = await app.request(`/agents/${agent.id}/quotes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer(token) },
      body: JSON.stringify({ type: 'lge_launch', params: {} })
    })
    expect(third.status).toBe(429)

    const other = await app.request(`/agents/${agent.id}/quotes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer(token) },
      body: JSON.stringify({ type: 'get_balances', params: {} })
    })
    expect(other.status).toBe(422)
  })

  it('operator and admin callers are exempt from limits', async () => {
    const created = await app.request('/agents', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...KEY },
      body: JSON.stringify({ name: 'Ops Chatter' })
    })
    const { agent } = await created.json() as { agent: { id: string; ownerAddress: string | null } }
    for (let i = 0; i < 35; i++) {
      const res = await app.request(`/agents/${agent.id}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': `ops${i}`, ...KEY },
        body: JSON.stringify({ text: `ops ${i}` })
      })
      expect(res.status).toBe(201)
    }
  })
})

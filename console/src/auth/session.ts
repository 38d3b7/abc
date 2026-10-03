/**
 * SIWE session for the console. The wallet is the account: connect, sign
 * one EIP-4361 message, and the executor returns a 24h HMAC session token
 * that rides as `Authorization: Bearer` on every API call. Token lives in
 * localStorage; expiry is read from the token payload so a stale session
 * never leaves the app looking logged-in.
 */

import { createSiweMessage } from 'viem/siwe'
import { arcTestnet } from '../lib/chain'

const BASE = (import.meta.env.VITE_EXECUTOR_URL as string | undefined) ?? 'http://localhost:8787'
const KEY = 'abc.session'

export interface Session {
  token: string
  address: string
  /** Unix seconds. */
  expiresAt: number
}

const listeners = new Set<() => void>()
function notify () { listeners.forEach(l => l()) }
export function subscribeSession (l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

function decodeExp (token: string): number {
  try {
    const payload = token.slice(0, token.lastIndexOf('.'))
    const parsed = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown }
    return typeof parsed.exp === 'number' ? parsed.exp : 0
  } catch {
    return 0
  }
}

function read (): Session | null {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as Session
    if (typeof s.token !== 'string' || typeof s.address !== 'string') return null
    if (s.expiresAt * 1000 <= Date.now()) return null
    return s
  } catch {
    return null
  }
}

/** Current session, or null when absent/expired. Referentially stable
 *  between changes so it can back useSyncExternalStore. */
let cachedRaw: string | null | undefined
let cached: Session | null = null
export function getSession (): Session | null {
  const raw = localStorage.getItem(KEY)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cached = read()
  } else if (cached && cached.expiresAt * 1000 <= Date.now()) {
    cached = null
  }
  return cached
}

export function getToken (): string | null {
  return getSession()?.token ?? null
}

export function clearSession () {
  if (!localStorage.getItem(KEY)) return
  localStorage.removeItem(KEY)
  cachedRaw = null
  cached = null
  notify()
}

/** Full login: nonce -> SIWE message -> wallet signature -> session token. */
export async function login (
  address: `0x${string}`,
  signMessage: (message: string) => Promise<`0x${string}`>
): Promise<Session> {
  const nonceRes = await fetch(`${BASE}/auth/nonce`)
  if (!nonceRes.ok) throw new Error(`executor nonce failed (${nonceRes.status})`)
  const { nonce } = (await nonceRes.json()) as { nonce: string }

  const message = createSiweMessage({
    address,
    chainId: arcTestnet.id,
    domain: window.location.host,
    uri: window.location.origin,
    nonce,
    statement: 'Sign in to the Agentic Business Console.',
    version: '1'
  })
  const signature = await signMessage(message)

  const verifyRes = await fetch(`${BASE}/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, signature })
  })
  if (!verifyRes.ok) {
    const text = await verifyRes.text().catch(() => '')
    throw new Error(text || `login rejected (${verifyRes.status})`)
  }
  const { token } = (await verifyRes.json()) as { token: string }
  const session: Session = { token, address: address.toLowerCase(), expiresAt: decodeExp(token) }
  localStorage.setItem(KEY, JSON.stringify(session))
  cachedRaw = localStorage.getItem(KEY)
  cached = session
  notify()
  return session
}


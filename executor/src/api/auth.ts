/**
 * SIWE (EIP-4361) auth for the permissionless console.
 *
 * Flow: GET /auth/nonce -> the console builds and wallet-signs a SIWE
 * message -> POST /auth/verify -> HMAC session token (24h). The wallet is
 * the account: the same key the user already transacts with. Sessions are
 * stateless; the only server state is the single-use nonce store.
 *
 * verifySiweMessage checks the signature (EOA locally, contract accounts
 * via ERC-6492 against the chain) and the message's domain/nonce/expiry.
 * We additionally pin the chain id and nonce freshness/single-use ourselves.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { PublicClient } from 'viem'
import { parseSiweMessage, verifySiweMessage } from 'viem/siwe'
import { config, arcTestnet } from '../config.js'
import type { Store } from '../db/store.js'

const NONCE_TTL_SECONDS = 600
const SESSION_TTL_SECONDS = 24 * 3600

export function newNonce (): string {
  return randomBytes(16).toString('hex')
}

function domainAllowed (domain: string | undefined): domain is string {
  if (!domain) return false
  const d = domain.toLowerCase()
  return config.siweDomains.includes(d) || /^localhost(:\d+)?$/.test(d)
}

/** Returns the verified lowercase address, or null on any failure. */
export async function verifySiweLogin (
  store: Store,
  chain: PublicClient,
  message: string,
  signature: `0x${string}`
): Promise<string | null> {
  const fields = parseSiweMessage(message)
  if (!fields.address || !domainAllowed(fields.domain)) return null
  if (!fields.nonce || !fields.chainId) return null
  if (fields.chainId !== arcTestnet.id) return null
  // Atomic single-use + TTL: a replayed or stale nonce never verifies.
  if (!(await store.consumeNonce(fields.nonce, NONCE_TTL_SECONDS))) return null
  const ok = await verifySiweMessage(chain, {
    address: fields.address,
    domain: fields.domain!,
    message,
    nonce: fields.nonce,
    signature,
    time: new Date()
  })
  return ok ? fields.address.toLowerCase() : null
}

export function issueSession (secret: string, address: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: address.toLowerCase(), exp: nowSeconds + SESSION_TTL_SECONDS })
  ).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/** Constant-time verify + expiry check. Returns the session address or null. */
export function verifySession (secret: string, token: string, nowSeconds = Math.floor(Date.now() / 1000)): string | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const sig = Buffer.from(token.slice(dot + 1))
  const expected = Buffer.from(createHmac('sha256', secret).update(payload).digest('base64url'))
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub?: unknown; exp?: unknown }
    if (typeof parsed.sub !== 'string' || typeof parsed.exp !== 'number') return null
    if (parsed.exp < nowSeconds) return null
    return parsed.sub
  } catch {
    return null
  }
}

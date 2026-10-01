/**
 * Signed quotes (DECISIONS.md §4): the executor prices an intent, signs the
 * quote object with its Ed25519 key, and executes ONLY by quoteId. A quote is
 * single-use and short-lived; there is no unsigned fallback path.
 */

import { signAsync, verifyAsync, getPublicKeyAsync } from '@noble/ed25519'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

export interface QuotePayload {
  quoteId: string
  wallet: string
  chainId: number
  type: string
  params: Record<string, unknown>
  /** Total value at risk (18-dec wei): value + worst-case gas. */
  valueWei: string
  gasEstimate: string
  feeWei: string
  notAfter: number // unix seconds
}

/** Canonical serialization: sorted keys, no whitespace. Signing ANY other
 *  serialization is a bug — verify uses this exact function. */
export function canonicalQuote (p: QuotePayload): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort)
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sort(x)])
      )
    }
    return v
  }
  return JSON.stringify(sort(p))
}

export function quoteDigest (p: QuotePayload): Uint8Array {
  return sha256(new TextEncoder().encode(canonicalQuote(p)))
}

export class QuoteSigner {
  private constructor (
    private readonly secret: Uint8Array,
    readonly publicKey: string
  ) {}

  static async create (secretHex?: string): Promise<QuoteSigner> {
    const secret = secretHex
      ? hexToBytes(secretHex.replace(/^0x/, ''))
      : crypto.getRandomValues(new Uint8Array(32))
    if (secret.length !== 32) throw new Error('quote secret must be 32 bytes')
    const pub = await getPublicKeyAsync(secret)
    return new QuoteSigner(secret, bytesToHex(pub))
  }

  async sign (payload: QuotePayload): Promise<string> {
    const sig = await signAsync(quoteDigest(payload), this.secret)
    return bytesToHex(sig)
  }

  async verify (payload: QuotePayload, signatureHex: string): Promise<boolean> {
    try {
      return await verifyAsync(hexToBytes(signatureHex), quoteDigest(payload), hexToBytes(this.publicKey))
    } catch {
      return false
    }
  }
}

export const QUOTE_TTL_SECONDS = 60

export function quoteExpired (p: QuotePayload, now = Math.floor(Date.now() / 1000)): boolean {
  return now > p.notAfter
}

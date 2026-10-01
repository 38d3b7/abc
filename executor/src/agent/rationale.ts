import { randomUUID } from 'node:crypto'
import type { QuoteSigner } from '../quotes/sign.js'

/**
 * Sign the model's one-sentence rationale for an intent. Shared by the
 * loop's intent tools and capability-skill tool overrides so every intent
 * record carries the same Ed25519 attestation shape (BASIS euthyna).
 */
export async function signRationale (
  quoteSigner: QuoteSigner,
  agentId: string,
  wallet: string,
  intentType: string
): Promise<string> {
  return quoteSigner.sign({
    quoteId: randomUUID(),
    wallet, chainId: 0, type: 'rationale',
    params: { agentId, intentType },
    valueWei: '0', gasEstimate: '0', feeWei: '0',
    notAfter: 0
  })
}

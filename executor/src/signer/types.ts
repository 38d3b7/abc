/**
 * Signer adapter layer (DECISIONS.md §2).
 *
 * The interface is `send(FinalTx) -> { txHash } | PolicyRefusal` — NOT `sign`.
 * An SCA wallet never returns a raw signature: Circle builds the userOp,
 * signs, and broadcasts via the contract-execution endpoint, returning a
 * Circle tx id that resolves to an on-chain txHash. SIGNED -> BROADCAST happen
 * inside Circle for this adapter; Circle compliance/policy errors map to
 * PolicyRefusal.
 */

import type { FinalTx } from '../intents/types.js'

export interface SentTx {
  kind: 'sent'
  txHash: `0x${string}`
}

export interface PolicyRefusal {
  kind: 'refusal'
  reason: string
  code?: string
}

export type SendResult = SentTx | PolicyRefusal

export interface SignerAdapter {
  readonly name: string
  /** Provision (lazily) and return the wallet address for an agent. */
  ensureWallet (agentId: string, providerRef?: string): Promise<{ address: string; providerRef: string }>
  /** provider is the wallet's registered custody (wallets.provider); the
   *  composite signer dispatches on it so pre-Circle local_dev wallets keep
   *  working beside Circle-custodied ones. */
  send (tx: FinalTx, ctx: { agentId: string; provider?: string; providerRef?: string }): Promise<SendResult>
}

export function isSent (r: SendResult): r is SentTx {
  return r.kind === 'sent'
}

/**
 * Agent Stack adapter — stub. Circle's Agent Stack (agent-controlled wallets)
 * is the intended production signer; until its API is wired in, every call
 * returns a PolicyRefusal so nothing silently falls back to a hosted key.
 */

import type { SendResult, SignerAdapter } from './types.js'

export class AgentStackSigner implements SignerAdapter {
  readonly name = 'agent_stack'

  ensureWallet (): Promise<{ address: string; providerRef: string }> {
    throw new Error('AgentStackSigner: not implemented (stub)')
  }

  send (): Promise<SendResult> {
    return Promise.resolve({
      kind: 'refusal',
      reason: 'agent_stack adapter not configured (stub)',
      code: 'NOT_IMPLEMENTED'
    })
  }
}

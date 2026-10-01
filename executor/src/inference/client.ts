/**
 * Buyer side of the inference rail: the agent's dedicated inference key
 * (funded by a capped draw from its InferenceEscrow credit) pays the
 * executor's seller endpoint per model call through Circle Gateway's x402
 * batching. `charge` runs the full 402 negotiation (PAYMENT-REQUIRED ->
 * signed Gateway authorization -> PAYMENT-SIGNATURE retry); `reportUsage`
 * backfills the token counts after the model answers.
 */

import { GatewayClient } from '@circle-fin/x402-batching/client'

/** The seam the agent loop charges through (fakeable in tests). */
export interface InferenceBuyer {
  charge (agentId: string, model: string): Promise<{ chargeId: string }>
  reportUsage (chargeId: string, tokensIn: number, tokensOut: number): Promise<void>
}

interface ChargeResponse {
  charge?: { id: string }
  error?: string
}

export function createInferenceBuyer (cfg: {
  /** Executor base URL the seller routes live on (e.g. http://localhost:8787). */
  chargeBaseUrl: string
  /** The inference EOA key (0x-prefixed, 32 bytes). */
  privateKey: `0x${string}`
}): InferenceBuyer {
  const gateway = new GatewayClient({ chain: 'arcTestnet', privateKey: cfg.privateKey })
  const chargeUrl = `${cfg.chargeBaseUrl.replace(/\/$/, '')}/inference/charge`

  return {
    async charge (agentId, model) {
      const { data } = await gateway.pay<ChargeResponse>(chargeUrl, {
        method: 'POST',
        body: { agentId, model }
      })
      if (!data?.charge?.id) {
        throw new Error(`inference charge refused: ${data?.error ?? 'no charge row returned'}`)
      }
      return { chargeId: data.charge.id }
    },

    async reportUsage (chargeId, tokensIn, tokensOut) {
      const res = await fetch(`${cfg.chargeBaseUrl.replace(/\/$/, '')}/inference/charge/${chargeId}/usage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tokensIn, tokensOut })
      })
      if (!res.ok) throw new Error(`usage report failed (${res.status})`)
    }
  }
}

/**
 * x402 seller side of the inference rail (PRODUCT.md third lock): the
 * executor charges the agent's inference key per model call.
 *
 * Flow (Gateway batched nanopayments, @circle-fin/x402-batching):
 *   1. Buyer POSTs /inference/charge with no payment -> 402 + PAYMENT-REQUIRED
 *      header (base64 PaymentRequired v2, scheme "exact", GatewayWalletBatched
 *      typed-data domain, 7-day validity window).
 *   2. Buyer signs an EIP-3009-style Gateway authorization and retries with
 *      the PAYMENT-SIGNATURE header.
 *   3. We settle via the BatchFacilitatorClient (settle directly, not
 *      verify->settle — settle guarantees settlement) and record one
 *      inference_payments row keyed by the authorization nonce
 *      (idempotency: a replayed payment returns the existing charge).
 *
 * Verdict discipline (REPO-MINING OneShot synthesis): settle returning
 * success:false is a refusal (FAILED, no money moved); settle THROWING is
 * UNCERTAIN (the Gateway may have accepted the batch) — the row is kept for
 * reconciliation and a nonce replay re-attempts settlement.
 */

import type { Hono } from 'hono'
import type { Store, InferencePaymentRow } from '../db/store.js'
import type { BatchFacilitatorClient } from '@circle-fin/x402-batching/server'
import { CHAIN_CONFIGS } from '@circle-fin/x402-batching/client'

/** The slice of BatchFacilitatorClient the seller uses (fakeable in tests).
 *  Types are derived from the client itself so the dual @x402/core builds
 *  (esm/cjs) can never drift the seam apart from the real thing. */
export type FacilitatorSettle = BatchFacilitatorClient['settle']
export type SettleResponse = Awaited<ReturnType<FacilitatorSettle>>
export type PaymentRequirements = Parameters<FacilitatorSettle>[1]
export type PaymentPayload = Parameters<FacilitatorSettle>[0]
export interface FacilitatorSeam {
  settle: FacilitatorSettle
}

export interface InferenceSellerDeps {
  store: Store
  facilitator: FacilitatorSeam
  /** Payee — the executor's inference revenue address (keeper EOA). */
  sellerAddress: string
  /** Flat per-call price in 6-decimal USDC units. */
  priceUsdc6: bigint
  chainId?: number
}

const ARC = CHAIN_CONFIGS.arcTestnet
const NETWORK = `eip155:${ARC.chain.id}`
/** 7 days plus the verification-latency buffer; the buyer clamps its signed
 *  validBefore to at least this far out (Gateway rejects shorter windows). */
const MAX_TIMEOUT_SECONDS = 604_900

interface GatewayAuthorization {
  from: string
  to: string
  value: string
  validAfter: string
  validBefore: string
  nonce: string
}

interface PaymentPayloadV2 {
  x402Version: number
  accepted?: Record<string, unknown>
  payload?: { authorization?: GatewayAuthorization; signature?: string }
}

function requirements (sellerAddress: string, priceUsdc6: bigint): PaymentRequirements {
  return {
    scheme: 'exact', // Gateway API requires 'exact'
    network: NETWORK,
    asset: ARC.usdc,
    amount: priceUsdc6.toString(),
    payTo: sellerAddress,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
    extra: {
      name: 'GatewayWalletBatched',
      version: '1',
      verifyingContract: ARC.gatewayWallet
    }
  } as PaymentRequirements
}

function decodePayment (header: string): PaymentPayloadV2 | null {
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf-8')) as PaymentPayloadV2
  } catch {
    return null
  }
}

/** JSON-safe charge row (priceUsdc6 is a bigint in the store). */
function serialize (row: InferencePaymentRow): Record<string, unknown> {
  return { ...row, priceUsdc6: row.priceUsdc6.toString() }
}

export function registerInferenceSeller (app: Hono<any>, deps: InferenceSellerDeps): void {
  const req = requirements(deps.sellerAddress, deps.priceUsdc6)

  app.post('/inference/charge', async c => {
    const body = await c.req.json<{ agentId?: string; model?: string }>().catch(() => null)
    if (!body?.agentId || !body.model) return c.json({ error: 'agentId and model required' }, 400)
    const agentId = body.agentId
    const model = body.model
    const agent = await deps.store.getAgent(agentId)
    if (!agent) return c.json({ error: 'agent not found' }, 404)

    const paymentHeader = c.req.header('payment-signature')
    if (!paymentHeader) {
      const paymentRequired = {
        x402Version: 2,
        resource: { url: c.req.url, description: 'inference call', mimeType: 'application/json' },
        accepts: [req]
      }
      c.header('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(paymentRequired)).toString('base64'))
      return c.json({}, 402)
    }

    const payment = decodePayment(paymentHeader)
    const auth = payment?.payload?.authorization
    if (!payment || !auth?.nonce || !auth.from) {
      return c.json({ error: 'malformed PAYMENT-SIGNATURE payload' }, 400)
    }

    // Idempotency: the EIP-3009 nonce keys the charge. A settled replay
    // returns the existing row; a failed/uncertain one re-attempts settlement.
    const existing = await deps.store.getInferencePaymentByNonce(auth.nonce)
    if (existing && existing.state === 'SETTLED') {
      return c.json({ charge: serialize(existing), replay: true }, 200)
    }

    let settled: SettleResponse
    try {
      settled = await deps.facilitator.settle(payment as PaymentPayload, req)
    } catch (e) {
      // UNKNOWN is not failure: the batch may have been accepted. Keep the
      // row for reconciliation; the buyer may replay the same nonce.
      const row = existing ?? await deps.store.createInferencePayment({
        agentId: agent.id,
        model,
        priceUsdc6: deps.priceUsdc6,
        eip3009Nonce: auth.nonce,
        payer: auth.from,
        payee: deps.sellerAddress,
        state: 'UNCERTAIN'
      })
      return c.json({ error: `settlement uncertain: ${(e as Error).message}`, charge: serialize(row) }, 502)
    }

    if (!settled.success) {
      const row = existing ?? await deps.store.createInferencePayment({
        agentId: agent.id,
        model,
        priceUsdc6: deps.priceUsdc6,
        eip3009Nonce: auth.nonce,
        payer: auth.from,
        payee: deps.sellerAddress,
        state: 'FAILED'
      })
      return c.json({ error: `payment refused: ${settled.errorReason ?? 'unknown'}`, charge: serialize(row) }, 402)
    }

    const row = existing
      ? await deps.store.setInferencePaymentState(existing.id, 'SETTLED', settled.transaction || null)
      : await deps.store.createInferencePayment({
        agentId: agent.id,
        model,
        priceUsdc6: deps.priceUsdc6,
        eip3009Nonce: auth.nonce,
        payer: auth.from,
        payee: deps.sellerAddress,
        state: 'SETTLED',
        settlementRef: settled.transaction || null
      })
    return c.json({ charge: serialize(row) }, 200)
  })

  // Usage backfill. The charge id is a bearer capability: it is returned
  // only to the payer, inside the paid response.
  app.post('/inference/charge/:id/usage', async c => {
    const body = await c.req.json<{ tokensIn?: number; tokensOut?: number }>().catch(() => null)
    if (typeof body?.tokensIn !== 'number' || typeof body.tokensOut !== 'number') {
      return c.json({ error: 'tokensIn and tokensOut required' }, 400)
    }
    await deps.store.updateInferenceUsage(c.req.param('id'), body.tokensIn, body.tokensOut)
    return c.json({ ok: true })
  })
}

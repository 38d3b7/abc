/**
 * Circle developer-controlled SCA adapter (primary).
 *
 * One wallet set holds all agent wallets; each agent gets one SCA on
 * ARC-TESTNET, provisioned lazily and stored on the agent's wallet row. The
 * SCA deploys on its first on-chain tx and Circle manages userOp gas — the §3
 * nonce manager and fee formula apply only to the local adapter and the
 * keeper EOA.
 *
 * Method names verified against @circle-fin/developer-controlled-wallets@9.6.0
 * type definitions (dist/types/developer-controlled-wallets.d.ts).
 */

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'
import { formatUnits } from 'viem'
import type { FinalTx } from '../intents/types.js'
import type { SendResult, SignerAdapter } from './types.js'

const POLL_INTERVAL_MS = 1_500
const POLL_TIMEOUT_MS = 60_000

type CircleClient = ReturnType<typeof initiateDeveloperControlledWalletsClient>

export class CircleScaSigner implements SignerAdapter {
  readonly name = 'circle_sca'
  private readonly client: CircleClient

  constructor (
    apiKey: string,
    entitySecret: string,
    private readonly walletSetId: string
  ) {
    if (!apiKey || !entitySecret || !walletSetId) {
      throw new Error('CircleScaSigner requires CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, CIRCLE_WALLET_SET_ID')
    }
    this.client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })
  }

  async ensureWallet (_agentId: string, providerRef?: string): Promise<{ address: string; providerRef: string }> {
    if (providerRef) {
      const res = await this.client.getWallet({ id: providerRef })
      const w = res.data?.wallet
      if (w?.address) return { address: w.address, providerRef: w.id ?? providerRef }
    }
    const res = await this.client.createWallets({
      blockchains: ['ARC-TESTNET'],
      count: 1,
      walletSetId: this.walletSetId,
      accountType: 'SCA'
    })
    const w = res.data?.wallets?.[0]
    if (!w?.id || !w.address) throw new Error('Circle createWallets returned no wallet')
    return { address: w.address, providerRef: w.id }
  }

  async send (tx: FinalTx, ctx: { agentId: string; providerRef?: string }): Promise<SendResult> {
    if (!ctx.providerRef) {
      return { kind: 'refusal', reason: 'no Circle wallet provisioned for agent', code: 'NO_WALLET' }
    }
    let id: string
    try {
      const res = await this.client.createContractExecutionTransaction({
        walletId: ctx.providerRef,
        contractAddress: tx.to,
        callData: tx.data,
        // Circle amounts are whole-token decimal strings; Arc native USDC is 18-dec.
        amount: formatUnits(tx.value, 18),
        fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
        idempotencyKey: `${ctx.agentId}:${tx.to}:${tx.data.slice(0, 18)}:${tx.value.toString()}`
      })
      if (!res.data?.id) return { kind: 'refusal', reason: 'Circle returned no transaction id', code: 'NO_TX_ID' }
      id = res.data.id
    } catch (e) {
      // Circle compliance/policy rejections surface as 4xx with a message.
      return { kind: 'refusal', reason: `Circle rejected: ${(e as Error).message}`, code: 'CIRCLE_REJECTED' }
    }

    // Resolve the Circle tx id to an on-chain hash. SIGNED -> BROADCAST happen
    // inside Circle; DENIED/FAILED map to PolicyRefusal.
    const deadline = Date.now() + POLL_TIMEOUT_MS
    for (;;) {
      const res = await this.client.getTransaction({ id })
      const t = res.data?.transaction
      const state = t?.state as string | undefined
      if (state === 'CONFIRMED' || state === 'COMPLETE' || state === 'CLEARED') {
        const txHash = t?.txHash as `0x${string}` | undefined
        if (!txHash) return { kind: 'refusal', reason: 'Circle confirmed without txHash', code: 'NO_TX_HASH' }
        return { kind: 'sent', txHash }
      }
      if (state === 'DENIED' || state === 'FAILED' || state === 'CANCELLED') {
        const reason = (t as { errorReason?: string } | undefined)?.errorReason || `Circle tx ${state}`
        return { kind: 'refusal', reason, code: state }
      }
      if (Date.now() > deadline) {
        return { kind: 'refusal', reason: `Circle tx ${id} stuck in ${state} after ${POLL_TIMEOUT_MS}ms`, code: 'TIMEOUT' }
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    }
  }
}

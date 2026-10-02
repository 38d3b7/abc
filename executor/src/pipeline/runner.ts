/**
 * Pipeline runner: drives an intent through the state machine. All chain
 * reads go through an injected minimal client so tests can fake them; all
 * persistence through the Store interface; signing through the adapter.
 *
 * Valuation is by construction from typed params (no debug_traceCall — the
 * Arc RPC does not support it; day-0 finding). Anything the runner cannot
 * price is refused (fail closed).
 */

import { randomUUID } from 'node:crypto'
import type { PublicClient } from 'viem'
import type { Store, IntentRow } from '../db/store.js'
import {
  transition, type State, type StateChange
} from './states.js'
import { classifyRevert, mayRequote } from './revert.js'
import {
  parseIntent, buildTx, VALUE_INTENTS, UnpriceableIntent,
  type TypedIntent, type FinalTx, type IntentParams, type IntentType
} from '../intents/types.js'
import { QuoteSigner, quoteExpired, QUOTE_TTL_SECONDS, type QuotePayload } from '../quotes/sign.js'
import type { SignerAdapter } from '../signer/types.js'
import { isSent } from '../signer/types.js'
import { splitUsd } from '../ledger/usd.js'
import { EFFECT_INTENTS } from '../intents/types.js'
import { applyEffect } from './effects.js'
import { prepareLaunch as mineLaunch, type LaunchRequest, type PreparedLaunch } from '../lge/launch.js'
import { readLgeTerminalState, type LgeTerminalState } from '../lge/state.js'
import type { AppRow } from '../db/store.js'

export interface PolicyConfig {
  /** Per-tx value ceiling (18-dec wei). */
  maxValueWei: bigint
  /** Above this, intents park in AWAITING_CONFIRMATION. */
  confirmationThresholdWei: bigint
  /** transfer recipients allowed without confirmation. */
  recipientAllowlist: string[]
}

export const DEFAULT_POLICY: PolicyConfig = {
  maxValueWei: 100n * 10n ** 18n, // 100 USDC
  confirmationThresholdWei: 10n * 10n ** 18n, // 10 USDC
  recipientAllowlist: []
}

export class PolicyViolation extends Error {
  constructor (reason: string) {
    super(reason)
    this.name = 'PolicyViolation'
  }
}

/** The slice of viem's PublicClient the runner uses (fakeable in tests). */
export interface ChainReader {
  estimateGas (args: { to: `0x${string}`; data?: `0x${string}`; value?: bigint; account?: `0x${string}` }): Promise<bigint>
  call (args: { to: `0x${string}`; data?: `0x${string}`; value?: bigint; account?: `0x${string}` }): Promise<{ data?: `0x${string}` | undefined }>
  waitForTransactionReceipt (args: { hash: `0x${string}`; timeout?: number }): Promise<{ status: 'success' | 'reverted'; transactionHash: string }>
  getBalance (args: { address: `0x${string}` }): Promise<bigint>
  getBlockNumber (): Promise<bigint>
  getCode (args: { address: `0x${string}` }): Promise<`0x${string}` | undefined>
}

export interface RunnerDeps {
  store: Store
  signer: SignerAdapter
  chain: ChainReader
  quoteSigner: QuoteSigner
  chainId: number
  policy?: Partial<PolicyConfig>
  /** Showcase push for app effects; default no-op (local dev). Tests capture. */
  pushApp?: (app: AppRow) => Promise<void>
}

export class PipelineRunner {
  private readonly policy: PolicyConfig

  constructor (private readonly d: RunnerDeps) {
    this.policy = { ...DEFAULT_POLICY, ...d.policy }
  }

  // ------------------------------------------------------------------
  // entry points
  // ------------------------------------------------------------------

  /** One-shot: quote + execute inline (agent loop, API one-shot writes). */
  async runIntent (
    agentId: string,
    walletAddress: string,
    type: string,
    params: Record<string, unknown>,
    rationale?: { text: string; signature: string }
  ): Promise<IntentRow> {
    const intent = parseIntent(type, params)
    const row = await this.d.store.createIntent({
      agentId,
      walletAddress,
      type: intent.type,
      params: intent.params as Record<string, unknown>,
      ...(rationale ? { rationale: rationale.text, rationaleSig: rationale.signature } : {})
    })
    return this.drive(row.id)
  }

  /** Two-step: price now, execute later by quoteId (console confirm flow). */
  async quoteIntent (
    agentId: string,
    walletAddress: string,
    type: string,
    params: Record<string, unknown>
  ): Promise<{ intent: IntentRow; quote?: QuotePayload; signature?: string }> {
    const intent = parseIntent(type, params)
    const row = await this.d.store.createIntent({
      agentId, walletAddress, type: intent.type, params: intent.params as Record<string, unknown>
    })
    const res = await this.quoteStage(row)
    return { intent: res.intent, ...(res.quote ? { quote: res.quote, signature: res.signature } : {}) }
  }

  async executeQuote (intentId: string, quoteId: string): Promise<IntentRow> {
    const intent = await this.mustGet(intentId)
    if (intent.state !== 'QUOTED') throw new Error(`intent ${intentId} is ${intent.state}, not QUOTED`)
    if (intent.quoteId !== quoteId) throw new Error('quote does not belong to intent')

    // Atomic single-use consume BEFORE any further work.
    const quote = await this.d.store.consumeQuote(quoteId)
    if (!quote) throw new Error('quote already consumed')
    if (!(await this.d.quoteSigner.verify(quote.payload, quote.signature))) {
      throw new Error('quote signature invalid')
    }
    if (quoteExpired(quote.payload)) throw new Error('quote expired')

    return this.driveFromQuoted(intent)
  }

  /** Operator confirmation of an AWAITING_CONFIRMATION intent. */
  async confirm (intentId: string, confirmedBy: string): Promise<IntentRow> {
    const intent = await this.mustGet(intentId)
    if (intent.state !== 'AWAITING_CONFIRMATION') {
      throw new Error(`intent ${intentId} is ${intent.state}, not AWAITING_CONFIRMATION`)
    }
    await this.advance(intent, 'SIMULATED', `confirmed by ${confirmedBy}`)
    return this.driveFromSimulated(intentId)
  }

  /**
   * Mine an LGE launch (salts, precomputed CREATE2 addresses, startBlock)
   * for the agent's wallet. The token-launch skill's tool calls this before
   * submitting the lge_launch intent, so the intent record carries the full
   * mined params and quote/execute can never drift from them.
   */
  async prepareLaunch (walletAddress: string, req: LaunchRequest): Promise<PreparedLaunch> {
    return mineLaunch(this.d.chain, this.d.chainId, walletAddress as `0x${string}`, req)
  }

  /** Terminal state of a launch hook: finished && !successful = failed sale,
   *  which is the only state an agent may relaunch from. */
  async lgeTerminalState (hook: `0x${string}`): Promise<LgeTerminalState> {
    return readLgeTerminalState(this.d.chain, hook)
  }

  // ------------------------------------------------------------------
  // stages
  // ------------------------------------------------------------------

  private async drive (intentId: string): Promise<IntentRow> {
    const row = await this.mustGet(intentId)
    if (row.state !== 'QUEUED') return row
    const { intent: quoted, quote } = await this.quoteStage(row)
    if (!quote) return quoted // dropped during pricing (fail closed)
    // inline path: consume our own quote immediately
    const consumed = await this.d.store.consumeQuote(quote.quoteId)
    if (!consumed) throw new Error('fresh quote already consumed — store bug')
    return this.driveFromQuoted(await this.mustGet(intentId))
  }

  private async quoteStage (row: IntentRow): Promise<{ intent: IntentRow; quote?: QuotePayload; signature?: string }> {
    const intent = parseIntent(row.type, row.params)
    let valueWei: bigint
    let gasEstimate: bigint
    try {
      ;({ valueWei, gasEstimate } = await this.price(intent, row.walletAddress))
    } catch (e) {
      if (e instanceof UnpriceableIntent || e instanceof PolicyViolation) {
        await this.advance(row, 'DROPPED', (e as Error).message, { error: (e as Error).message })
        return { intent: await this.mustGet(row.id) }
      }
      throw e
    }
    const feeWei = gasEstimate * 20_000_000_000n // 20 gwei floor
    const payload: QuotePayload = {
      quoteId: randomUUID(),
      wallet: row.walletAddress,
      chainId: this.d.chainId,
      type: row.type,
      params: { ...row.params },
      valueWei: valueWei.toString(),
      gasEstimate: gasEstimate.toString(),
      feeWei: feeWei.toString(),
      notAfter: Math.floor(Date.now() / 1000) + QUOTE_TTL_SECONDS
    }
    const signature = await this.d.quoteSigner.sign(payload)
    await this.d.store.createQuote({
      id: payload.quoteId,
      intentId: row.id,
      walletAddress: row.walletAddress,
      payload,
      signature,
      expiresAt: new Date(payload.notAfter * 1000).toISOString()
    })
    await this.advance(row, 'QUOTED', undefined, { quoteId: payload.quoteId })
    return { intent: await this.mustGet(row.id), quote: payload, signature }
  }

  private async driveFromQuoted (row: IntentRow): Promise<IntentRow> {
    const quote = await this.d.store.getQuote(row.quoteId!)
    const valueWei = BigInt((quote!.payload as QuotePayload).valueWei)

    if (VALUE_INTENTS.has(row.type as IntentType) && valueWei > this.policy.confirmationThresholdWei) {
      await this.advance(row, 'AWAITING_CONFIRMATION', 'above confirmation threshold')
      return this.mustGet(row.id)
    }
    await this.advance(row, 'SIMULATED')
    return this.driveFromSimulated(row.id)
  }

  private async driveFromSimulated (intentId: string): Promise<IntentRow> {
    let row = await this.mustGet(intentId)
    const intent = parseIntent(row.type, row.params)

    // Effect intents: no transaction. Policy is trivially passed (no value
    // at risk; the schema was the price of admission); the effect applies
    // at FINAL and its result rides the simulation record back to the model.
    if (EFFECT_INTENTS.has(intent.type)) {
      await this.advance(row, 'POLICY_PASSED', 'effect intent', {
        simulation: { ok: true, at: new Date().toISOString() }
      })
      row = await this.mustGet(row.id)
      try {
        const agent = await this.d.store.getAgent(row.agentId)
        if (!agent) throw new Error(`agent ${row.agentId} not found`)
        const outcome = await applyEffect(intent.type, intent.params as Record<string, unknown>, {
          store: this.d.store,
          chain: this.d.chain,
          agent,
          pushApp: this.d.pushApp ?? (async () => {})
        })
        await this.advance(row, 'FINAL', outcome.note ?? undefined, {
          simulation: { ok: true, at: new Date().toISOString(), effect: outcome.result }
        })
        if (outcome.note) {
          await this.d.store.appendLedger({
            agentId: row.agentId,
            bucket: 'treasury',
            amount: { usdc6: 0n, residualWei: 0n },
            direction: 'debit',
            intentId: row.id,
            note: outcome.note
          })
        }
      } catch (e) {
        await this.advance(row, 'DROPPED', (e as Error).message, { error: (e as Error).message })
      }
      return this.mustGet(intentId)
    }

    // simulate: build + eth_call + estimateGas (fail closed)
    let tx: FinalTx
    try {
      tx = buildTx(intent, this.d.chainId)
      // Arc's native USDC reverts when address(0) is a party, so the
      // simulation must run as the wallet (eth_call defaults to address(0)).
      await this.d.chain.call({ to: tx.to, data: tx.data, value: tx.value, account: row.walletAddress as `0x${string}` })
    } catch (e) {
      return this.handleFailure(row, e as Error)
    }

    // policy
    try {
      this.checkPolicy(intent)
    } catch (e) {
      await this.advance(row, 'DROPPED', (e as Error).message, { error: (e as Error).message })
      return this.mustGet(row.id)
    }
    await this.advance(row, 'POLICY_PASSED', undefined, {
      simulation: { ok: true, at: new Date().toISOString() },
      policy: { maxValueWei: this.policy.maxValueWei.toString() }
    })

    // sign + broadcast (Circle: one call covers both)
    await this.advance(await this.mustGet(row.id), 'SIGNED', 'handed to signer')
    const wallet = await this.d.store.agentWallet(row.agentId)
    const result = await this.d.signer.send(tx, {
      agentId: row.agentId,
      ...(wallet?.provider ? { provider: wallet.provider } : {}),
      ...(wallet?.providerRef ? { providerRef: wallet.providerRef } : {})
    })
    row = await this.mustGet(row.id)
    if (!isSent(result)) {
      await this.advance(row, 'DROPPED', `signer refusal: ${result.reason}`, { error: result.reason })
      return this.mustGet(row.id)
    }
    await this.advance(row, 'BROADCAST', undefined, { txHash: result.txHash })

    // receipt
    row = await this.mustGet(row.id)
    try {
      const receipt = await this.d.chain.waitForTransactionReceipt({ hash: result.txHash })
      if (receipt.status === 'success') {
        await this.advance(row, 'FINAL')
        await this.bookLedger(await this.mustGet(row.id), intent, tx)
        await this.afterFinal(await this.mustGet(row.id), intent)
      } else {
        await this.advance(row, 'REVERTED', 'on-chain revert', { error: 'on-chain revert' })
      }
    } catch (e) {
      return this.handleFailure(row, e as Error)
    }
    return this.mustGet(row.id)
  }

  private async handleFailure (row: IntentRow, e: Error): Promise<IntentRow> {
    const verdict = classifyRevert(e.message)
    if (verdict.action === 'requote' && mayRequote(row.requoteCount)) {
      await this.advance(row, 'QUEUED', `requote: ${verdict.reason}`, {
        error: e.message, requoteCount: row.requoteCount + 1
      })
      return this.drive(row.id)
    }
    const to: State = verdict.action === 'terminal' ? 'REVERTED' : 'DROPPED'
    // REVERTED from SIMULATED is legal; from BROADCAST too. DROPPED likewise.
    await this.advance(row, to, `${verdict.action}: ${verdict.reason}`, { error: e.message })
    return this.mustGet(row.id)
  }

  // ------------------------------------------------------------------
  // valuation + policy
  // ------------------------------------------------------------------

  /** Value at risk in wei, by construction from typed params. */
  private async price (intent: TypedIntent, wallet: string): Promise<{ valueWei: bigint; gasEstimate: bigint }> {
    switch (intent.type) {
      case 'get_balances':
      case 'lge_quote':
      case 'app_publish':
      case 'app_edit':
      case 'create_automation':
        return { valueWei: 0n, gasEstimate: 0n }
      case 'lge_launch': {
        // Gas-only value: the deploy moves no USDC. The mined params are
        // already pinned in the intent (prepareLaunch), so the estimate is
        // against the exact calldata that will broadcast.
        const tx = buildTx(intent, this.d.chainId)
        const gas = await this.d.chain.estimateGas({ to: tx.to, data: tx.data, value: tx.value, account: wallet as `0x${string}` })
        return { valueWei: 0n, gasEstimate: gas }
      }
      case 'transfer': {
        const p = intent.params as IntentParams<'transfer'>
        const tx = buildTx(intent, this.d.chainId)
        const gas = await this.d.chain.estimateGas({ to: tx.to, value: tx.value, account: wallet as `0x${string}` })
        return { valueWei: BigInt(p.amountWei), gasEstimate: gas }
      }
      case 'claim_fees':
      case 'fund_gas':
      case 'draw_inference': {
        const tx = buildTx(intent, this.d.chainId)
        const gas = await this.d.chain.estimateGas({ to: tx.to, data: tx.data, value: tx.value, account: wallet as `0x${string}` })
        const value = intent.type === 'fund_gas' ? BigInt((intent.params as IntentParams<'fund_gas'>).amountWei)
          : intent.type === 'draw_inference' ? BigInt((intent.params as IntentParams<'draw_inference'>).amountWei)
          : 0n
        return { valueWei: value, gasEstimate: gas }
      }
      case 'lge_deposit': {
        // The quoted msg.value comes from the hook's own price curve, read at
        // quote time and pinned into params so execution cannot drift.
        const p = intent.params as IntentParams<'lge_deposit'>
        const valueWei = (p as Record<string, unknown>).valueWei as string | undefined
        if (!valueWei) throw new UnpriceableIntent('lge_deposit requires valueWei from lge_quote')
        const tx = buildTx(intent, this.d.chainId)
        const gas = await this.d.chain.estimateGas({ to: tx.to, data: tx.data, value: tx.value, account: wallet as `0x${string}` })
        return { valueWei: BigInt(valueWei), gasEstimate: gas }
      }
      case 'swap': {
        const p = intent.params as IntentParams<'swap'>
        return { valueWei: BigInt(p.amountInWei), gasEstimate: 250_000n }
      }
      default:
        throw new UnpriceableIntent(`no valuation for ${intent.type}`)
    }
  }

  private checkPolicy (intent: TypedIntent): void {
    if (intent.type === 'transfer') {
      const p = intent.params as IntentParams<'transfer'>
      if (BigInt(p.amountWei) > this.policy.maxValueWei) {
        throw new PolicyViolation(`transfer exceeds per-tx limit`)
      }
      if (
        this.policy.recipientAllowlist.length > 0 &&
        !this.policy.recipientAllowlist.map(a => a.toLowerCase()).includes(p.to.toLowerCase())
      ) {
        throw new PolicyViolation('recipient not in allowlist')
      }
    }
  }

  /** Post-FINAL side effects that are part of the intent's contract. */
  private async afterFinal (row: IntentRow, intent: TypedIntent): Promise<void> {
    if (intent.type === 'lge_launch') {
      // Register the campaign so the deposit indexer, the keeper sweep and
      // the console Token section all see it. Addresses are the precomputed
      // CREATE2 pair pinned in the intent params.
      const p = intent.params as unknown as PreparedLaunch
      await this.d.store.registerCampaign({
        agentId: row.agentId,
        tokenAddress: p.tokenAddress,
        hookAddress: p.hookAddress,
        name: p.name,
        symbol: p.symbol,
        cap: p.capWei,
        startBlock: p.startBlock,
        streamBlocks: p.streamBlocks,
        minTokenPrice: p.minTokenPrice,
        maxTokenPrice: p.maxTokenPrice,
        feeBps: p.feeBps
      })
    }
  }

  private async bookLedger (row: IntentRow, intent: TypedIntent, tx: FinalTx): Promise<void> {
    // draw_inference moves escrow credit, not msg.value — book from params.
    const spendWei = intent.type === 'draw_inference'
      ? BigInt((intent.params as IntentParams<'draw_inference'>).amountWei)
      : tx.value
    if (spendWei === 0n) return
    const bucket = intent.type === 'fund_gas' ? 'gas'
      : intent.type === 'lge_deposit' ? 'trading'
      : intent.type === 'draw_inference' ? 'inference'
      : 'treasury'
    await this.d.store.appendLedger({
      agentId: row.agentId,
      bucket,
      amount: splitUsd(spendWei),
      direction: 'debit',
      intentId: row.id,
      ...(row.txHash ? { fundingTxHash: row.txHash } : {}),
      note: `${intent.type} spend`
    })
  }

  // ------------------------------------------------------------------

  private async mustGet (id: string): Promise<IntentRow> {
    const row = await this.d.store.getIntent(id)
    if (!row) throw new Error(`intent ${id} not found`)
    return row
  }

  private async advance (
    row: IntentRow,
    to: State,
    note?: string,
    patch?: Parameters<Store['transitionIntent']>[3]
  ): Promise<void> {
    const history = transition(row.stateHistory, to, note)
    const change: StateChange = history[history.length - 1]!
    await this.d.store.transitionIntent(row.id, row.state, change, patch)
  }
}

/**
 * Typed intents (DECISIONS.md §4): the ONLY things an agent (or the operator)
 * can ask the executor to do. No raw calldata. Every intent type knows how to
 * build its transaction(s) and how to value them — valuation is by
 * construction (typed params), never by tracing (Arc RPC has no
 * debug_traceCall; day-0 experiment).
 */

import { z } from 'zod'
import { encodeFunctionData, parseAbi, type Address, type Hex } from 'viem'

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
const uint = z.string().regex(/^[0-9]+$/) // decimal string, 18-dec wei unless stated

export const INTENT_SCHEMAS = {
  get_balances: z.object({}).strict(),

  transfer: z.object({
    to: address,
    amountWei: uint,
    note: z.string().max(280).optional()
  }).strict(),

  swap: z.object({
    hook: address,
    token: address,
    side: z.enum(['buy', 'sell']),
    amountInWei: uint,
    sqrtPriceLimitX96: uint
  }).strict(),

  lge_quote: z.object({
    hook: address,
    amountOfTokens: uint
  }).strict(),

  lge_deposit: z.object({
    hook: address,
    amountOfTokens: uint,
    maxUsdcPerToken: uint,
    deadline: z.number().int().positive()
  }).strict(),

  claim_fees: z.object({
    hook: address,
    which: z.enum(['participant', 'agent', 'protocol'])
  }).strict(),

  fund_gas: z.object({
    escrow: address,
    amountWei: uint
  }).strict(),

  create_automation: z.object({
    kind: z.enum(['cron', 'price', 'fee_accrued']),
    spec: z.record(z.string(), z.unknown()),
    intent: z.record(z.string(), z.unknown())
  }).strict()
} as const

export type IntentType = keyof typeof INTENT_SCHEMAS
export type IntentParams<T extends IntentType> = z.infer<(typeof INTENT_SCHEMAS)[T]>

export interface TypedIntent<T extends IntentType = IntentType> {
  type: T
  params: IntentParams<T>
}

export function parseIntent (type: string, params: unknown): TypedIntent {
  const schema = (INTENT_SCHEMAS as Record<string, z.ZodType | undefined>)[type]
  if (!schema) throw new UnknownIntentType(type)
  const parsed = schema.safeParse(params)
  if (!parsed.success) {
    throw new InvalidIntentParams(type, z.prettifyError(parsed.error))
  }
  return { type: type as IntentType, params: parsed.data } as TypedIntent
}

export class UnknownIntentType extends Error {
  constructor (public readonly type: string) {
    super(`unknown intent type: ${type}`)
    this.name = 'UnknownIntentType'
  }
}

export class InvalidIntentParams extends Error {
  constructor (
    public readonly type: string,
    detail: string
  ) {
    super(`invalid params for ${type}: ${detail}`)
    this.name = 'InvalidIntentParams'
  }
}

/** A fully-built, simulated transaction ready for the signer. */
export interface FinalTx {
  to: Address
  data: Hex
  value: bigint
  chainId: number
}

const HOOK_ABI = parseAbi([
  'function deposit(uint256 amountOfTokens, uint256 maxUsdcPerToken, uint256 deadline) payable',
  'function claimParticipant()',
  'function claimAgent()',
  'function claimProtocol()'
])

const ESCROW_ABI = parseAbi(['function fundGas(uint256 amount)'])

/**
 * Builds the transaction for an intent that carries one. Read-only intents
 * (get_balances, lge_quote, create_automation) have no tx and never reach the
 * signer. Throws UnpriceableIntent for anything the builder cannot value from
 * its typed params — fail closed.
 */
export function buildTx (intent: TypedIntent, chainId: number): FinalTx {
  switch (intent.type) {
    case 'transfer': {
      const p = intent.params as IntentParams<'transfer'>
      return { to: p.to as Address, data: '0x', value: BigInt(p.amountWei), chainId }
    }
    case 'lge_deposit': {
      const p = intent.params as IntentParams<'lge_deposit'>
      // msg.value is priced at quote time and injected into params by the
      // runner (valueWei), so the on-chain call and the quote can never drift.
      const valueWei = (p as Record<string, unknown>).valueWei as string | undefined
      if (!valueWei) throw new UnpriceableIntent('lge_deposit missing quoted valueWei')
      return {
        to: p.hook as Address,
        data: encodeFunctionData({
          abi: HOOK_ABI,
          functionName: 'deposit',
          args: [BigInt(p.amountOfTokens), BigInt(p.maxUsdcPerToken), BigInt(p.deadline)]
        }),
        value: BigInt(valueWei),
        chainId
      }
    }
    case 'claim_fees': {
      const p = intent.params as IntentParams<'claim_fees'>
      const fn = p.which === 'participant' ? 'claimParticipant' : p.which === 'agent' ? 'claimAgent' : 'claimProtocol'
      return {
        to: p.hook as Address,
        data: encodeFunctionData({ abi: HOOK_ABI, functionName: fn }),
        value: 0n,
        chainId
      }
    }
    case 'fund_gas': {
      const p = intent.params as IntentParams<'fund_gas'>
      return {
        to: p.escrow as Address,
        data: encodeFunctionData({ abi: ESCROW_ABI, functionName: 'fundGas', args: [BigInt(p.amountWei)] }),
        value: 0n,
        chainId
      }
    }
    case 'swap':
      // Swaps route through a pool executor contract the agent controls; the
      // executor address comes from policy config at run time. Valued by the
      // quote (amountInWei + limit); built by the runner with that context.
      throw new UnpriceableIntent('swap requires runner context (executor contract)')
    default:
      throw new UnpriceableIntent(`intent type ${intent.type} has no transaction`)
  }
}

export class UnpriceableIntent extends Error {
  constructor (detail: string) {
    super(`unpriceable intent: ${detail}`)
    this.name = 'UnpriceableIntent'
  }
}

/** Intents that move value and therefore need a quote + policy check. */
export const VALUE_INTENTS: ReadonlySet<IntentType> = new Set([
  'transfer',
  'swap',
  'lge_deposit',
  'fund_gas'
])

/** Intents whose value at risk exceeds the confirmation threshold go through
 *  AWAITING_CONFIRMATION (DECISIONS.md §3). */
export function requiresConfirmation (valueWei: bigint, thresholdWei: bigint): boolean {
  return valueWei > thresholdWei
}

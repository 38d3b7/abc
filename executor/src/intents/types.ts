/**
 * Typed intents (DECISIONS.md §4): the ONLY things an agent (or the operator)
 * can ask the executor to do. No raw calldata. Every intent type knows how to
 * build its transaction(s) and how to value them — valuation is by
 * construction (typed params), never by tracing (Arc RPC has no
 * debug_traceCall; day-0 experiment).
 */

import { z } from 'zod'
import { encodeFunctionData, parseAbi, type Address, type Hex } from 'viem'
import { buildLaunchTx, type PreparedLaunch } from '../lge/launch.js'
import { INFERENCE_ESCROW } from '../inference/escrow.js'

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
const uint = z.string().regex(/^[0-9]+$/) // decimal string, 18-dec wei unless stated

/** X (Twitter) handle. Accepts "@Handle" or "handle"; stored normalized —
 *  no '@', lowercase. X rules: 1–15 chars, letters/digits/underscore. */
export const xHandleSchema = z
  .string()
  .max(20)
  .transform(s => s.trim().replace(/^@+/, '').toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9_]{1,15}$/))

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

  /**
   * Draw the agent's InferenceEscrow credit down to the protocol-set
   * inference provider (the executor's inference EOA), which deposits it to
   * Circle Gateway and pays per model call over x402. Value at risk is the
   * draw amount, so the quote/policy/confirmation path applies. The escrow
   * address comes from the chain map — never from the model.
   */
  draw_inference: z.object({
    amountWei: uint
  }).strict(),

  create_automation: z.object({
    kind: z.enum(['cron', 'price', 'fee_accrued']),
    spec: z.record(z.string(), z.unknown()),
    intent: z.record(z.string(), z.unknown())
  }).strict(),

  /**
   * Deploy the agent's token + hook through LGEManager. The mined fields
   * (salts, precomputed CREATE2 addresses, startBlock) are injected by
   * runner.prepareLaunch before the intent is submitted — the model never
   * mines. Value is zero (gas only); the consequence is the deployment.
   */
  lge_launch: z.object({
    name: z.string().min(1).max(64),
    symbol: z.string().min(1).max(12),
    capWei: uint,
    streamBlocks: uint,
    minTokenPrice: uint,
    maxTokenPrice: uint,
    feeBps: z.number().int().min(0).max(300),
    agentAddress: address,
    startBlock: uint,
    tokenSalt: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    hookSalt: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    tokenAddress: address,
    hookAddress: address
  }).strict(),

  /** Publish the agent's showcase app (structured blocks, no arbitrary
   *  code — PRODUCT.md phase-1 app lock). Effect intent: no transaction. */
  app_publish: z.object({
    name: z.string().min(1).max(80),
    tagline: z.string().max(160).default(''),
    idea: z.string().max(4000).default(''),
    roadmap: z.array(z.object({ text: z.string().max(200), done: z.boolean() })).max(20).default([]),
    links: z.array(z.object({ label: z.string().max(40), url: z.string().url().max(300) })).max(10).default([]),
    xHandle: xHandleSchema.nullable().default(null)
  }).strict(),

  /** Edit one block of the published app; the ledger note names the field.
   *  Value shape is validated by the effect (field-dependent). */
  app_edit: z.object({
    field: z.enum(['name', 'tagline', 'idea', 'roadmap', 'links', 'xHandle']),
    value: z.unknown()
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

const PAY_PROVIDER_ABI = parseAbi(['function payProvider(uint256 amount)'])

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
    case 'draw_inference': {
      const p = intent.params as IntentParams<'draw_inference'>
      const escrow = INFERENCE_ESCROW[chainId]
      if (!escrow) throw new UnpriceableIntent(`no InferenceEscrow on chain ${chainId}`)
      return {
        to: escrow,
        data: encodeFunctionData({ abi: PAY_PROVIDER_ABI, functionName: 'payProvider', args: [BigInt(p.amountWei)] }),
        value: 0n,
        chainId
      }
    }
    case 'lge_launch': {
      const p = intent.params as unknown as PreparedLaunch
      const tx = buildLaunchTx(p, chainId)
      return { to: tx.to, data: tx.data, value: tx.value, chainId }
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
  'fund_gas',
  'draw_inference'
])

/**
 * Effect intents: no transaction — the pipeline applies an off-chain effect
 * (app write, balance read) and settles POLICY_PASSED -> FINAL. The effect
 * result rides in the intent's simulation record so the loop's tool result
 * can carry it back to the model.
 */
export const EFFECT_INTENTS: ReadonlySet<IntentType> = new Set([
  'get_balances',
  'lge_quote',
  'app_publish',
  'app_edit'
])

/** Intents whose value at risk exceeds the confirmation threshold go through
 *  AWAITING_CONFIRMATION (DECISIONS.md §3). */
export function requiresConfirmation (valueWei: bigint, thresholdWei: bigint): boolean {
  return valueWei > thresholdWei
}

/**
 * Effect intents: pipeline intents with no transaction. The effect applies
 * at the POLICY_PASSED -> FINAL step; its result rides in the intent's
 * simulation record so the agent loop's tool result can carry it back to
 * the model. App writes also book a zero-value ledger row — the audit
 * record is the point ("app published", "app field tagline changed").
 */

import { z } from 'zod'
import { encodeFunctionData, parseAbi, type Address, type Hex } from 'viem'
import type { Store, AgentRow, AppRow, AppBlocks } from '../db/store.js'
import type { ChainReader } from './runner.js'
import { xHandleSchema } from '../intents/types.js'

/** ERC-20 USDC on Arc testnet (6-dec). Address and EIP-712 domain observed
 *  on-chain 2026-09-30 — see REPO-MINING.md. Native USDC (gas) is 18-dec. */
export const ERC20_USDC = '0x3600000000000000000000000000000000000000' as Address

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)'])
const HOOK_VIEW_ABI = parseAbi(['function currentTokenPrice() view returns (uint256)'])

export interface EffectContext {
  store: Store
  chain: ChainReader
  agent: AgentRow
  /** Push the published app to the showcase serving layer; injected so tests
   *  capture instead of fetching. Default: config-driven (no-op unset). */
  pushApp: (app: AppRow) => Promise<void>
}

export interface EffectOutcome {
  /** Ledger note for app writes; null = no ledger row (reads). */
  note: string | null
  /** Stored on the intent's simulation record and returned to the model. */
  result: Record<string, unknown>
}

const roadmapSchema = z.array(z.object({ text: z.string().max(200), done: z.boolean() })).max(20)
const linksSchema = z.array(z.object({ label: z.string().max(40), url: z.string().url().max(300) })).max(10)

/** Validate an app_edit value for its field. Throws on shape mismatch. */
export function validateAppField (field: string, value: unknown): unknown {
  switch (field) {
    case 'name': {
      const v = z.string().min(1).max(80).parse(value)
      return v
    }
    case 'tagline': return z.string().max(160).parse(value)
    case 'idea': return z.string().max(4000).parse(value)
    case 'roadmap': return roadmapSchema.parse(value)
    case 'links': return linksSchema.parse(value)
    case 'xHandle': return xHandleSchema.nullable().parse(value) // null clears
    default: throw new Error(`unknown app field: ${field}`)
  }
}

export async function applyEffect (
  type: string,
  params: Record<string, unknown>,
  ctx: EffectContext
): Promise<EffectOutcome> {
  const { store, chain, agent } = ctx

  switch (type) {
    case 'get_balances': {
      const wallet = agent.walletAddress
      if (!wallet) throw new Error('agent has no provisioned wallet')
      const native = await chain.getBalance({ address: wallet as Address })
      const erc20Res = await chain.call({
        to: ERC20_USDC,
        data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'balanceOf', args: [wallet as Address] })
      })
      const erc20 = erc20Res.data ? BigInt(erc20Res.data) : 0n
      return {
        note: null,
        result: {
          wallet,
          nativeUsdcWei: native.toString(),
          erc20Usdc6: erc20.toString()
        }
      }
    }

    case 'lge_quote': {
      const hook = params.hook as string
      const amountOfTokens = BigInt(params.amountOfTokens as string)
      const res = await chain.call({
        to: hook as Address,
        data: encodeFunctionData({ abi: HOOK_VIEW_ABI, functionName: 'currentTokenPrice' })
      })
      if (!res.data) throw new Error(`hook ${hook} returned no price`)
      const price = BigInt(res.data) // tokens per USDC (raw 18-dec/18-dec ratio)
      if (price === 0n) throw new Error('hook price is zero')
      // USDC wei needed for amountOfTokens at the current rate:
      // tokens / (tokens per USDC) = USDC, in 18-dec legs throughout.
      const valueWei = (amountOfTokens * 10n ** 18n) / price
      return {
        note: null,
        result: {
          hook,
          amountOfTokens: amountOfTokens.toString(),
          currentTokenPrice: price.toString(),
          valueWei: valueWei.toString()
        }
      }
    }

    case 'app_publish': {
      const blocks = params as unknown as AppBlocks
      const app = await store.upsertApp(agent.id, agent.slug, blocks, {
        tokenAddress: agent.tokenAddress,
        hookAddress: agent.hookAddress
      })
      await ctx.pushApp(app)
      return {
        note: 'app published',
        result: { slug: app.slug, url: `https://${app.slug}.agenticbusinessconsole.com`, published: true }
      }
    }

    case 'app_edit': {
      const field = params.field as keyof AppBlocks
      const value = validateAppField(field, params.value)
      const app = await store.updateAppField(agent.id, field, value)
      if (!app) throw new Error('no app to edit — publish first')
      await ctx.pushApp(app)
      return {
        note: `app field ${field} changed`,
        result: { slug: app.slug, field, url: `https://${app.slug}.agenticbusinessconsole.com` }
      }
    }

    default:
      throw new Error(`no effect handler for ${type}`)
  }
}

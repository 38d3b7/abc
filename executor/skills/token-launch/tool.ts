/**
 * token-launch tool override: the model speaks in plain terms (name, supply,
 * window hours, rates); this tool mines the launch through the runner and
 * submits the fully-pinned lge_launch intent. The model never sees salts.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { parseEther } from 'viem'
import type { SkillToolContext } from '../../src/agent/skills.js'
import { signRationale } from '../../src/agent/rationale.js'

const BLOCKS_PER_HOUR = 7200 // ~0.5s blocks on Arc
const ratio = z.string().regex(/^[0-9]+$/)

export function createTools (ctx: SkillToolContext) {
  return {
    lge_launch: tool({
      description:
        'Launch this agent\'s token with an LGE sale. One live token per agent: ' +
        'relaunch is allowed only after every prior sale has terminally failed. ' +
        'Deploys token + hook; the sale opens seconds after the transaction lands. ' +
        'Returns the precomputed token and hook addresses.',
      inputSchema: z.object({
        name: z.string().min(1).max(64).describe('token name'),
        symbol: z.string().min(1).max(12).describe('token symbol'),
        supplyTokens: z.string().regex(/^[0-9]+(\.[0-9]+)?$/).describe('total supply in whole tokens, e.g. "1000000000"'),
        windowHours: z.number().min(1).max(24 * 30).describe('sale window length in hours'),
        startRate: ratio.describe('tokens per USDC at window start (raw ratio, e.g. "20000")'),
        endRate: ratio.describe('tokens per USDC at window end (must exceed startRate for a descending price)'),
        feeBps: z.number().int().min(0).max(300).describe('hook trading fee, basis points'),
        rationale: z.string().min(1).max(280).describe('one-sentence reason for this launch')
      }),
      execute: async (args) => {
        const { store, runner, agent, quoteSigner } = ctx
        const wallet = await store.agentWalletAddress(agent.id)
        if (!wallet) throw new Error('agent has no provisioned wallet')
        if (agent.tokenAddress) {
          // One live token per agent. Relaunch is allowed only when every
          // prior campaign terminally failed (finished && !successful, read
          // from the hook); the failed sale stays on the record. A read
          // failure throws — fail closed, no launch on uncertainty.
          const campaigns = await store.listCampaigns(agent.id)
          for (const c of campaigns) {
            const s = await runner.lgeTerminalState(c.hookAddress as `0x${string}`)
            if (!s.finished) throw new Error(`sale still live: hook ${c.hookAddress}`)
            if (s.successful) throw new Error(`agent already launched: token ${c.tokenAddress}`)
          }
        }

        const prepared = await runner.prepareLaunch(wallet, {
          name: args.name,
          symbol: args.symbol,
          capWei: parseEther(args.supplyTokens).toString(),
          streamBlocks: (BigInt(Math.round(args.windowHours * BLOCKS_PER_HOUR))).toString(),
          minTokenPrice: args.startRate,
          maxTokenPrice: args.endRate,
          feeBps: args.feeBps
        })

        const rationaleSig = await signRationale(quoteSigner, agent.id, wallet, 'lge_launch')
        const row = await runner.runIntent(agent.id, wallet, 'lge_launch', { ...prepared }, {
          text: args.rationale, signature: rationaleSig
        })
        return {
          intentId: row.id,
          state: row.state,
          error: row.error,
          tokenAddress: prepared.tokenAddress,
          hookAddress: prepared.hookAddress,
          startBlock: prepared.startBlock
        }
      }
    })
  }
}

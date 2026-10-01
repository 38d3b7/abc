/**
 * Agent loop (DECISIONS.md §8): an LLM driving the typed intents as tools.
 * The model never touches calldata or keys — it picks an intent + params and
 * writes a rationale; the executor prices, simulates, policy-checks, signs and
 * broadcasts. Every intent records the rationale, Ed25519-signed by the
 * executor (BASIS euthyna + the 30% sophistication criterion).
 *
 * Model access: Vercel AI SDK through the AI Gateway (AI_GATEWAY_API_KEY).
 */

import { generateText, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import type { Store, AgentRow } from '../db/store.js'
import type { PipelineRunner } from '../pipeline/runner.js'
import type { QuoteSigner } from '../quotes/sign.js'
import { INTENT_SCHEMAS } from '../intents/types.js'
import { config } from '../config.js'

export interface AgentLoopDeps {
  store: Store
  runner: PipelineRunner
  agent: AgentRow
  prompt: string
  quoteSigner: QuoteSigner
}

const SYSTEM = `You are the operator of an agentic business console (ABC) on Arc testnet.
You act ONLY through the typed intent tools provided. For every action you
must state a one-sentence rationale (what you are doing and why it serves the
business). Never invent addresses; use the ones in context. If a tool refuses
(policy or valuation), do not retry the same call — report it.`

export async function runAgentLoop (deps: AgentLoopDeps): Promise<{ text: string; intentIds: string[] }> {
  const { store, runner, agent, prompt, quoteSigner } = deps
  const intentIds: string[] = []

  const tools = Object.fromEntries(
    Object.entries(INTENT_SCHEMAS).map(([type, schema]) => [
      type,
      tool({
        description: `Submit a ${type} intent to the executor pipeline`,
        inputSchema: schema.extend({
          rationale: z.string().min(1).max(280).describe('one-sentence reason for this action')
        }),
        execute: async (args) => {
          const { rationale, ...params } = args as { rationale: string } & Record<string, unknown>
          const wallet = await store.agentWalletAddress(agent.id)
          if (!wallet) throw new Error('agent has no provisioned wallet')
          const rationaleSig = await quoteSigner.sign({
            quoteId: crypto.randomUUID(),
            wallet, chainId: 0, type: 'rationale',
            params: { agentId: agent.id, intentType: type },
            valueWei: '0', gasEstimate: '0', feeWei: '0',
            notAfter: 0
          })
          const row = await runner.runIntent(agent.id, wallet, type, params, {
            text: rationale, signature: rationaleSig
          })
          intentIds.push(row.id)
          return { intentId: row.id, state: row.state, error: row.error }
        }
      })
    ])
  )

  const result = await generateText({
    model: config.agentModel,
    system: SYSTEM,
    prompt: `Agent "${agent.name}" (id ${agent.id}).\nToken: ${agent.tokenAddress ?? 'not launched'}\nHook: ${agent.hookAddress ?? 'n/a'}\n\nTask: ${prompt}`,
    tools,
    stopWhen: stepCountIs(8)
  })

  return { text: result.text, intentIds }
}

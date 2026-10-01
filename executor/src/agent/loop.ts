/**
 * Agent loop (DECISIONS.md §8): an LLM driving the typed intents as tools.
 * The model never touches calldata or keys — it picks an intent + params and
 * writes a rationale; the executor prices, simulates, policy-checks, signs and
 * broadcasts. Every intent records the rationale, Ed25519-signed by the
 * executor (BASIS euthyna + the 30% sophistication criterion).
 *
 * Model access: Vercel AI SDK through the AI Gateway (AI_GATEWAY_API_KEY).
 */

import { generateText, tool, stepCountIs, type LanguageModel } from 'ai'
import { z } from 'zod'
import type { Store, AgentRow } from '../db/store.js'
import type { PipelineRunner } from '../pipeline/runner.js'
import type { QuoteSigner } from '../quotes/sign.js'
import { INTENT_SCHEMAS } from '../intents/types.js'
import { config } from '../config.js'
import {
  loadRegistry, resolveAgentSkills, knowledgeContext, capabilityTools,
  SKILLS_DIR, type SkillManifest
} from './skills.js'

export interface AgentLoopDeps {
  store: Store
  runner: PipelineRunner
  agent: AgentRow
  prompt: string
  quoteSigner: QuoteSigner
  /** Test seam: overrides the configured gateway model. */
  model?: LanguageModel
  /** Skills catalog location; tests substitute a fixture dir. */
  skillsDir?: string
  /** Test seam: skip the registry read. */
  registry?: SkillManifest[]
}

const SYSTEM = `You are the operator of an agentic business console (ABC) on Arc testnet.
You act ONLY through the typed intent tools provided. For every action you
must state a one-sentence rationale (what you are doing and why it serves the
business). Never invent addresses; use the ones in context. If a tool refuses
(policy or valuation), do not retry the same call — report it.
Your replies render as ledger records in a finance console: write in neutral
third person ("the agent holds…"), no apologies, no first person, no emoji.
State numbers with units and name the rule that applied.`

export async function runAgentLoop (deps: AgentLoopDeps): Promise<{ text: string; intentIds: string[] }> {
  const { store, runner, agent, prompt, quoteSigner } = deps
  const skillsDir = deps.skillsDir ?? SKILLS_DIR
  const intentIds: string[] = []

  // enabled skills: knowledge into context, capability tools beside the intents
  const installs = await store.listAgentSkills(agent.id)
  const skills = resolveAgentSkills(deps.registry ?? loadRegistry(skillsDir), installs)
  const knowledge = await knowledgeContext(skills, skillsDir)
  const skillTools = await capabilityTools(
    skills,
    { store, runner, agent, quoteSigner, config: {} },
    skillsDir
  )

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
    model: deps.model ?? config.agentModel,
    system: knowledge ? `${SYSTEM}\n\n${knowledge}` : SYSTEM,
    prompt: `Agent "${agent.name}" (id ${agent.id}).\nToken: ${agent.tokenAddress ?? 'not launched'}\nHook: ${agent.hookAddress ?? 'n/a'}\n\nTask: ${prompt}`,
    tools: { ...tools, ...skillTools },
    stopWhen: stepCountIs(8)
  })

  return { text: result.text, intentIds }
}

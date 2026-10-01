/**
 * Agent loop (DECISIONS.md §8): an LLM driving the typed intents as tools.
 * The model never touches calldata or keys — it picks an intent + params and
 * writes a rationale; the executor prices, simulates, policy-checks, signs and
 * broadcasts. Every intent records the rationale, Ed25519-signed by the
 * executor (BASIS euthyna + the 30% sophistication criterion).
 *
 * Model access: Vercel AI SDK through the AI Gateway (AI_GATEWAY_API_KEY).
 *
 * Tool surface: read intents are always available; every other intent type
 * is gated behind an enabled capability skill that lists it in `tools`
 * (CONSOLE.md: capability skills list the intent types they can raise).
 * A skill's tool.ts may override the auto-generated tool by key.
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
import { signRationale } from './rationale.js'

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

/** Read intents are the base surface — every agent can observe. */
const BASE_INTENT_TOOLS = new Set(['get_balances', 'lge_quote'])

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

  // gate: base reads + intent types granted by enabled capability skills
  const granted = new Set(BASE_INTENT_TOOLS)
  for (const s of skills) {
    if (s.kind === 'capability' && s.enabled) {
      for (const t of s.tools) granted.add(t)
    }
  }

  const tools = Object.fromEntries(
    Object.entries(INTENT_SCHEMAS)
      .filter(([type]) => granted.has(type))
      .map(([type, schema]) => [
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
            const rationaleSig = await signRationale(quoteSigner, agent.id, wallet, type)
            const row = await runner.runIntent(agent.id, wallet, type, params, {
              text: rationale, signature: rationaleSig
            })
            intentIds.push(row.id)
            // effect intents ride the simulation record back to the model
            const sim = row.simulation as { effect?: unknown } | null
            return { intentId: row.id, state: row.state, error: row.error, ...(sim?.effect !== undefined ? { effect: sim.effect } : {}) }
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

/**
 * Job handlers, extracted from the worker bootstrap so tests drive them
 * directly (a module no test imports is ungated).
 */

import type { LanguageModel } from 'ai'
import type { Store } from '../db/store.js'
import type { PipelineRunner } from '../pipeline/runner.js'
import type { QuoteSigner } from '../quotes/sign.js'
import { runAgentLoop } from '../agent/loop.js'

export interface AgentPromptJob {
  agentId: string
  prompt: string
  /** The pending agent reply row this turn settles (chat POST opens it). */
  replyMessageId?: string
}

export interface AgentPromptDeps {
  store: Store
  runner: PipelineRunner
  quoteSigner: QuoteSigner
  /** Test seam: overrides the configured gateway model. */
  model?: LanguageModel
}

/**
 * One chat turn: run the loop, then settle the pending reply row. A loop
 * failure fails the row with the error text — explicit and final, the
 * operator resends — rather than retrying silently inside pg-boss. Jobs
 * without a replyMessageId (legacy producers) just run the loop.
 */
export async function handleAgentPrompt (deps: AgentPromptDeps, job: AgentPromptJob): Promise<void> {
  const agent = await deps.store.getAgent(job.agentId)
  if (!agent) throw new Error(`agent ${job.agentId} not found`)
  try {
    const result = await runAgentLoop({
      store: deps.store,
      runner: deps.runner,
      agent,
      prompt: job.prompt,
      quoteSigner: deps.quoteSigner,
      ...(deps.model !== undefined ? { model: deps.model } : {})
    })
    if (job.replyMessageId) {
      await deps.store.completeMessage(job.replyMessageId, { text: result.text, intentIds: result.intentIds })
    }
  } catch (e) {
    if (job.replyMessageId) {
      await deps.store.failMessage(job.replyMessageId, (e as Error).message)
    }
  }
}

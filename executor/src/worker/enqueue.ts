/**
 * Send-side pg-boss for the API process. The worker owns the queues; the API
 * only enqueues. Lazy singleton — tests inject their own enqueuePrompt and
 * never touch this.
 */

import { PgBoss } from 'pg-boss'
import { config } from '../config.js'
import { QUEUES } from './queues.js'
import type { AgentPromptJob } from './handlers.js'

let boss: PgBoss | null = null

async function getBoss (): Promise<PgBoss> {
  if (!boss) {
    boss = new PgBoss(config.databaseUrl)
    await boss.start()
    // idempotent; covers the API sending before the worker's first boot
    await boss.createQueue(QUEUES.agentPrompt)
  }
  return boss
}

export async function enqueueAgentPrompt (job: AgentPromptJob): Promise<void> {
  const b = await getBoss()
  await b.send(QUEUES.agentPrompt, job)
}

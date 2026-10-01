import { tool } from 'ai'
import { z } from 'zod'
import type { SkillToolContext } from '../../../../src/agent/skills.js'

export function createTools (_ctx: SkillToolContext) {
  return {
    report_status: tool({
      description: 'Report the agent status',
      inputSchema: z.object({ note: z.string() }),
      execute: async ({ note }) => ({ status: 'ok', note })
    })
  }
}

import { config } from '../config.js'

export interface AgentModelOption {
  id: string
  label: string
}

function formatModelLabel (id: string): string {
  const tail = id.includes('/') ? id.split('/').pop()! : id
  return tail
    .split(/[-_]/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Allowed gateway model ids for operator turns (default first). */
export function listAgentModels (): { defaultModel: string; models: AgentModelOption[] } {
  const ids = [...new Set([config.agentModel, ...config.agentModels])]
  return {
    defaultModel: config.agentModel,
    models: ids.map(id => ({ id, label: formatModelLabel(id) }))
  }
}

/** Resolve a console picker value to a gateway model id. */
export function resolveTurnModel (requested?: string): string {
  const { defaultModel, models } = listAgentModels()
  const allowed = new Set(models.map(m => m.id))
  if (!requested || requested === 'default') return defaultModel
  if (!allowed.has(requested)) throw new Error('model not allowed')
  return requested
}

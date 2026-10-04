/**
 * Queue names shared by the worker (consume side) and the API (send side).
 * In their own module so the API can enqueue without importing the worker's
 * runtime wiring.
 */

export const QUEUES = {
  agentPrompt: 'agent-prompt',
  automationTick: 'automation-tick',
  automationFire: 'automation-fire',
  keeperClaimProtocol: 'keeper-claim-protocol',
  indexDeposits: 'index-deposits',
  indexLgeBoard: 'index-lge-board'
} as const

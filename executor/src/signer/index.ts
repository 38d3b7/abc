import { config } from '../config.js'
import { CircleScaSigner } from './circle.js'
import { LocalKeySigner } from './local.js'
import { AgentStackSigner } from './agentStack.js'
import type { SignerAdapter } from './types.js'

export function createSigner (): SignerAdapter {
  switch (config.signer) {
    case 'circle':
      return new CircleScaSigner(config.circle.apiKey, config.circle.entitySecret, config.circle.walletSetId)
    case 'agent_stack':
      return new AgentStackSigner()
    case 'local':
      if (config.isProduction) {
        throw new Error('local signer is dev-only and refused in production')
      }
      return new LocalKeySigner(config.localKey)
    default:
      throw new Error(`unknown signer: ${config.signer as string}`)
  }
}

/** Keeper EOA (gas-only) for the permissionless claimProtocol sweeps. Always
 *  a local key — it never holds funds beyond gas. */
export function createKeeperSigner (): LocalKeySigner {
  if (!config.keeperKey) throw new Error('ABC_KEEPER_KEY not set')
  return new LocalKeySigner(config.keeperKey)
}

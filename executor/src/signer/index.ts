import { config } from '../config.js'
import { CircleScaSigner } from './circle.js'
import { LocalKeySigner } from './local.js'
import { AgentStackSigner } from './agentStack.js'
import type { FinalTx } from '../intents/types.js'
import type { SendResult, SignerAdapter } from './types.js'

/** Primary signer provisions all new wallets; send() dispatches on the
 *  wallet's registered provider so legacy local_dev wallets (created before
 *  Circle custody) keep working in production. The local leg exists only
 *  when ABC_LOCAL_KEY is set. */
export class CompositeSigner implements SignerAdapter {
  readonly name: string
  constructor (
    private readonly primary: SignerAdapter,
    private readonly local: SignerAdapter | null
  ) {
    this.name = primary.name
  }

  ensureWallet (agentId: string, providerRef?: string) {
    return this.primary.ensureWallet(agentId, providerRef)
  }

  send (tx: FinalTx, ctx: { agentId: string; provider?: string; providerRef?: string }): Promise<SendResult> {
    if (ctx.provider === 'local_dev') {
      if (!this.local) {
        return Promise.resolve({ kind: 'refusal', reason: 'local_dev wallet but ABC_LOCAL_KEY not set' })
      }
      return this.local.send(tx, ctx)
    }
    return this.primary.send(tx, ctx)
  }
}

export function createSigner (): SignerAdapter {
  switch (config.signer) {
    case 'circle': {
      const circle = new CircleScaSigner(config.circle.apiKey, config.circle.entitySecret, config.circle.walletSetId)
      return config.localKey ? new CompositeSigner(circle, new LocalKeySigner(config.localKey)) : circle
    }
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

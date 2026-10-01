/**
 * Dev-only local-key adapter. True `sign` semantics: builds, signs and
 * broadcasts a plain EOA transaction with the Arc 20 gwei floor. NEVER for
 * hosted/agent wallets — tests and local development only; the factory
 * refuses to construct it in production.
 */

import { createWalletClient, http, publicActions, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet, GAS_FLOOR } from '../config.js'
import type { FinalTx } from '../intents/types.js'
import type { SendResult, SignerAdapter } from './types.js'

export class LocalKeySigner implements SignerAdapter {
  readonly name = 'local_dev'
  private readonly account: ReturnType<typeof privateKeyToAccount>
  private readonly client: ReturnType<typeof createWalletClient> & ReturnType<typeof publicActions>

  constructor (privateKey: string, rpcUrl?: string) {
    if (!privateKey) throw new Error('LocalKeySigner requires a private key')
    this.account = privateKeyToAccount(privateKey as `0x${string}`)
    const transport = http(rpcUrl || arcTestnet.rpcUrls.default.http[0])
    this.client = createWalletClient({
      account: this.account,
      chain: arcTestnet,
      transport
    }).extend(publicActions) as typeof this.client
  }

  ensureWallet (): Promise<{ address: string; providerRef: string }> {
    return Promise.resolve({ address: this.account.address, providerRef: 'local' })
  }

  async send (tx: FinalTx): Promise<SendResult> {
    try {
      const txHash = await this.client.sendTransaction({
        account: this.account,
        chain: arcTestnet,
        to: tx.to as Address,
        data: tx.data,
        value: tx.value,
        maxFeePerGas: GAS_FLOOR.maxFeePerGas,
        maxPriorityFeePerGas: GAS_FLOOR.maxPriorityFeePerGas
      })
      return { kind: 'sent', txHash }
    } catch (e) {
      return { kind: 'refusal', reason: (e as Error).message, code: 'LOCAL_SEND_FAILED' }
    }
  }
}

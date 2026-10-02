/** CompositeSigner dispatch: send() routes on the wallet's registered
 *  provider so legacy local_dev wallets keep working when the primary
 *  signer is Circle. ensureWallet always goes to the primary (new wallets
 *  are Circle-custodied). */
import { describe, it, expect } from 'vitest'
import { CompositeSigner } from '../src/signer/index.js'
import { LocalKeySigner } from '../src/signer/local.js'
import type { SignerAdapter, SendResult } from '../src/signer/types.js'
import type { FinalTx } from '../src/intents/types.js'

const TX = { to: '0x0000000000000000000000000000000000000001', data: '0x', value: 0n } as unknown as FinalTx

function stubSigner (name: string): SignerAdapter & { sends: unknown[]; ensured: string[] } {
  const sends: unknown[] = []
  const ensured: string[] = []
  return {
    name,
    sends,
    ensured,
    ensureWallet: async (agentId: string) => {
      ensured.push(agentId)
      return { address: '0x0000000000000000000000000000000000000002', providerRef: `${name}-ref` }
    },
    send: async (_tx: FinalTx, ctx: unknown): Promise<SendResult> => {
      sends.push(ctx)
      return { kind: 'sent', txHash: '0xabc' }
    }
  }
}

// Hardhat account #0 — a well-known public test key, never used with funds.
const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

describe('CompositeSigner', () => {
  it('provisions new wallets on the primary signer', async () => {
    const primary = stubSigner('circle_sca')
    const composite = new CompositeSigner(primary, new LocalKeySigner(TEST_KEY))
    const w = await composite.ensureWallet('agent-1')
    expect(primary.ensured).toEqual(['agent-1'])
    expect(w.providerRef).toBe('circle_sca-ref')
    expect(composite.name).toBe('circle_sca')
  })

  it('sends local_dev wallets through the local leg', async () => {
    const primary = stubSigner('circle_sca')
    const composite = new CompositeSigner(primary, new LocalKeySigner(TEST_KEY))
    const r = await composite.send(TX, { agentId: 'a', provider: 'local_dev', providerRef: '0' })
    expect(primary.sends).toHaveLength(0)
    expect(r.kind).toBe('sent')
  })

  it('sends circle_sca (and provider-less) wallets through the primary', async () => {
    const primary = stubSigner('circle_sca')
    const composite = new CompositeSigner(primary, new LocalKeySigner(TEST_KEY))
    await composite.send(TX, { agentId: 'a', provider: 'circle_sca', providerRef: 'wid' })
    await composite.send(TX, { agentId: 'b' })
    expect(primary.sends).toHaveLength(2)
  })

  it('refuses local_dev sends when no local key is configured', async () => {
    const primary = stubSigner('circle_sca')
    const composite = new CompositeSigner(primary, null)
    const r = await composite.send(TX, { agentId: 'a', provider: 'local_dev', providerRef: '0' })
    expect(r.kind).toBe('refusal')
    expect(primary.sends).toHaveLength(0)
  })
})

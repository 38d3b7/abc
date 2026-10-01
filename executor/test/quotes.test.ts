import { describe, it, expect } from 'vitest'
import { QuoteSigner, canonicalQuote, quoteExpired, type QuotePayload } from '../src/quotes/sign.js'
import { splitUsd, joinUsd } from '../src/ledger/usd.js'

const payload: QuotePayload = {
  quoteId: 'q1',
  wallet: '0x0000000000000000000000000000000000000001',
  chainId: 5042002,
  type: 'transfer',
  params: { to: '0x0000000000000000000000000000000000000002', amountWei: '1000' },
  valueWei: '1000',
  gasEstimate: '21000',
  feeWei: '420000000000000',
  notAfter: Math.floor(Date.now() / 1000) + 60
}

describe('quote signing', () => {
  it('signs and verifies (Ed25519)', async () => {
    const signer = await QuoteSigner.create()
    const sig = await signer.sign(payload)
    expect(await signer.verify(payload, sig)).toBe(true)
  })

  it('rejects tampered payloads', async () => {
    const signer = await QuoteSigner.create()
    const sig = await signer.sign(payload)
    expect(await signer.verify({ ...payload, valueWei: '999999' }, sig)).toBe(false)
  })

  it('rejects signatures from a different key', async () => {
    const a = await QuoteSigner.create()
    const b = await QuoteSigner.create()
    const sig = await a.sign(payload)
    expect(await b.verify(payload, sig)).toBe(false)
  })

  it('canonical form is key-order independent', () => {
    const shuffled = { ...payload, params: { amountWei: '1000', to: '0x0000000000000000000000000000000000000002' } }
    expect(canonicalQuote(shuffled)).toBe(canonicalQuote(payload))
  })

  it('expiry is enforced', () => {
    expect(quoteExpired(payload)).toBe(false)
    expect(quoteExpired({ ...payload, notAfter: 1 })).toBe(true)
  })
})

describe('dual-unit usd', () => {
  it('splits and joins losslessly', () => {
    for (const v of [0n, 1n, 999_999_999_999n, 1_000_000_000_000n, 1_234_567_890_123_456_789n, -5n]) {
      expect(joinUsd(splitUsd(v))).toBe(v)
    }
  })

  it('usdc6 is the whole-micro part, residual the remainder', () => {
    const { usdc6, residualWei } = splitUsd(1_234_567_890_123_456_789n)
    expect(usdc6).toBe(1_234_567n)
    expect(residualWei).toBe(890_123_456_789n)
  })
})

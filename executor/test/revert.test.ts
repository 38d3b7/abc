import { describe, it, expect } from 'vitest'
import { classifyRevert, mayRequote } from '../src/pipeline/revert.js'

describe('revert classification', () => {
  it('blocked address is terminal', () => {
    expect(classifyRevert('execution reverted: Blocked address').action).toBe('terminal')
    expect(classifyRevert('Circle: address is blocked by compliance').action).toBe('terminal')
  })

  it('zero address is terminal', () => {
    expect(classifyRevert('transfer to zero address').action).toBe('terminal')
  })

  it('slippage re-quotes', () => {
    expect(classifyRevert('PriceLimitAlreadyExceeded(123, 456)').action).toBe('requote')
    expect(classifyRevert('InvalidPrice()').action).toBe('requote')
    expect(classifyRevert('PartialFill()').action).toBe('requote')
  })

  it('LGE state errors are terminal', () => {
    expect(classifyRevert('LpLockedForever()').action).toBe('terminal')
    expect(classifyRevert('LGEFinished()').action).toBe('terminal')
  })

  it('unknown errors drop', () => {
    expect(classifyRevert('some weird rpc error').action).toBe('drop')
  })

  it('requote is once-only', () => {
    expect(mayRequote(0)).toBe(true)
    expect(mayRequote(1)).toBe(false)
  })
})

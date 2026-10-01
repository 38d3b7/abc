import { describe, it, expect } from 'vitest'
import {
  transition, assertTransition, IllegalTransition, type StateChange
} from '../src/pipeline/states.js'

describe('pipeline state machine', () => {
  it('walks the happy path', () => {
    let h: StateChange[] = []
    for (const s of ['QUOTED', 'SIMULATED', 'POLICY_PASSED', 'SIGNED', 'BROADCAST', 'FINAL'] as const) {
      h = transition(h, s)
    }
    expect(h.map(c => `${c.from}->${c.to}`)).toEqual([
      'QUEUED->QUOTED', 'QUOTED->SIMULATED', 'SIMULATED->POLICY_PASSED',
      'POLICY_PASSED->SIGNED', 'SIGNED->BROADCAST', 'BROADCAST->FINAL'
    ])
  })

  it('supports the confirmation detour', () => {
    let h: StateChange[] = []
    h = transition(h, 'QUOTED')
    h = transition(h, 'AWAITING_CONFIRMATION')
    h = transition(h, 'SIMULATED')
    expect(h).toHaveLength(3)
  })

  it('rejects skips and backwards edges', () => {
    expect(() => assertTransition('QUEUED', 'SIGNED')).toThrow(IllegalTransition)
    expect(() => assertTransition('BROADCAST', 'POLICY_PASSED')).toThrow(IllegalTransition)
    expect(() => assertTransition('FINAL', 'QUEUED')).toThrow(IllegalTransition)
    expect(() => assertTransition('DROPPED', 'QUEUED')).toThrow(IllegalTransition)
  })

  it('allows requote edges back to QUEUED', () => {
    expect(() => assertTransition('SIMULATED', 'QUEUED')).not.toThrow()
    expect(() => assertTransition('BROADCAST', 'QUEUED')).not.toThrow()
  })

  it('terminal states have no outgoing edges', () => {
    for (const t of ['FINAL', 'REVERTED', 'DROPPED'] as const) {
      for (const s of ['QUEUED', 'QUOTED', 'SIMULATED', 'FINAL'] as const) {
        expect(() => assertTransition(t, s)).toThrow(IllegalTransition)
      }
    }
  })
})

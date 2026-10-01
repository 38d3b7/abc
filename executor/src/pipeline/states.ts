/**
 * Intent pipeline state machine (DECISIONS.md §3).
 *
 *   QUEUED → QUOTED → (AWAITING_CONFIRMATION) → SIMULATED → POLICY_PASSED
 *     → SIGNED → BROADCAST → FINAL | REVERTED | DROPPED
 *
 * Pure transition table — no I/O. The runner (pipeline/runner.ts) is the only
 * place allowed to call `transition`; tests drive this module directly.
 */

export const STATES = [
  'QUEUED',
  'QUOTED',
  'AWAITING_CONFIRMATION',
  'SIMULATED',
  'POLICY_PASSED',
  'SIGNED',
  'BROADCAST',
  'FINAL',
  'REVERTED',
  'DROPPED'
] as const

export type State = (typeof STATES)[number]

export const TERMINAL: ReadonlySet<State> = new Set(['FINAL', 'REVERTED', 'DROPPED'])

/** Allowed edges. Anything not listed is an illegal transition. The QUEUED
 *  edges from SIMULATED/BROADCAST are the re-quote-once path (slippage class
 *  reverts); the runner enforces the once-only limit via requoteCount. */
const EDGES: Readonly<Record<State, readonly State[]>> = {
  QUEUED: ['QUOTED', 'DROPPED'],
  QUOTED: ['AWAITING_CONFIRMATION', 'SIMULATED', 'DROPPED'],
  AWAITING_CONFIRMATION: ['SIMULATED', 'DROPPED'],
  SIMULATED: ['POLICY_PASSED', 'QUEUED', 'REVERTED', 'DROPPED'],
  POLICY_PASSED: ['SIGNED', 'DROPPED'],
  SIGNED: ['BROADCAST', 'DROPPED'],
  BROADCAST: ['FINAL', 'REVERTED', 'QUEUED', 'DROPPED'],
  FINAL: [],
  REVERTED: [],
  DROPPED: []
}

export class IllegalTransition extends Error {
  constructor (
    public readonly from: State,
    public readonly to: State
  ) {
    super(`illegal transition ${from} -> ${to}`)
    this.name = 'IllegalTransition'
  }
}

export function assertTransition (from: State, to: State): void {
  if (!EDGES[from].includes(to)) throw new IllegalTransition(from, to)
}

export function canTransition (from: State, to: State): boolean {
  return EDGES[from].includes(to)
}

export interface StateChange {
  from: State
  to: State
  at: string // ISO timestamp
  note?: string
}

export function transition (
  history: readonly StateChange[],
  to: State,
  note?: string
): StateChange[] {
  const from = history.length === 0 ? 'QUEUED' : history[history.length - 1]!.to
  assertTransition(from, to)
  const change: StateChange = { from, to, at: new Date().toISOString() }
  if (note !== undefined) change.note = note
  return [...history, change]
}

/** Drop timeout: a BROADCAST intent with no receipt after this is replaced
 *  same-nonce at 1.5x fees, then dropped if still pending. */
export const BROADCAST_TIMEOUT_MS = 10_000
export const REPLACEMENT_FEE_MULTIPLIER_NUM = 3n // x1.5
export const REPLACEMENT_FEE_MULTIPLIER_DEN = 2n

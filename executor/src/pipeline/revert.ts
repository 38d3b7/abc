/**
 * Revert classification (DECISIONS.md §3): given a simulation or receipt
 * failure, decide what the pipeline does with the intent. Pure function.
 *
 *   terminal  -> REVERTED, never retried (blocked/zero address, policy)
 *   requote   -> back to QUEUED for one fresh quote (slippage / price moved)
 *   drop      -> DROPPED (unclassifiable, out of gas after replacement, ...)
 */

export type RevertAction = 'terminal' | 'requote' | 'drop'

export interface RevertVerdict {
  action: RevertAction
  reason: string
}

const TERMINAL_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/blocked address|address is blocked|denylist|blacklist/i, 'blocked address'],
  [/zero address|address\(0\)|null address/i, 'zero address'],
  [/PolicyRefusal|policy (violation|refusal)|denied by policy/i, 'policy refusal'],
  [/ExactOutputSellUnsupported/i, 'exact-output sells unsupported'],
  [/LGENotSuccessful|LGEFinished|LpLockedForever|ExitDisabled/i, 'LGE state forbids']
]

const REQUOTE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/PriceLimitAlreadyExceeded|sqrtPriceLimit|slippage|TooLittleReceived|TooMuchRequested/i, 'price moved'],
  [/PartialFill/i, 'partial fill'],
  [/InvalidPrice/i, 'auction price moved']
]

export function classifyRevert (errorText: string): RevertVerdict {
  for (const [re, reason] of TERMINAL_PATTERNS) {
    if (re.test(errorText)) return { action: 'terminal', reason }
  }
  for (const [re, reason] of REQUOTE_PATTERNS) {
    if (re.test(errorText)) return { action: 'requote', reason }
  }
  return { action: 'drop', reason: 'unclassified revert' }
}

/** Requote is allowed once per intent. */
export function mayRequote (requoteCount: number): boolean {
  return requoteCount < 1
}

import type { ReactNode } from 'react'

export type Tone = 'ok' | 'warn' | 'bad' | 'acc' | 'plain'

export function Chip ({ tone = 'plain', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`chip${tone === 'plain' ? '' : ` ${tone}`}`}>{children}</span>
}

/** Map executor pipeline states to chip tones (CONSOLE.md palette). */
export function stateTone (state: string): Tone {
  switch (state) {
    case 'FINAL': return 'ok'
    case 'AWAITING_CONFIRMATION':
    case 'DROPPED': return 'warn'
    case 'REVERTED':
    case 'REJECTED':
    case 'FAILED': return 'bad'
    default: return 'acc' // in-flight states
  }
}

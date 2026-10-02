import { type Hex, parseAbi } from 'viem'
import { publicClient } from './chain'

const HOOK_STATE_ABI = parseAbi([
  'function isLgeFinished() view returns (bool)',
  'function isLgeSuccessful() view returns (bool)'
])

import type { LgeDirectoryStatus } from './directory-shared'

export async function readHookLgeStatus (hook: string): Promise<LgeDirectoryStatus> {
  const addr = hook as Hex
  const client = publicClient()
  try {
    const [finished, successful] = await Promise.all([
      client.readContract({ address: addr, abi: HOOK_STATE_ABI, functionName: 'isLgeFinished' }),
      client.readContract({ address: addr, abi: HOOK_STATE_ABI, functionName: 'isLgeSuccessful' })
    ])
    if (!finished) return 'live'
    return successful ? 'successful' : 'failed'
  } catch {
    return 'unknown'
  }
}

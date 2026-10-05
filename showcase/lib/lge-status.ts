import { type Hex, parseAbi } from 'viem'
import { publicClient } from './chain'

const HOOK_STATE_ABI = parseAbi([
  'function isLgeFinished() view returns (bool)',
  'function isLgeSuccessful() view returns (bool)',
  'function startBlock() view returns (uint256)',
  'function streamBlocks() view returns (uint256)'
])

import type { LgeDirectoryStatus } from './directory-shared'

export async function readHookLgeStatus (hook: string): Promise<LgeDirectoryStatus> {
  const addr = hook as Hex
  const client = publicClient()
  try {
    const [finished, successful, startBlock, streamBlocks] = await Promise.all([
      client.readContract({ address: addr, abi: HOOK_STATE_ABI, functionName: 'isLgeFinished' }),
      client.readContract({ address: addr, abi: HOOK_STATE_ABI, functionName: 'isLgeSuccessful' }),
      client.readContract({ address: addr, abi: HOOK_STATE_ABI, functionName: 'startBlock' }),
      client.readContract({ address: addr, abi: HOOK_STATE_ABI, functionName: 'streamBlocks' })
    ])
    const latest = await client.getBlockNumber()
    const endedOnChain = startBlock + streamBlocks <= latest
    // The hook's finished flag is only set on a concluding transaction;
    // expired-but-unsettled windows are no longer live.
    if (!finished && !endedOnChain) return 'live'
    return successful ? 'successful' : 'failed'
  } catch {
    return 'unknown'
  }
}

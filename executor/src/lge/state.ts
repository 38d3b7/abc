/**
 * Terminal sale state of an LGE hook, read through the runner's ChainReader
 * so tests fake it. The ABI shape (the two bool views) is what the console's
 * readCampaign observed against the live WLK3 hook on Arc testnet.
 */

import { decodeFunctionResult, encodeFunctionData, parseAbi, type Hex } from 'viem'
import type { ChainReader } from '../pipeline/runner.js'

const STATE_ABI = parseAbi([
  'function isLgeFinished() view returns (bool)',
  'function isLgeSuccessful() view returns (bool)'
])

export interface LgeTerminalState {
  finished: boolean
  successful: boolean
}

export async function readLgeTerminalState (chain: ChainReader, hook: Hex): Promise<LgeTerminalState> {
  const read = async (fn: 'isLgeFinished' | 'isLgeSuccessful'): Promise<boolean> => {
    const data = encodeFunctionData({ abi: STATE_ABI, functionName: fn })
    const res = await chain.call({ to: hook, data })
    if (!res.data) throw new Error(`empty read: ${fn} on ${hook}`)
    return decodeFunctionResult({ abi: STATE_ABI, functionName: fn, data: res.data })
  }
  return { finished: await read('isLgeFinished'), successful: await read('isLgeSuccessful') }
}

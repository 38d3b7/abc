/**
 * Enrichment for agents with live LGEs: a single multicall per hook gives us
 * the progress metrics needed by the square tile and the storefront raise
 * section.
 */
import { type Hex, parseAbi } from 'viem'
import { publicClient } from './chain'
import type { ShowcaseApp } from './db'

const LGE_ABI = parseAbi([
  'function token() view returns (address)',
  'function cap() view returns (uint256)',
  'function totalUsdcRaised() view returns (uint256)',
  'function totalTokensClaimed() view returns (uint256)',
  'function startBlock() view returns (uint256)',
  'function streamBlocks() view returns (uint256)',
  'function minTokenPrice() view returns (uint256)',
  'function maxTokenPrice() view returns (uint256)',
  'function currentTokenPrice() view returns (uint256)'
])

const TOKEN_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)'
])

export interface LiveLgeMetrics {
  hook: string
  tokenAddress: string
  tokenName: string
  tokenSymbol: string
  capUsdc: number
  raisedUsdc: number
  claimedTokens: number
  startBlock: bigint
  streamBlocks: bigint
  blocksLeft: number
  secondsLeft: number
  minTokensPerUsdc: number
  maxTokensPerUsdc: number
  currentTokensPerUsdc: number
}

/** Read live LGE metrics straight from a hook address. */
export async function readLiveLgeMetricsByHook (hook: string): Promise<LiveLgeMetrics | null> {
  const addr = hook as Hex
  const client = publicClient()
  try {
    const token = await client.readContract({ address: addr, abi: LGE_ABI, functionName: 'token' })
    const results = await client.multicall({
      contracts: [
        { address: token, abi: TOKEN_ABI, functionName: 'name' },
        { address: token, abi: TOKEN_ABI, functionName: 'symbol' },
        { address: token, abi: parseAbi(['function cap() view returns (uint256)']), functionName: 'cap' },
        { address: addr, abi: LGE_ABI, functionName: 'totalUsdcRaised' },
        { address: addr, abi: LGE_ABI, functionName: 'totalTokensClaimed' },
        { address: addr, abi: LGE_ABI, functionName: 'startBlock' },
        { address: addr, abi: LGE_ABI, functionName: 'streamBlocks' },
        { address: addr, abi: LGE_ABI, functionName: 'minTokenPrice' },
        { address: addr, abi: LGE_ABI, functionName: 'maxTokenPrice' },
        { address: addr, abi: LGE_ABI, functionName: 'currentTokenPrice' }
      ],
      allowFailure: false
    })
    const [name, symbol, cap, raised, claimed, startBlock, streamBlocks, minPrice, maxPrice, currentPrice] = results as [
      string, string, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint
    ]
    const latest = await client.getBlockNumber()
    const endBlock = startBlock + streamBlocks
    const blocksLeft = endBlock > latest ? Number(endBlock - latest) : 0
    // Arc ~0.5s blocks; measured in the board indexer at ~0.3s with the
    // canteenapp node. A 0.5s estimate is conservative and keeps the
    // countdown honest for users.
    const secondsLeft = blocksLeft * 0.5
    return {
      hook,
      tokenAddress: token,
      tokenName: name,
      tokenSymbol: symbol,
      capUsdc: Number(cap) / 1e18,
      raisedUsdc: Number(raised) / 1e18,
      claimedTokens: Number(claimed) / 1e18,
      startBlock,
      streamBlocks,
      blocksLeft,
      secondsLeft,
      minTokensPerUsdc: Number(minPrice),
      maxTokensPerUsdc: Number(maxPrice),
      currentTokensPerUsdc: Number(currentPrice)
    }
  } catch {
    return null
  }
}

export async function readLiveLgeMetrics (app: ShowcaseApp): Promise<LiveLgeMetrics | null> {
  if (!app.hookAddress) return null
  return readLiveLgeMetricsByHook(app.hookAddress)
}

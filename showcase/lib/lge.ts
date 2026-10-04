import { type Address, type Hex, parseAbi } from 'viem'
import { publicClient } from './chain'
import { listPublished } from './db'
import { fetchLogsSplit } from './log-range'

/**
 * Open raises — read straight from chain state (no indexer): the raise is
 * the hook's own storage. Discovery is the manager's TokenCreated log set;
 * per-hook state is one multicall. Live trading data is NOT here — that is
 * history-derived and comes from the executor's indexer (lib/board.ts).
 */

// Arc testnet deployment (mirrors console/src/config/contracts/addresses.ts,
// which is generated — this copy is the showcase's own source of truth).
const LGE_MANAGER = '0x42213058b545625f8be3e80ba086c14e8fd22920' as Address
const MANAGER_DEPLOY_BLOCK = 64961838n

const TOKEN_CREATED_EVENT = parseAbi([
  'event TokenCreated(address indexed msgSender, address indexed tokenAddress, address indexed hookAddress)'
])[0]

const HOOK_VIEWS = parseAbi([
  'function token() view returns (address)',
  'function startBlock() view returns (uint256)',
  'function streamBlocks() view returns (uint256)',
  'function currentTokenPrice() view returns (uint256)',
  'function totalUsdcRaised() view returns (uint256)',
  'function isLgeFinished() view returns (bool)',
  'function isLgeSuccessful() view returns (bool)'
])

const TOKEN_VIEWS = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function cap() view returns (uint256)'
])

export interface OpenRaise {
  hook: string
  token: string
  name: string
  symbol: string
  /** Whole USDC (18-dec source) toward the cap. */
  raisedUsdc: number
  capUsdc: number
  /** 0..1 */
  progress: number
  /** Current rate: tokens per 1 USDC (the hook's own unit). */
  tokensPerUsdc: number
  blocksLeft: number
  secondsLeft: number
  /** Owning agent's site, when a published app claims this hook. */
  agentSlug: string | null
  agentName: string | null
}

/** Measured seconds-per-block, cached 10 min (Arc blocks are sub-second;
 *  a hardcoded rate would misstate every countdown). */
let blockTimeCache: { secsPerBlock: number; at: number } | null = null

async function secondsPerBlock (): Promise<number> {
  if (blockTimeCache && Date.now() - blockTimeCache.at < 10 * 60 * 1000) return blockTimeCache.secsPerBlock
  const client = publicClient()
  const latest = await client.getBlock()
  const span = 20_000n
  const earlier = await client.getBlock({ blockNumber: latest.number - span })
  const secs = Number(latest.timestamp - earlier.timestamp) / Number(span)
  blockTimeCache = { secsPerBlock: secs, at: Date.now() }
  return secs
}

export async function listOpenRaises (): Promise<OpenRaise[]> {
  const client = publicClient()
  const latestBlock = await client.getBlockNumber()
  // The public RPC refuses wide spans ("requested range too large") — halve
  // until it answers. Always pass toBlock: it silently truncates otherwise
  // (observed 2026-10-01).
  const logs = await fetchLogsSplit(
    (f, t) => client.getLogs({
      address: LGE_MANAGER,
      event: TOKEN_CREATED_EVENT,
      fromBlock: f,
      toBlock: t
    }),
    MANAGER_DEPLOY_BLOCK,
    latestBlock
  )

  const apps = await listPublished()
  const appByHook = new Map(apps.filter(a => a.hookAddress).map(a => [a.hookAddress!.toLowerCase(), a]))

  const secsPerBlock = await secondsPerBlock().catch(() => 0.3)

  const raises = await Promise.all(logs.map(async (log): Promise<OpenRaise | null> => {
    const hook = log.args.hookAddress as Hex
    try {
      const token = await client.readContract({ address: hook, abi: HOOK_VIEWS, functionName: 'token' })
      const results = await client.multicall({
        contracts: [
          { address: token, abi: TOKEN_VIEWS, functionName: 'name' },
          { address: token, abi: TOKEN_VIEWS, functionName: 'symbol' },
          { address: token, abi: TOKEN_VIEWS, functionName: 'cap' },
          { address: hook, abi: HOOK_VIEWS, functionName: 'startBlock' },
          { address: hook, abi: HOOK_VIEWS, functionName: 'streamBlocks' },
          { address: hook, abi: HOOK_VIEWS, functionName: 'currentTokenPrice' },
          { address: hook, abi: HOOK_VIEWS, functionName: 'totalUsdcRaised' },
          { address: hook, abi: HOOK_VIEWS, functionName: 'isLgeFinished' },
          { address: hook, abi: HOOK_VIEWS, functionName: 'isLgeSuccessful' }
        ],
        allowFailure: false
      })
      const [name, symbol, cap, startBlock, streamBlocks, currentPrice, raised, finished] = results as [
        string, string, bigint, bigint, bigint, bigint, bigint, boolean, boolean
      ]
      const endBlock = startBlock + streamBlocks
      const blocksLeft = endBlock > latestBlock ? Number(endBlock - latestBlock) : 0
      // Open = not finalized AND inside the window. isLgeFinished lags:
      // expired-but-unsettled campaigns still read false (observed
      // 2026-10-04: WLK2/TEST windows ended, isLgeFinished false).
      if (finished || blocksLeft === 0) return null
      const raisedUsdc = Number(raised) / 1e18
      const capUsdc = Number(cap) / 1e18
      const app = appByHook.get(hook.toLowerCase())
      return {
        hook,
        token,
        name,
        symbol,
        raisedUsdc,
        capUsdc,
        progress: capUsdc > 0 ? Math.min(raisedUsdc / capUsdc, 1) : 0,
        // currentTokenPrice is a plain integer rate (tokens per 1 USDC):
        // the hook's own usdcPerToken = ceil(1e18 / price) usdc-wei.
        tokensPerUsdc: Number(currentPrice),
        blocksLeft,
        secondsLeft: blocksLeft * secsPerBlock,
        agentSlug: app?.slug ?? null,
        agentName: app?.name ?? null
      }
    } catch {
      return null // a hook that doesn't answer is not a raise we can show
    }
  }))

  return raises
    .filter((r): r is OpenRaise => r != null)
    .sort((a, b) => b.progress - a.progress || a.secondsLeft - b.secondsLeft)
}

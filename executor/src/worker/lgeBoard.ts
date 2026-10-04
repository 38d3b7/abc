/**
 * LGE board indexer (system emitter). Three streams per tick:
 *
 *   1. discover  — manager TokenCreated logs register hook + token rows
 *   2. refresh   — per-hook state (finished/successful), statics once
 *                  (name/symbol/decimals/supply), pool resolution
 *                  (getPoolId/poolKey) and launch price (LGESuccessful log)
 *                  once the LGE clears
 *   3. swaps     — PoolManager.Swap per live pool, per-pool checkpoint from
 *                  the campaign's creation block, idempotent on
 *                  (tx_hash, log_index)
 *
 * Ported from the OpenLaunch indexer and narrowed to our pools: every pool
 * pairs an LGE token with USDC, so USD figures come straight off the Swap
 * event. Arc finalizes every block — no confirmation lag, no reorg
 * handling. Range refusals (Arc caps eth_getLogs at 2000 results) are
 * halved by fetchLogsSplit.
 */

import { parseAbi, zeroAddress, type Address, type Hex, type Log, type PublicClient } from 'viem'
import {
  LGE_MANAGER_ARC_TESTNET,
  MANAGER_DEPLOY_BLOCK_ARC_TESTNET,
  POOL_MANAGER_ARC_TESTNET
} from '../lge/addresses.js'
import { deriveSwap, fetchLogsSplit, tokenPriceUsdc } from '../lge/board.js'
import type { PgStore } from '../db/pg.js'

const MANAGER = LGE_MANAGER_ARC_TESTNET as Address
const POOL_MANAGER = POOL_MANAGER_ARC_TESTNET as Address
const DEPLOY_BLOCK = BigInt(MANAGER_DEPLOY_BLOCK_ARC_TESTNET)

const TOKEN_CREATED_EVENT = parseAbi([
  'event TokenCreated(address indexed msgSender, address indexed tokenAddress, address indexed hookAddress)'
])[0]

const SWAP_EVENT = parseAbi([
  'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)'
])[0]

const LGE_SUCCESSFUL_EVENT = parseAbi([
  'event LGESuccessful((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, uint256 usdcContractBalance, uint256 initialSqrtPriceX96, uint256 totalUsdcToLiquidity, uint128 liquidity)'
])[0]

const HOOK_VIEWS = parseAbi([
  'function isLgeFinished() view returns (bool)',
  'function isLgeSuccessful() view returns (bool)',
  'function getPoolId() view returns (bytes32)',
  'function poolKey() view returns (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)'
])

const ERC20_VIEWS = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)'
])

type TokenRow = Awaited<ReturnType<PgStore['listLgeTokenRows']>>[number]

interface LivePool {
  hookAddress: string
  poolId: string
  createdBlock: bigint
  tokenIsCurrency0: boolean
  tokenDecimals: number
  usdcDecimals: number
}

export async function indexLgeBoard (store: PgStore, chain: PublicClient): Promise<void> {
  const latest = await chain.getBlockNumber()

  // ---- 1. discover campaigns ----
  let discoverFrom = await store.indexerCheckpoint('lge:discover')
  if (discoverFrom === 0n) discoverFrom = DEPLOY_BLOCK
  if (discoverFrom <= latest) {
    const logs = await fetchLogsSplit(
      (f, t) => chain.getLogs({ address: MANAGER, event: TOKEN_CREATED_EVENT, fromBlock: f, toBlock: t }),
      discoverFrom,
      latest
    )
    for (const log of logs) {
      const args = (log as Log & { args: { tokenAddress?: Address; hookAddress?: Address } }).args
      if (args.tokenAddress && args.hookAddress) {
        await store.upsertLgeToken(args.hookAddress, args.tokenAddress, log.blockNumber ?? latest)
      }
    }
    await store.setIndexerCheckpoint('lge:discover', latest + 1n)
  }

  // ---- 2. refresh tokens; collect the live pools ----
  const tokens = await store.listLgeTokenRows()
  const live: LivePool[] = []
  for (const t of tokens) {
    const pool = await refreshToken(store, chain, t)
    if (pool) live.push(pool)
  }

  // ---- 3. index swaps per live pool ----
  for (const pool of live) {
    await indexPoolSwaps(store, chain, pool, latest)
  }
}

async function refreshToken (store: PgStore, chain: PublicClient, t: TokenRow): Promise<LivePool | null> {
  const hook = t.hookAddress as Address
  const patch: Parameters<PgStore['updateLgeToken']>[1] = {}

  let finished = t.lgeFinished
  let successful = t.lgeSuccessful
  try {
    ;[finished, successful] = await Promise.all([
      chain.readContract({ address: hook, abi: HOOK_VIEWS, functionName: 'isLgeFinished' }),
      chain.readContract({ address: hook, abi: HOOK_VIEWS, functionName: 'isLgeSuccessful' })
    ])
  } catch (err) {
    console.warn(`[lge-board] state read failed for ${hook}:`, (err as Error).message)
    return null
  }
  patch.lgeFinished = finished
  patch.lgeSuccessful = successful

  // Statics are immutable — read once.
  let tokenDecimals = t.decimals
  if (tokenDecimals == null || t.totalSupply == null) {
    try {
      const token = t.tokenAddress as Address
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        chain.readContract({ address: token, abi: ERC20_VIEWS, functionName: 'name' }),
        chain.readContract({ address: token, abi: ERC20_VIEWS, functionName: 'symbol' }),
        chain.readContract({ address: token, abi: ERC20_VIEWS, functionName: 'decimals' }),
        chain.readContract({ address: token, abi: ERC20_VIEWS, functionName: 'totalSupply' })
      ])
      patch.name = name
      patch.symbol = symbol
      patch.decimals = Number(decimals)
      patch.totalSupply = totalSupply
      tokenDecimals = patch.decimals
    } catch (err) {
      console.warn(`[lge-board] statics read failed for ${t.tokenAddress}:`, (err as Error).message)
    }
  }

  // Pool resolution: only a successful LGE has a seeded v4 pool.
  let poolId = t.poolId
  let tokenIsCurrency0 = t.tokenIsCurrency0
  let usdcDecimals = t.usdcDecimals
  if (successful && !poolId) {
    try {
      const [pid, key] = await Promise.all([
        chain.readContract({ address: hook, abi: HOOK_VIEWS, functionName: 'getPoolId' }),
        chain.readContract({ address: hook, abi: HOOK_VIEWS, functionName: 'poolKey' })
      ])
      poolId = pid
      patch.poolId = pid
      const [currency0, currency1] = key
      tokenIsCurrency0 = currency0.toLowerCase() === t.tokenAddress.toLowerCase()
      patch.tokenIsCurrency0 = tokenIsCurrency0
      const usdc = (tokenIsCurrency0 ? currency1 : currency0) as Address
      usdcDecimals = usdc.toLowerCase() === zeroAddress
        ? 18 // native USDC
        : Number(await chain.readContract({ address: usdc, abi: ERC20_VIEWS, functionName: 'decimals' }))
      patch.usdcDecimals = usdcDecimals
    } catch (err) {
      console.warn(`[lge-board] pool resolution failed for ${hook}:`, (err as Error).message)
    }
  }

  // Launch price: the LGESuccessful log carries the pool's initial sqrtPrice.
  if (successful && t.launchPriceUsdc == null && tokenIsCurrency0 != null && tokenDecimals != null && usdcDecimals != null) {
    try {
      const scanFrom = t.createdBlock > 0n ? t.createdBlock : DEPLOY_BLOCK
      const logs = await fetchLogsSplit(
        (f, t2) => chain.getLogs({ address: hook, event: LGE_SUCCESSFUL_EVENT, fromBlock: f, toBlock: t2 }),
        scanFrom,
        await chain.getBlockNumber()
      )
      const ev = logs[0] as (Log & { args: { initialSqrtPriceX96?: bigint } }) | undefined
      if (ev?.args.initialSqrtPriceX96 != null) {
        patch.launchPriceUsdc = tokenPriceUsdc(ev.args.initialSqrtPriceX96, tokenIsCurrency0, tokenDecimals, usdcDecimals)
      }
    } catch (err) {
      console.warn(`[lge-board] launch price scan failed for ${hook}:`, (err as Error).message)
    }
  }

  await store.updateLgeToken(hook, patch)

  if (!successful || !poolId || tokenIsCurrency0 == null || tokenDecimals == null || usdcDecimals == null) {
    return null
  }
  return {
    hookAddress: t.hookAddress,
    poolId,
    createdBlock: t.createdBlock,
    tokenIsCurrency0,
    tokenDecimals,
    usdcDecimals
  }
}

type SwapLog = Log & { args: { amount0: bigint; amount1: bigint; sqrtPriceX96: bigint } }

async function indexPoolSwaps (store: PgStore, chain: PublicClient, pool: LivePool, latest: bigint): Promise<void> {
  const checkpoint = `lge:swaps:${pool.poolId}`
  let from = await store.indexerCheckpoint(checkpoint)
  if (from === 0n) from = pool.createdBlock > 0n ? pool.createdBlock : DEPLOY_BLOCK
  if (from > latest) return

  const logs = (await fetchLogsSplit(
    (f, t) => chain.getLogs({
      address: POOL_MANAGER,
      event: SWAP_EVENT,
      args: { id: pool.poolId as Hex },
      fromBlock: f,
      toBlock: t
    }),
    from,
    latest
  )) as SwapLog[]

  // Pending logs (null block/tx fields) can't be recorded — toBlock: latest
  // means mined only, but guard rather than trust the node.
  const mined = logs.filter(l => l.blockNumber != null && l.transactionHash != null && l.logIndex != null)

  if (mined.length > 0) {
    // Enrichment, batched per unique block / tx: block timestamps for the
    // tape's clock, tx senders for the trader (the Swap event's sender is
    // the router, not the trader).
    const blockTs = new Map<string, Date>()
    const senders = new Map<string, Address>()
    for (const log of mined) {
      const bn = log.blockNumber!.toString()
      if (!blockTs.has(bn)) {
        const block = await chain.getBlock({ blockNumber: log.blockNumber! })
        blockTs.set(bn, new Date(Number(block.timestamp) * 1000))
      }
      const th = log.transactionHash!
      if (!senders.has(th)) {
        try {
          const tx = await chain.getTransaction({ hash: th })
          senders.set(th, tx.from)
        } catch {
          senders.set(th, zeroAddress) // pruned/unavailable — tape shows 0x0
        }
      }
    }

    for (const log of mined) {
      const d = deriveSwap(log.args, pool.tokenIsCurrency0, pool.tokenDecimals, pool.usdcDecimals)
      await store.recordLgeSwap({
        txHash: log.transactionHash!,
        logIndex: log.logIndex!,
        hookAddress: pool.hookAddress,
        blockNumber: log.blockNumber!,
        blockTs: blockTs.get(log.blockNumber!.toString()) ?? null,
        trader: senders.get(log.transactionHash!) ?? null,
        isBuy: d.isBuy,
        tokenAmount: d.tokenAmount,
        usdcAmount: d.usdcAmount,
        priceUsdc: d.priceUsdc
      })
    }

    const last = deriveSwap(mined[mined.length - 1]!.args, pool.tokenIsCurrency0, pool.tokenDecimals, pool.usdcDecimals)
    if (last.priceUsdc > 0) {
      await store.updateLgeToken(pool.hookAddress, { lastPriceUsdc: last.priceUsdc })
    }
  }

  await store.setIndexerCheckpoint(checkpoint, latest + 1n)
}

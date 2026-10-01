import {
  concat, encodeAbiParameters, getCreate2Address, keccak256,
  type Address, type PublicClient
} from 'viem'
import { LGEHookAbi } from '../config/contracts/abis/LGEHookAbi'
import { LGETokenAbi } from '../config/contracts/abis/LGETokenAbi'
import { LGEManagerAbi } from '../config/contracts/abis/LGEManagerAbi'
import { LGE_HOOK_BYTECODE_ARC_TESTNET } from '../config/contracts/bytecode/LGEHookBytecode'
import { LGE_TOKEN_BYTECODE_ARC_TESTNET } from '../config/contracts/bytecode/LGETokenBytecode'
import {
  LGE_MANAGER_ARC_TESTNET,
  POOL_MANAGER_ARC_TESTNET,
  POSITION_MANAGER_ARC_TESTNET,
  PERMIT2_ARC_TESTNET,
  PROTOCOL_ARC_TESTNET,
  VESTING_VAULT_ARC_TESTNET,
  INFERENCE_ESCROW_ARC_TESTNET,
  MANAGER_DEPLOY_BLOCK_ARC_TESTNET
} from '../config/contracts/addresses'

export const MANAGER = LGE_MANAGER_ARC_TESTNET as Address
export const DEPLOY_BLOCK = BigInt(MANAGER_DEPLOY_BLOCK_ARC_TESTNET)

// ------------------------------------------------------------------
// Campaign discovery: TokenCreated logs from the manager
// ------------------------------------------------------------------

export interface CampaignRef {
  creator: Address
  token: Address
  hook: Address
}

export async function listCampaigns (client: PublicClient): Promise<CampaignRef[]> {
  const logs = await client.getLogs({
    address: MANAGER,
    event: {
      type: 'event',
      name: 'TokenCreated',
      inputs: [
        { name: 'msgSender', type: 'address', indexed: true },
        { name: 'tokenAddress', type: 'address', indexed: true },
        { name: 'hookAddress', type: 'address', indexed: true }
      ]
    },
    fromBlock: DEPLOY_BLOCK
  })
  return logs.map(l => ({
    creator: l.args.msgSender as Address,
    token: l.args.tokenAddress as Address,
    hook: l.args.hookAddress as Address
  }))
}

// ------------------------------------------------------------------
// Campaign state: one multicall per hook
// ------------------------------------------------------------------

export interface CampaignState {
  hook: Address
  token: Address
  tokenName: string
  tokenSymbol: string
  cap: bigint
  agent: Address
  startBlock: bigint
  streamBlocks: bigint
  minTokenPrice: bigint
  maxTokenPrice: bigint
  currentPrice: bigint
  totalTokensClaimed: bigint
  totalUsdcRaised: bigint
  totalUsdcToLiquidity: bigint
  isLgeFinished: boolean
  isLgeSuccessful: boolean
  participantFeesBooked: bigint
  agentAccrued: bigint
  protocolAccrued: bigint
  lpLocked: boolean
  feeVolume30d: bigint
  exitThreshold: bigint
  feeBps: number
  positionTokenId: bigint
  pendingBuy: bigint
  treasuryUsdc: bigint
}

export async function readCampaign (client: PublicClient, hook: Address): Promise<CampaignState> {
  const h = { address: hook, abi: LGEHookAbi } as const
  const tokenAddr = await client.readContract({ ...h, functionName: 'token' }) as Address
  const t = { address: tokenAddr, abi: LGETokenAbi } as const
  const results = await client.multicall({
    contracts: [
      { ...t, functionName: 'name' },
      { ...t, functionName: 'symbol' },
      { ...t, functionName: 'cap' },
      { ...h, functionName: 'agent' },
      { ...h, functionName: 'startBlock' },
      { ...h, functionName: 'streamBlocks' },
      { ...h, functionName: 'minTokenPrice' },
      { ...h, functionName: 'maxTokenPrice' },
      { ...h, functionName: 'currentTokenPrice' },
      { ...h, functionName: 'totalTokensClaimed' },
      { ...h, functionName: 'totalUsdcRaised' },
      { ...h, functionName: 'totalEthToLiquidity' },
      { ...h, functionName: 'isLgeFinished' },
      { ...h, functionName: 'isLgeSuccessful' },
      { ...h, functionName: 'participantFeesBooked' },
      { ...h, functionName: 'agentAccrued' },
      { ...h, functionName: 'protocolAccrued' },
      { ...h, functionName: 'lpLocked' },
      { ...h, functionName: 'feeVolume30d' },
      { ...h, functionName: 'exitThreshold' },
      { ...h, functionName: 'feeBps' },
      { ...h, functionName: 'positionTokenId' },
      { ...h, functionName: 'pendingBuy' },
      { ...h, functionName: 'treasuryUsdc' }
    ],
    allowFailure: false
  })
  const [
    tokenName, tokenSymbol, cap, agent, startBlock, streamBlocks,
    minTokenPrice, maxTokenPrice, currentPrice, totalTokensClaimed,
    totalUsdcRaised, totalUsdcToLiquidity, isLgeFinished, isLgeSuccessful,
    participantFeesBooked, agentAccrued, protocolAccrued, lpLocked,
    feeVolume30d, exitThreshold, feeBps, positionTokenId, pendingBuy, treasuryUsdc
  ] = results as [
    string, string, bigint, Address, bigint, bigint,
    bigint, bigint, bigint, bigint,
    bigint, bigint, boolean, boolean,
    bigint, bigint, bigint, boolean,
    bigint, bigint, number, bigint, bigint, bigint
  ]
  return {
    hook, token: tokenAddr, tokenName, tokenSymbol, cap, agent,
    startBlock, streamBlocks, minTokenPrice, maxTokenPrice, currentPrice,
    totalTokensClaimed, totalUsdcRaised, totalUsdcToLiquidity,
    isLgeFinished, isLgeSuccessful, participantFeesBooked, agentAccrued,
    protocolAccrued, lpLocked, feeVolume30d, exitThreshold, feeBps,
    positionTokenId, pendingBuy, treasuryUsdc
  }
}

export interface UserCampaignState {
  usdcToLiquidityDeposited: bigint
  remainingUsdcDeposited: bigint
  tokensToLiquidity: bigint
  accruedFees: bigint
  hasClaimedLp: boolean
  exited: boolean
  lpShare: bigint
  claimable: bigint
  pendingNative: bigint
}

export async function readUserState (client: PublicClient, hook: Address, user: Address): Promise<UserCampaignState> {
  const h = { address: hook, abi: LGEHookAbi } as const
  const [us, lpShare, claimable, pendingNative] = await client.multicall({
    contracts: [
      { ...h, functionName: 'userStates', args: [user] },
      { ...h, functionName: 'lpShares', args: [user] },
      { ...h, functionName: 'participantClaimable', args: [user] },
      { ...h, functionName: 'pendingNative', args: [user] }
    ],
    allowFailure: false
  })
  const s = us as readonly [bigint, bigint, bigint, bigint, bigint, boolean, boolean]
  return {
    usdcToLiquidityDeposited: s[0],
    remainingUsdcDeposited: s[1],
    tokensToLiquidity: s[2],
    accruedFees: s[3],
    hasClaimedLp: s[5],
    exited: s[6],
    lpShare: lpShare as bigint,
    claimable: claimable as bigint,
    pendingNative: pendingNative as bigint
  }
}

// ------------------------------------------------------------------
// Rising-rate curve (local mirror of LGECalculationsLibrary)
// ------------------------------------------------------------------

/** tokens per USDC at `block` — linear rise min→max over the window. */
export function priceAtBlock (c: Pick<CampaignState, 'startBlock' | 'streamBlocks' | 'minTokenPrice' | 'maxTokenPrice'>, block: bigint): bigint {
  if (block <= c.startBlock) return c.minTokenPrice
  if (block >= c.startBlock + c.streamBlocks) return c.maxTokenPrice
  const elapsed = block - c.startBlock
  return c.minTokenPrice + ((c.maxTokenPrice - c.minTokenPrice) * elapsed) / c.streamBlocks
}

export function priceCurve (c: Pick<CampaignState, 'startBlock' | 'streamBlocks' | 'minTokenPrice' | 'maxTokenPrice'>, segments = 48): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= segments; i++) {
    const b = c.startBlock + (c.streamBlocks * BigInt(i)) / BigInt(segments)
    pts.push([Number(b), Number(priceAtBlock(c, b)) / 1e18])
  }
  return pts
}

// ------------------------------------------------------------------
// Launch: CREATE2 address prediction + local salt mining
// (mirrors contracts/script/e2e.mjs; the RPC can't mine — see deploy doc §0)
// ------------------------------------------------------------------

const HOOK_PARAMS_COMPONENTS = [
  { name: 'poolManager', type: 'address' }, { name: 'positionManager', type: 'address' },
  { name: 'permit2', type: 'address' }, { name: 'token', type: 'address' },
  { name: 'agent', type: 'address' }, { name: 'protocol', type: 'address' },
  { name: 'vestingVault', type: 'address' }, { name: 'inferenceEscrow', type: 'address' },
  { name: 'startBlock', type: 'uint256' }, { name: 'streamBlocks', type: 'uint256' },
  { name: 'minTokenPrice', type: 'uint256' }, { name: 'maxTokenPrice', type: 'uint256' },
  { name: 'exitThreshold', type: 'uint256' }, { name: 'feeBps', type: 'uint24' },
  { name: 'vestingCliff', type: 'uint64' }, { name: 'vestingDuration', type: 'uint64' }
] as const

export interface LaunchParams {
  name: string
  symbol: string
  cap: bigint
  agent: Address
  startBlock: bigint
  streamBlocks: bigint
  minTokenPrice: bigint
  maxTokenPrice: bigint
  exitThreshold: bigint
  feeBps: number
  vestingCliff: bigint
  vestingDuration: bigint
}

export interface MinedLaunch {
  tokenSalt: `0x${string}`
  hookSalt: `0x${string}`
  tokenAddress: Address
  hookAddress: Address
}

export async function mineLaunch (client: PublicClient, p: LaunchParams, onProgress?: (tries: number) => void): Promise<MinedLaunch> {
  const flags = await client.readContract({
    address: MANAGER, abi: LGEManagerAbi, functionName: 'FLAGS'
  }) as bigint

  const tokenSalt = keccak256(concat([p.agent, '0x' + BigInt(Date.now()).toString(16).padStart(64, '0') as `0x${string}`]))
  const tokenCtor = encodeAbiParameters(
    [{ type: 'string' }, { type: 'string' }, { type: 'address' }, { type: 'string' }, { type: 'string' }, { type: 'address' }, { type: 'uint256' }],
    [p.name, p.symbol, p.agent, '', '', MANAGER, p.cap]
  )
  const tokenAddress = getCreate2Address({
    from: MANAGER, salt: tokenSalt,
    bytecodeHash: keccak256(concat([LGE_TOKEN_BYTECODE_ARC_TESTNET as `0x${string}`, tokenCtor]))
  })

  const hookCtor = encodeAbiParameters(
    [{ type: 'tuple', components: HOOK_PARAMS_COMPONENTS }],
    [{
      poolManager: POOL_MANAGER_ARC_TESTNET as Address,
      positionManager: POSITION_MANAGER_ARC_TESTNET as Address,
      permit2: PERMIT2_ARC_TESTNET as Address,
      token: tokenAddress,
      agent: p.agent,
      protocol: PROTOCOL_ARC_TESTNET as Address,
      vestingVault: VESTING_VAULT_ARC_TESTNET as Address,
      inferenceEscrow: INFERENCE_ESCROW_ARC_TESTNET as Address,
      startBlock: p.startBlock,
      streamBlocks: p.streamBlocks,
      minTokenPrice: p.minTokenPrice,
      maxTokenPrice: p.maxTokenPrice,
      exitThreshold: p.exitThreshold,
      feeBps: p.feeBps,
      vestingCliff: p.vestingCliff,
      vestingDuration: p.vestingDuration
    }]
  )
  const initCodeHash = keccak256(concat([LGE_HOOK_BYTECODE_ARC_TESTNET as `0x${string}`, hookCtor]))
  const mask = 0x3fffn
  const target = flags & mask
  for (let i = 0; i < 20_000_000; i++) {
    const salt = ('0x' + i.toString(16).padStart(64, '0')) as `0x${string}`
    const addr = getCreate2Address({ from: MANAGER, salt, bytecodeHash: initCodeHash })
    if ((BigInt(addr) & mask) === target) {
      const code = await client.getCode({ address: addr })
      if (!code || code === '0x') {
        return { tokenSalt, hookSalt: salt, tokenAddress, hookAddress: addr }
      }
    }
    if (i % 4096 === 0) {
      onProgress?.(i)
      await new Promise(r => setTimeout(r, 0)) // keep the tab responsive
    }
  }
  throw new Error('no salt found in 20M tries')
}

/**
 * Server-side LGE launch: CREATE2 salt mining + deployToken calldata.
 * Ported from console/src/lib/lge.ts (the WLK3 walkthrough proved this path);
 * chain reads go through the runner's minimal ChainReader (FLAGS via eth_call,
 * getCode for the collision check, getBlockNumber for startBlock).
 *
 * Addresses/bytecode are GENERATED artifacts vendored by
 * contracts/script/sync-console.mjs — do not edit; re-run the sync.
 */

import {
  concat, encodeAbiParameters, encodeFunctionData, getCreate2Address, keccak256,
  parseAbi, type Address, type Hex
} from 'viem'
import { LGEManagerAbi } from './LGEManagerAbi.js'
import { LGE_HOOK_BYTECODE_ARC_TESTNET } from './LGEHookBytecode.js'
import { LGE_TOKEN_BYTECODE_ARC_TESTNET } from './LGETokenBytecode.js'
import {
  LGE_MANAGER_ARC_TESTNET,
  POOL_MANAGER_ARC_TESTNET,
  POSITION_MANAGER_ARC_TESTNET,
  PERMIT2_ARC_TESTNET,
  PROTOCOL_ARC_TESTNET,
  VESTING_VAULT_ARC_TESTNET,
  INFERENCE_ESCROW_ARC_TESTNET
} from './addresses.js'

export const LGE_MANAGER: Record<number, Address> = {
  5042002: LGE_MANAGER_ARC_TESTNET as Address
}

const FLAGS_ABI = parseAbi(['function FLAGS() view returns (uint160)'])

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

/** What the model/operator supplies; prepareLaunch fills in the rest. */
export interface LaunchRequest {
  name: string
  symbol: string
  /** Total supply, 18-dec wei decimal string. */
  capWei: string
  /** Sale window in blocks (~0.5s blocks on Arc). */
  streamBlocks: string
  /** Tokens per USDC at window start (raw ratio — both legs 18-dec). */
  minTokenPrice: string
  /** Tokens per USDC at window end. */
  maxTokenPrice: string
  feeBps: number
}

/** The full lge_launch intent params (mined fields injected). */
export interface PreparedLaunch extends LaunchRequest {
  /** The agent's own wallet — token admin, hook agent, vesting beneficiary. */
  agentAddress: string
  startBlock: string
  tokenSalt: string
  hookSalt: string
  tokenAddress: string
  hookAddress: string
}

/** The slice of chain access launch preparation needs (a superset of the
 *  runner's ChainReader; the runner passes its own client). */
export interface LaunchChain {
  call (args: { to: Address; data?: Hex }): Promise<{ data?: Hex | undefined }>
  getCode (args: { address: Address }): Promise<Hex | undefined>
  getBlockNumber (): Promise<bigint>
}

const VESTING_DURATION_12M = 31_536_000n

/**
 * Mine salts and precompute the CREATE2 addresses. Deterministic given the
 * chain's FLAGS; the token salt carries Date.now() entropy so re-runs never
 * collide with a prior attempt.
 */
export async function prepareLaunch (
  chain: LaunchChain,
  chainId: number,
  agentWallet: Address,
  req: LaunchRequest
): Promise<PreparedLaunch> {
  const manager = LGE_MANAGER[chainId]
  if (!manager) throw new Error(`no LGEManager known for chain ${chainId}`)

  const flagsRes = await chain.call({
    to: manager,
    data: encodeFunctionData({ abi: FLAGS_ABI, functionName: 'FLAGS' })
  })
  if (!flagsRes.data) throw new Error('FLAGS read returned no data')
  const flags = BigInt(flagsRes.data)

  const agent = agentWallet
  const tokenSalt = keccak256(concat([agent, `0x${BigInt(Date.now()).toString(16).padStart(64, '0')}` as Hex]))
  const tokenCtor = encodeAbiParameters(
    [{ type: 'string' }, { type: 'string' }, { type: 'address' }, { type: 'string' }, { type: 'string' }, { type: 'address' }, { type: 'uint256' }],
    [req.name, req.symbol, agent, '', '', manager, BigInt(req.capWei)]
  )
  const tokenAddress = getCreate2Address({
    from: manager,
    salt: tokenSalt,
    bytecodeHash: keccak256(concat([LGE_TOKEN_BYTECODE_ARC_TESTNET as Hex, tokenCtor]))
  })

  const startBlock = (await chain.getBlockNumber()) + 20n
  const hookCtor = encodeAbiParameters(
    [{ type: 'tuple', components: HOOK_PARAMS_COMPONENTS }],
    [{
      poolManager: POOL_MANAGER_ARC_TESTNET as Address,
      positionManager: POSITION_MANAGER_ARC_TESTNET as Address,
      permit2: PERMIT2_ARC_TESTNET as Address,
      token: tokenAddress,
      agent,
      protocol: PROTOCOL_ARC_TESTNET as Address,
      vestingVault: VESTING_VAULT_ARC_TESTNET as Address,
      inferenceEscrow: INFERENCE_ESCROW_ARC_TESTNET as Address,
      startBlock,
      streamBlocks: BigInt(req.streamBlocks),
      minTokenPrice: BigInt(req.minTokenPrice),
      maxTokenPrice: BigInt(req.maxTokenPrice),
      exitThreshold: 0n, // unset item in PRODUCT.md: exits disabled
      feeBps: req.feeBps,
      vestingCliff: 0n,
      vestingDuration: VESTING_DURATION_12M
    }]
  )
  const initCodeHash = keccak256(concat([LGE_HOOK_BYTECODE_ARC_TESTNET as Hex, hookCtor]))

  const mask = 0x3fffn
  const target = flags & mask
  for (let i = 0; i < 20_000_000; i++) {
    const salt = `0x${i.toString(16).padStart(64, '0')}` as Hex
    const addr = getCreate2Address({ from: manager, salt, bytecodeHash: initCodeHash })
    if ((BigInt(addr) & mask) === target) {
      const code = await chain.getCode({ address: addr })
      if (!code || code === '0x') {
        return {
          ...req,
          agentAddress: agent,
          startBlock: startBlock.toString(),
          tokenSalt,
          hookSalt: salt,
          tokenAddress,
          hookAddress: addr
        }
      }
    }
  }
  throw new Error('no hook salt found in 20M tries')
}

/** deployToken calldata for a prepared launch. */
export function buildLaunchTx (p: PreparedLaunch, chainId: number): { to: Address; data: Hex; value: bigint } {
  const manager = LGE_MANAGER[chainId]
  if (!manager) throw new Error(`no LGEManager known for chain ${chainId}`)
  return {
    to: manager,
    data: encodeFunctionData({
      abi: LGEManagerAbi,
      functionName: 'deployToken',
      args: [{
        tokenConfig: {
          tokenAdmin: p.agentAddress as Address,
          name: p.name,
          symbol: p.symbol,
          image: '',
          metadata: '',
          cap: BigInt(p.capWei),
          tokenSalt: p.tokenSalt as Hex
        },
        hookConfig: {
          hookSalt: p.hookSalt as Hex,
          startBlock: BigInt(p.startBlock),
          streamBlocks: BigInt(p.streamBlocks),
          minTokenPrice: BigInt(p.minTokenPrice),
          maxTokenPrice: BigInt(p.maxTokenPrice),
          exitThreshold: 0n,
          feeBps: p.feeBps,
          vestingCliff: 0n,
          vestingDuration: VESTING_DURATION_12M
        }
      }]
    }),
    value: 0n
  }
}

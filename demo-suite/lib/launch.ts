import {
  concat, encodeAbiParameters, encodeFunctionData, encodePacked, getCreate2Address, keccak256,
  parseEther, type Address, type Hex
} from 'viem'
import {
  publicClient, walletClient, GAS
} from './chain.js'
import {
  LGE_MANAGER, POOL_MANAGER, POSITION_MANAGER, PERMIT2, PROTOCOL,
  VESTING_VAULT, INFERENCE_ESCROW, HOOK_BYTECODE, TOKEN_BYTECODE,
  MANAGER_ABI, TOKEN_ABI, LIB_ABI, HOOK_ABI
} from './artifacts.js'

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

export interface LaunchConfig {
  name: string
  symbol: string
  capTokens: number
  streamBlocks: bigint
  minTokenPrice: bigint
  maxTokenPrice: bigint
  feeBps: number
  exitThreshold?: bigint
  vestingCliff?: bigint
  vestingDuration?: bigint
}

export interface Launched {
  tokenAddress: Address
  hookAddress: Address
  startBlock: bigint
  streamBlocks: bigint
  txHash: string
}

export async function launchLGE (ownerPk: `0x${string}`, cfg: LaunchConfig): Promise<Launched> {
  const account = walletClient(ownerPk).account
  const capWei = parseEther(String(cfg.capTokens))

  const block = await publicClient.getBlockNumber()
  const startBlock = block + 20n

  const tokenSalt = keccak256(encodePacked(['address', 'uint256'], [account.address, BigInt(Date.now())]))
  const tokenCtor = encodeAbiParameters(
    [{ type: 'string' }, { type: 'string' }, { type: 'address' }, { type: 'string' }, { type: 'string' }, { type: 'address' }, { type: 'uint256' }],
    [cfg.name, cfg.symbol, account.address, '', '', LGE_MANAGER, capWei]
  )
  const tokenAddress = getCreate2Address({
    from: LGE_MANAGER,
    salt: tokenSalt,
    bytecodeHash: keccak256(concat([HOOK_BYTECODE, tokenCtor]))
  })

  const hookParams = {
    poolManager: POOL_MANAGER,
    positionManager: POSITION_MANAGER,
    permit2: PERMIT2,
    token: tokenAddress,
    agent: account.address,
    protocol: PROTOCOL,
    vestingVault: VESTING_VAULT,
    inferenceEscrow: INFERENCE_ESCROW,
    startBlock,
    streamBlocks: cfg.streamBlocks,
    minTokenPrice: cfg.minTokenPrice,
    maxTokenPrice: cfg.maxTokenPrice,
    exitThreshold: cfg.exitThreshold ?? 0n,
    feeBps: cfg.feeBps,
    vestingCliff: cfg.vestingCliff ?? 0n,
    vestingDuration: cfg.vestingDuration ?? BigInt(365 * 24 * 3600)
  }
  const hookCtor = encodeAbiParameters(
    [{ type: 'tuple', components: HOOK_PARAMS_COMPONENTS }],
    [hookParams]
  )

  const flags = await publicClient.readContract({
    address: LGE_MANAGER,
    abi: MANAGER_ABI,
    functionName: 'FLAGS'
  }) as bigint
  const initCodeHash = keccak256(concat([HOOK_BYTECODE, hookCtor]))
  let hookAddress: Address | undefined
  let hookSalt: Hex | undefined
  for (let i = 0; i < 20_000_000; i++) {
    const salt = ('0x' + i.toString(16).padStart(64, '0')) as Hex
    const addr = getCreate2Address({ from: LGE_MANAGER, salt, bytecodeHash: initCodeHash })
    if ((BigInt(addr) & 0x3fffn) === BigInt(flags)) {
      const code = await publicClient.getCode({ address: addr })
      if (!code || code === '0x') {
        hookAddress = addr
        hookSalt = salt
        break
      }
    }
    if (i > 0 && i % 2_000_000 === 0) console.log(`[mine] ${i} iterations...`)
  }
  if (!hookAddress) throw new Error('no salt found in 20M iterations')

  const w = walletClient(ownerPk)
  const hash = await w.writeContract({
    address: LGE_MANAGER,
    abi: MANAGER_ABI,
    functionName: 'deployToken',
    args: [{
      tokenConfig: {
        tokenAdmin: account.address,
        name: cfg.name,
        symbol: cfg.symbol,
        image: '',
        metadata: '',
        cap: capWei,
        tokenSalt
      },
      hookConfig: {
        hookSalt,
        startBlock,
        streamBlocks: cfg.streamBlocks,
        minTokenPrice: cfg.minTokenPrice,
        maxTokenPrice: cfg.maxTokenPrice,
        exitThreshold: cfg.exitThreshold ?? 0n,
        feeBps: cfg.feeBps,
        vestingCliff: cfg.vestingCliff ?? 0n,
        vestingDuration: cfg.vestingDuration ?? BigInt(365 * 24 * 3600)
      }
    }],
    gas: 6_500_000n,
    ...GAS
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('deployToken reverted')
  console.log(`[launch] ${cfg.symbol}: token=${tokenAddress} hook=${hookAddress} start=${startBlock}`)
  return { tokenAddress, hookAddress, startBlock, streamBlocks: cfg.streamBlocks, txHash: hash }
}

export async function deposit (depositorPk: `0x${string}`, hook: Address, amountOfTokens: bigint) {
  const block = await publicClient.getBlockNumber()
  const [startBlock, streamBlocks, minPrice, maxPrice] = await Promise.all([
    publicClient.readContract({ address: hook, abi: HOOK_ABI, functionName: 'startBlock' }) as Promise<bigint>,
    publicClient.readContract({ address: hook, abi: HOOK_ABI, functionName: 'streamBlocks' }) as Promise<bigint>,
    publicClient.readContract({ address: hook, abi: HOOK_ABI, functionName: 'minTokenPrice' }) as Promise<bigint>,
    publicClient.readContract({ address: hook, abi: HOOK_ABI, functionName: 'maxTokenPrice' }) as Promise<bigint>
  ])
  while ((await publicClient.getBlockNumber()) < startBlock) {
    await new Promise(r => setTimeout(r, 1000))
  }
  const currentBlock = await publicClient.getBlockNumber()
  const needed = await publicClient.readContract({
    address: '0xA6C7f398122707Bd10f917A091D3BC7C2C95d53b' as Address,
    abi: LIB_ABI,
    functionName: 'calculateUsdcNeeded',
    args: [currentBlock, startBlock, streamBlocks, minPrice, maxPrice, amountOfTokens]
  }) as bigint
  const value = (needed * 105n) / 100n
  const w = walletClient(depositorPk)
  const hash = await w.writeContract({
    address: hook,
    abi: HOOK_ABI,
    functionName: 'deposit',
    args: [amountOfTokens],
    value,
    ...GAS
  })
  await publicClient.waitForTransactionReceipt({ hash })
  console.log(`[deposit] ${amountOfTokens / 10n ** 18n} tokens into ${hook}: ${hash}`)
  return hash
}

export async function getCap (token: Address): Promise<bigint> {
  return publicClient.readContract({ address: token, abi: TOKEN_ABI, functionName: 'cap' }) as Promise<bigint>
}

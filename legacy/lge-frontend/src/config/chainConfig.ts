import { unichainSepolia } from 'viem/chains'
import { arcTestnet } from './chains'
import {
  LGE_HOOK_BYTECODE,
  LGE_HOOK_BYTECODE_ARC_TESTNET
} from './contracts/bytecode/LGEHookBytecode'
import {
  LGE_TOKEN_BYTECODE,
  LGE_TOKEN_BYTECODE_ARC_TESTNET
} from './contracts/bytecode/LGETokenBytecode'
import {
  LGE_MANAGER_ADDRESS_UNICHAIN_SEPOLIA,
  LGE_CALCULATIONS_LIBRARY_UNICHAIN_SEPOLIA,
  POOL_MANAGER_UNICHAIN_SEPOLIA,
  POSITION_MANAGER_UNICHAIN_SEPOLIA,
  PERMIT2_UNICHAIN_SEPOLIA,
  HOOK_MINER_UNICHAIN_SEPOLIA,
  LGE_MANAGER_ADDRESS_ARC_TESTNET,
  LGE_CALCULATIONS_LIBRARY_ARC_TESTNET,
  POOL_MANAGER_ARC_TESTNET,
  POSITION_MANAGER_ARC_TESTNET,
  PERMIT2_ARC_TESTNET,
  HOOK_MINER_ARC_TESTNET
} from './const'

export interface ChainConfig {
  lgeManager: `0x${string}` | undefined
  calculationsLibrary: `0x${string}` | undefined
  poolManager: `0x${string}` | undefined
  positionManager: `0x${string}` | undefined
  permit2: `0x${string}` | undefined
  hookMiner: `0x${string}` | undefined
  currencySymbol: string
  // When the native token is a USD stablecoin (Arc: USDC), the USD figure IS
  // the native amount - no external price feed may be applied.
  nativeIsUsdStable: boolean
  // Creation bytecode is linked per deployment - never reuse across chains.
  hookBytecode: `0x${string}`
  tokenBytecode: `0x${string}`
}

export const CHAIN_CONFIG: Record<number, ChainConfig> = {
  [unichainSepolia.id]: {
    lgeManager: LGE_MANAGER_ADDRESS_UNICHAIN_SEPOLIA as `0x${string}` | undefined,
    calculationsLibrary: LGE_CALCULATIONS_LIBRARY_UNICHAIN_SEPOLIA as `0x${string}` | undefined,
    poolManager: POOL_MANAGER_UNICHAIN_SEPOLIA as `0x${string}` | undefined,
    positionManager: POSITION_MANAGER_UNICHAIN_SEPOLIA as `0x${string}` | undefined,
    permit2: PERMIT2_UNICHAIN_SEPOLIA as `0x${string}` | undefined,
    hookMiner: HOOK_MINER_UNICHAIN_SEPOLIA as `0x${string}` | undefined,
    currencySymbol: 'ETH',
    nativeIsUsdStable: false,
    hookBytecode: LGE_HOOK_BYTECODE,
    tokenBytecode: LGE_TOKEN_BYTECODE
  },
  [arcTestnet.id]: {
    lgeManager: LGE_MANAGER_ADDRESS_ARC_TESTNET as `0x${string}` | undefined,
    calculationsLibrary: LGE_CALCULATIONS_LIBRARY_ARC_TESTNET as `0x${string}` | undefined,
    poolManager: POOL_MANAGER_ARC_TESTNET as `0x${string}` | undefined,
    positionManager: POSITION_MANAGER_ARC_TESTNET as `0x${string}` | undefined,
    permit2: PERMIT2_ARC_TESTNET as `0x${string}` | undefined,
    hookMiner: HOOK_MINER_ARC_TESTNET as `0x${string}` | undefined,
    currencySymbol: 'USDC',
    nativeIsUsdStable: true,
    hookBytecode: LGE_HOOK_BYTECODE_ARC_TESTNET,
    tokenBytecode: LGE_TOKEN_BYTECODE_ARC_TESTNET
  }
}

export function getChainConfig (chainId: number | undefined): ChainConfig | undefined {
  if (chainId === undefined) return undefined
  return CHAIN_CONFIG[chainId]
}

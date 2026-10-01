import { defineChain } from 'viem'

/** Arc testnet. Gas is native USDC (18 decimals). Chain 5042002. */
export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_ARC_RPC_URL ?? 'https://rpc.testnet.arc.io'] }
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://explorer.testnet.arc.io' }
  },
  testnet: true
})

/** Block time ~0.5s — used for block→duration display and auction math. */
export const BLOCKS_PER_SECOND = 2
export const BLOCKS_PER_HOUR = 7200

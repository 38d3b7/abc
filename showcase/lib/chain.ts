import { createPublicClient, http, type Hex } from 'viem'
import { defineChain } from 'viem'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.io'] } },
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11', blockCreated: 0 }
  }
})

export function publicClient () {
  return createPublicClient({ chain: arcTestnet, transport: http() })
}

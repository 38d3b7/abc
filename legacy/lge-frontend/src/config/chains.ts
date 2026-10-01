import { defineChain } from 'viem'

// Arc Testnet - chain ID 5042002
// Native currency is USDC viewed as an 18-decimal native token (msg.value /
// address.balance view, used for gas). This is NOT the 6-decimal ERC-20 USDC
// interface at 0x3600000000000000000000000000000000000000 - the two views
// differ by 10^12 and must never be mixed.
export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc.io'],
      webSocket: ['wss://rpc.testnet.arc.io']
    }
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' }
  },
  testnet: true
})

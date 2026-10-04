import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import 'dotenv/config'

export const arcTestnet = defineChain({
  id: 5_042_002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.io'] } }
})

export const GAS = {
  maxFeePerGas: 20_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n
}

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http()
})

export function walletClient (pk: `0x${string}`) {
  return createWalletClient({
    account: privateKeyToAccount(pk),
    chain: arcTestnet,
    transport: http()
  })
}

export function freshWallet (label: string) {
  const pk = generatePrivateKey()
  const account = privateKeyToAccount(pk)
  console.log(`[wallet] ${label}: ${account.address}`)
  return { label, pk, address: account.address }
}

export async function fund (fromPk: `0x${string}`, to: `0x${string}`, usdc: number) {
  const from = walletClient(fromPk)
  const value = BigInt(Math.round(usdc * 1e18))
  const hash = await from.sendTransaction({ to, value, ...GAS })
  await publicClient.waitForTransactionReceipt({ hash })
  console.log(`[fund] sent ${usdc} USDC to ${to}: ${hash}`)
  return hash
}

export const NATIVE_BALANCE_ABI = parseAbi(['function balanceOf(address) view returns (uint256)'])

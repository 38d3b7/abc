import { createConnector } from 'wagmi'
import { createPublicClient, createWalletClient, hexToString, http, isHex, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from './chain'

/**
 * Dev-only connector: a raw private key from VITE_DEV_WALLET_PK, so the
 * console is fully drivable on testnet without a browser extension (demo
 * video, headless walkthroughs). Never set the var in a hosted build — the
 * key sits in the bundle env. The connector is only registered when the env
 * var is present.
 */
export function devKeyConnector (pk: `0x${string}`) {
  const account = privateKeyToAccount(pk)
  const rpcUrl = arcTestnet.rpcUrls.default.http[0]
  const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(rpcUrl) })
  const pub = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) })

  const provider = {
    request: async ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
      const p = (params ?? []) as unknown[]
      switch (method) {
        case 'eth_accounts':
        case 'eth_requestAccounts':
          return [account.address]
        case 'eth_chainId':
          return `0x${arcTestnet.id.toString(16)}`
        case 'eth_sendTransaction': {
          const [tx] = p as [{ to: Address; data?: `0x${string}`; value?: string; gas?: string }]
          return wallet.sendTransaction({
            account,
            chain: arcTestnet,
            to: tx.to,
            data: tx.data ?? '0x',
            value: tx.value !== undefined ? BigInt(tx.value) : 0n
          })
        }
        case 'personal_sign': {
          // JSON-RPC personal_sign params are [hexMessage, address]. Signing the
          // hex string itself makes SIWE verification fail with "invalid login".
          const [first, second] = p as [string, string]
          const data = typeof first === 'string' && isHex(first) && first.length > 42 ? first : second
          const message = isHex(data) ? hexToString(data) : data
          return wallet.signMessage({ account, message })
        }
        default:
          return pub.request({ method, params: p } as never)
      }
    },
    on: () => {},
    removeListener: () => {}
  }

  return createConnector((config) => ({
    id: 'devKey',
    name: 'Dev key (testnet)',
    type: 'devKey',
    icon: undefined,
    supportsSimulation: false,

    async connect () {
      config.emitter.emit('change', { accounts: [account.address] })
      return { accounts: [account.address], chainId: arcTestnet.id }
    },
    async disconnect () {},
    async getAccounts () {
      return [account.address]
    },
    async getChainId () {
      return arcTestnet.id
    },
    async isAuthorized () {
      return true
    },
    async switchChain () {
      return arcTestnet
    },
    onAccountsChanged () {},
    onChainChanged () {},
    onDisconnect () {},
    async getProvider () {
      return provider
    }
  }))
}

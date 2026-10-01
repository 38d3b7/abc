import { http, createConfig } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { arcTestnet } from './lib/chain'

// No Privy: participants connect with plain wagmi connectors.
const wcProjectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [
    injected(),
    ...(wcProjectId ? [walletConnect({ projectId: wcProjectId })] : [])
  ],
  transports: {
    [arcTestnet.id]: http()
  }
})

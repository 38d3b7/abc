import { http, createConfig } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { arcTestnet } from './lib/chain'
import { devKeyConnector } from './lib/devKey'

// No Privy: participants connect with plain wagmi connectors.
const wcProjectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined
// Dev-only: raw testnet key so the console is drivable without an extension
// (demo video, headless walkthroughs). Never set in a hosted build.
const devPk = import.meta.env.VITE_DEV_WALLET_PK as `0x${string}` | undefined

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [
    ...(devPk ? [devKeyConnector(devPk)] : []),
    injected(),
    ...(wcProjectId ? [walletConnect({ projectId: wcProjectId })] : [])
  ],
  transports: {
    [arcTestnet.id]: http()
  }
})

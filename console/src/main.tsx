import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { wagmiConfig } from './wagmi'
import { App } from './App'
import './styles/tokens.css'
import './styles/shell.css'
import './styles/components.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchInterval: 4000, retry: 1, staleTime: 1500 } }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
)

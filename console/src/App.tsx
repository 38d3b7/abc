import { NavLink, Route, Routes } from 'react-router-dom'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { api } from './api/client'
import { fmtUsdc, fmtUsdcFull } from './lib/format'
import { arcTestnet } from './lib/chain'
import { Chip } from './components/Chip'
import { Button } from './components/Button'
import { Overview } from './sections/Overview'
import { Token } from './sections/Token'
import { Activity } from './sections/Activity'
import { Automations } from './sections/Automations'
import { Settings } from './sections/Settings'
import { HashLink } from './components/HashLink'
import { useBalance } from 'wagmi'

/** The operator's agent: first agent the executor returns (single-agent MVP). */
export function useAgent () {
  return useQuery({
    queryKey: ['agent'],
    queryFn: async () => {
      const agents = await api.listAgents()
      return agents[0] ?? null
    },
    retry: false,
    refetchInterval: 8000
  })
}

function TopBar () {
  const agent = useAgent()
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const balance = useBalance({
    address: (agent.data?.walletAddress ?? undefined) as `0x${string}` | undefined,
    query: { enabled: Boolean(agent.data?.walletAddress) }
  })

  return (
    <div className="topbar">
      <span className="agent-name">{agent.data?.name ?? 'ABC'}</span>
      <Chip tone="acc">{arcTestnet.name}</Chip>
      {agent.data?.walletAddress ? <HashLink hash={agent.data.walletAddress} /> : null}
      <div className="spacer" />
      <div className="balance">
        <span className="label">Agent USDC</span>
        <span className="mono" title={balance.data ? fmtUsdcFull(balance.data.value) : undefined}>
          {balance.data ? `${fmtUsdc(balance.data.value)} USDC` : '—'}
        </span>
      </div>
      {isConnected ? (
        <>
          <HashLink hash={address!} />
          <Button onClick={() => disconnect()}>Disconnect</Button>
        </>
      ) : (
        <Button variant="primary" onClick={() => connect({ connector: connectors[0] })}>Connect wallet</Button>
      )}
    </div>
  )
}

export function App () {
  return (
    <div className="shell">
      <TopBar />
      <nav className="nav">
        <div className="nav-section label">Console</div>
        <NavLink to="/" end className={({ isActive }) => isActive ? 'current' : ''}>Overview</NavLink>
        <NavLink to="/token" className={({ isActive }) => isActive ? 'current' : ''}>Token</NavLink>
        <NavLink to="/activity" className={({ isActive }) => isActive ? 'current' : ''}>Activity</NavLink>
        <NavLink to="/automations" className={({ isActive }) => isActive ? 'current' : ''}>Automations</NavLink>
        <NavLink to="/settings" className={({ isActive }) => isActive ? 'current' : ''}>Settings</NavLink>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/token" element={<Token />} />
          <Route path="/token/:hookAddress" element={<Token />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/automations" element={<Automations />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}

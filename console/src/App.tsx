import { NavLink, Route, Routes } from 'react-router-dom'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Agent } from './api/client'
import { fmtUsdc, fmtUsdcFull } from './lib/format'
import { arcTestnet } from './lib/chain'
import { Chip } from './components/Chip'
import { Button } from './components/Button'
import { Chat } from './sections/Chat'
import { Overview } from './sections/Overview'
import { Token } from './sections/Token'
import { Activity } from './sections/Activity'
import { Automations } from './sections/Automations'
import { Skills } from './sections/Skills'
import { Settings } from './sections/Settings'
import { useBalance } from 'wagmi'
import { truncHash } from './components/HashLink'
import { Select } from './components/Select'

/** Selected agent id, persisted across reloads; module-level store so every
 *  useAgent caller agrees without prop drilling. */
let agentListeners: Array<() => void> = []
export function setSelectedAgentId (id: string) {
  localStorage.setItem('abc.agentId', id)
  agentListeners.forEach(l => l())
}
function useSelectedAgentId (): string {
  return useSyncExternalStore(
    (cb) => { agentListeners.push(cb); return () => { agentListeners = agentListeners.filter(l => l !== cb) } },
    () => localStorage.getItem('abc.agentId') ?? ''
  )
}

export function useAgents () {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => api.listAgents(),
    retry: false,
    refetchInterval: 8000
  })
}

/** The operator's agent: the picker selection, defaulting to the most
 *  recently created (the one you just made). */
export function useAgent () {
  const agents = useAgents()
  const selectedId = useSelectedAgentId()
  const data = useMemo<Agent | null | undefined>(() => {
    const list = agents.data
    if (!list) return undefined // still loading / error
    if (list.length === 0) return null
    return list.find(a => a.id === selectedId) ?? list[list.length - 1]
  }, [agents.data, selectedId])
  return { ...agents, data }
}

/** One-click agent creation: name in, the server derives the slug and
 *  provisions the wallet in the same request; the new agent is selected. */
function NewAgentButton () {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const qc = useQueryClient()

  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    setErr('')
    try {
      const agent = await api.createAgent(name.trim())
      await qc.invalidateQueries({ queryKey: ['agents'] })
      setSelectedAgentId(agent.id)
      setName('')
      setOpen(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'create failed')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return <Button onClick={() => setOpen(true)}>New agent</Button>
  return (
    <span className="new-agent">
      <input
        className="mono-input"
        placeholder="Agent name"
        value={name}
        autoFocus
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') void submit()
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      <Button variant="primary" disabled={busy || !name.trim()} onClick={() => void submit()}>
        {busy ? 'Creating…' : 'Create'}
      </Button>
      <Button onClick={() => setOpen(false)}>Cancel</Button>
      {err ? <span className="muted small">{err}</span> : null}
    </span>
  )
}

function TopBar () {
  const agent = useAgent()
  const agents = useAgents()
  const selectedId = useSelectedAgentId()
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const balance = useBalance({
    address: (agent.data?.walletAddress ?? undefined) as `0x${string}` | undefined,
    query: { enabled: Boolean(agent.data?.walletAddress) }
  })

  return (
    <div className="topbar">
      <div className="topbar-left">
        {(agents.data?.length ?? 0) > 1 ? (
          <Select
            className="agent-picker compact"
            value={agent.data?.id ?? selectedId}
            onChange={e => setSelectedAgentId(e.target.value)}
            aria-label="Active agent"
          >
            {agents.data!.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        ) : (
          <span className="agent-name">{agent.data?.name ?? 'ABC'}</span>
        )}
        <NewAgentButton />
        <Chip tone="acc">{arcTestnet.name}</Chip>
      </div>
      <div className="topbar-right">
        <div className="balance">
          <span className="label">Agent USDC</span>
          <span className="mono" title={balance.data ? fmtUsdcFull(balance.data.value) : undefined}>
            {balance.data ? `${fmtUsdc(balance.data.value)} USDC` : '—'}
          </span>
        </div>
        {isConnected && address ? (
          <button
            type="button"
            className="wallet-pill"
            title={`${address} — click to copy`}
            onClick={() => void navigator.clipboard?.writeText(address)}
          >
            {truncHash(address)}
          </button>
        ) : null}
        {isConnected ? (
          <Button onClick={() => disconnect()}>Disconnect</Button>
        ) : (
          <Button variant="primary" onClick={() => connect({ connector: connectors[0] })}>Connect wallet</Button>
        )}
      </div>
    </div>
  )
}

export function App () {
  return (
    <div className="shell">
      <TopBar />
      <nav className="nav">
        <div className="nav-brand brand-plate">
          <img
            className="nav-brand-logo"
            src="/brand/abc-logo.png"
            alt="abc"
            width={148}
            height={52}
          />
          <span className="nav-product-sub">Agentic business console</span>
        </div>
        <div className="nav-section">Navigate</div>
        <NavLink to="/chat" className={({ isActive }) => isActive ? 'current' : ''}>Chat</NavLink>
        <NavLink to="/" end className={({ isActive }) => isActive ? 'current' : ''}>Overview</NavLink>
        <NavLink to="/token" className={({ isActive }) => isActive ? 'current' : ''}>Token</NavLink>
        <NavLink to="/activity" className={({ isActive }) => isActive ? 'current' : ''}>Activity</NavLink>
        <NavLink to="/automations" className={({ isActive }) => isActive ? 'current' : ''}>Automations</NavLink>
        <NavLink to="/skills" className={({ isActive }) => isActive ? 'current' : ''}>Skills</NavLink>
        <NavLink to="/settings" className={({ isActive }) => isActive ? 'current' : ''}>Settings</NavLink>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/chat" element={<Chat />} />
          <Route path="/" element={<Overview />} />
          <Route path="/token" element={<Token />} />
          <Route path="/token/:hookAddress" element={<Token />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/automations" element={<Automations />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePublicClient, useWatchBlockNumber } from 'wagmi'
import { useQueries, useQuery, keepPreviousData } from '@tanstack/react-query'
import { listCampaigns, readCampaign, type CampaignState } from '../lib/lge'
import { fmtTokens, fmtUsdc, fmtBlocks } from '../lib/format'
import { Table } from '../components/Table'
import { Button } from '../components/Button'
import { Chip } from '../components/Chip'
import { HashLink } from '../components/HashLink'
import { Select } from '../components/Select'
import { LaunchWizard } from './token/LaunchWizard'
import { CampaignDetail } from './token/CampaignDetail'
import { PageShell } from '../components/PageShell'

/** Shared campaign query, refreshed each new block (~0.5s on Arc). */
export function useCampaign (hook: `0x${string}`) {
  const client = usePublicClient()
  const [block, setBlock] = useState<bigint | undefined>(undefined)
  useWatchBlockNumber({ onBlockNumber: setBlock })
  return useQuery({
    queryKey: ['campaign', hook, block?.toString() ?? '0'],
    queryFn: () => readCampaign(client!, hook),
    enabled: Boolean(client),
    placeholderData: keepPreviousData
  })
}

export function campaignChip (s: CampaignState) {
  if (s.isLgeSuccessful) return <Chip tone="ok">LGE successful</Chip>
  if (s.isLgeFinished) return <Chip tone="bad">LGE failed</Chip>
  return <Chip tone="acc">Live</Chip>
}

const LAUNCH_STATE_FILTERS = [
  { value: 'all', label: 'All states' },
  { value: 'live', label: 'Live' },
  { value: 'success', label: 'Successful' },
  { value: 'failed', label: 'Failed' }
] as const

function matchesLaunchState (s: CampaignState, filter: string): boolean {
  if (filter === 'all') return true
  if (filter === 'live') return !s.isLgeFinished
  if (filter === 'success') return s.isLgeSuccessful
  if (filter === 'failed') return s.isLgeFinished && !s.isLgeSuccessful
  return true
}

export function Token () {
  const { hookAddress } = useParams()
  const client = usePublicClient()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState('all')
  const navigate = useNavigate()

  const campaigns = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => listCampaigns(client!),
    enabled: Boolean(client)
  })

  if (hookAddress) {
    return <CampaignDetail hook={hookAddress as `0x${string}`} />
  }

  const rows = campaigns.data ?? []

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => (
      r.hook.toLowerCase().includes(q) ||
      r.token.toLowerCase().includes(q)
    ))
  }, [rows, query])

  const stateReads = useQueries({
    queries: searched.map(r => ({
      queryKey: ['campaign', r.hook, 'state-filter'],
      queryFn: () => readCampaign(client!, r.hook),
      enabled: Boolean(client) && stateFilter !== 'all',
      staleTime: 3000
    }))
  })

  const filtered = useMemo(() => {
    if (stateFilter === 'all') return searched
    return searched.filter((_row, i) => {
      const s = stateReads[i]?.data
      return s ? matchesLaunchState(s, stateFilter) : false
    })
  }, [searched, stateFilter, stateReads])

  const stateFilterLoading = stateFilter !== 'all' && stateReads.some(q => q.isLoading)

  const recordLabel = campaigns.isLoading
    ? 'Loading…'
    : `${filtered.length} launch${filtered.length === 1 ? '' : 'es'}`

  const toolbar = (
    <div className="page-toolbar">
      <input
        type="search"
        className="mono-input"
        placeholder="Search hook or token address…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        aria-label="Search launches"
      />
      <Select
        value={stateFilter}
        onChange={e => setStateFilter(e.target.value)}
        aria-label="Filter by state"
      >
        {LAUNCH_STATE_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </Select>
      <span className="record-count">{recordLabel}</span>
      <span className="spacer" />
      <Button variant="primary" onClick={() => setWizardOpen(true)}>New launch</Button>
    </div>
  )

  return (
    <PageShell
      title="Token"
      lead="Liquidity generation events. Each row is a launch; the campaign link opens the public deposit page."
      toolbar={toolbar}
    >
      {wizardOpen ? (
        <LaunchWizard
          onClose={() => setWizardOpen(false)}
          onLaunched={(hook) => { setWizardOpen(false); void campaigns.refetch(); navigate(`/token/${hook}`) }}
        />
      ) : null}

      <div className="table-section">
        <Table
          columns={[
            {
              head: 'Token',
              role: 'primary',
              cell: r => <TokenNameCell hook={r.hook} fallback={r.token} />
            },
            { head: 'State', cell: r => <CampaignStateCell hook={r.hook} /> },
            { head: 'Stream duration', role: 'mono', cell: r => <StreamDurationCell hook={r.hook} /> }
          ]}
          rows={filtered}
          keyOf={r => r.hook}
          detail={r => <CampaignPreview hook={r.hook} />}
          empty={campaigns.isLoading || stateFilterLoading ? 'Loading…' : 'No launches match this filter.'}
        />
        <p className="table-footnote">Expand a row for on-chain figures and hook address.</p>
      </div>
    </PageShell>
  )
}

function TokenNameCell ({ hook, fallback }: { hook: `0x${string}`; fallback: string }) {
  const c = useCampaign(hook)
  if (!c.data) return <span className="col-mono muted">{fallback.slice(0, 10)}…</span>
  return (
    <Link to={`/token/${hook}`} className="campaign-link">
      <span className="token-name">{c.data.tokenName}</span>
      <span className="ticker">${c.data.tokenSymbol}</span>
    </Link>
  )
}

function CampaignStateCell ({ hook }: { hook: `0x${string}` }) {
  const c = useCampaign(hook)
  if (!c.data) return <span className="muted">…</span>
  return campaignChip(c.data)
}

function StreamDurationCell ({ hook }: { hook: `0x${string}` }) {
  const c = useCampaign(hook)
  if (!c.data) return <span className="muted">…</span>
  return <>{fmtBlocks(c.data.streamBlocks)}</>
}

function CampaignPreview ({ hook }: { hook: `0x${string}` }) {
  const c = useCampaign(hook)
  if (!c.data) return null
  const s = c.data
  const soldPct = s.cap > 0n ? Number((s.totalTokensClaimed * 10000n) / s.cap) / 100 : 0
  return (
    <div className="detail-grid">
      <section className="detail-section">
        <span className="detail-section-title">Hook</span>
        <div className="detail-value"><HashLink hash={hook} /></div>
      </section>
      <section className="detail-section">
        <span className="detail-section-title">Sold</span>
        <div className="detail-value">{fmtTokens(s.totalTokensClaimed)} / {fmtTokens(s.cap)} ({soldPct}%)</div>
      </section>
      <section className="detail-section">
        <span className="detail-section-title">Raised</span>
        <div className="detail-value">{fmtUsdc(s.totalUsdcRaised)} USDC</div>
      </section>
      <section className="detail-section">
        <span className="detail-section-title">Hook fee</span>
        <div className="detail-value">{s.feeBps / 100}%</div>
      </section>
    </div>
  )
}

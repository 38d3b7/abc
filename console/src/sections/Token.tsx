import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { usePublicClient, useWatchBlockNumber } from 'wagmi'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { listCampaigns, readCampaign, type CampaignState } from '../lib/lge'
import { fmtTokens, fmtUsdc, fmtBlocks } from '../lib/format'
import { Table } from '../components/Table'
import { Button } from '../components/Button'
import { Chip } from '../components/Chip'
import { HashLink } from '../components/HashLink'
import { LaunchWizard } from './token/LaunchWizard'
import { CampaignDetail } from './token/CampaignDetail'

/** Shared campaign query, refreshed each new block (~0.5s on Arc). */
export function useCampaign (hook: `0x${string}`) {
  const client = usePublicClient()
  const [block, setBlock] = useState<bigint | undefined>(undefined)
  useWatchBlockNumber({ onBlockNumber: setBlock })
  return useQuery({
    queryKey: ['campaign', hook, block?.toString() ?? '0'],
    queryFn: () => readCampaign(client!, hook),
    enabled: Boolean(client),
    // The block in the key makes a new query every ~0.5s; without previous
    // data as placeholder, `data` flips undefined each block and every
    // component below unmounts (wiping local state mid-deposit).
    placeholderData: keepPreviousData
  })
}

export function campaignChip (s: CampaignState) {
  if (s.isLgeSuccessful) return <Chip tone="ok">LGE successful</Chip>
  if (s.isLgeFinished) return <Chip tone="warn">LGE failed</Chip>
  return <Chip tone="acc">Live</Chip>
}

export function Token () {
  const { hookAddress } = useParams()
  const client = usePublicClient()
  const [wizardOpen, setWizardOpen] = useState(false)
  const navigate = useNavigate()

  const campaigns = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => listCampaigns(client!),
    enabled: Boolean(client)
  })

  if (hookAddress) {
    return <CampaignDetail hook={hookAddress as `0x${string}`} />
  }

  return (
    <>
      <div className="page-head">
        <h1>Token</h1>
        <span className="sub">Liquidity Generation Events on this console's manager. A token URL is public and doubles as the participant deposit page.</span>
        <div style={{ flex: 1 }} />
        <Button variant="primary" onClick={() => setWizardOpen(true)}>New launch</Button>
      </div>

      {wizardOpen ? (
        <LaunchWizard
          onClose={() => setWizardOpen(false)}
          onLaunched={(hook) => { setWizardOpen(false); void campaigns.refetch(); navigate(`/token/${hook}`) }}
        />
      ) : null}

      <Table
        columns={[
          {
            head: 'Token',
            cell: r => <TokenNameCell hook={r.hook} fallback={r.token} />
          },
          { head: 'Hook', cell: r => <HashLink hash={r.hook} /> },
          { head: 'State', cell: r => <CampaignStateCell hook={r.hook} /> },
          { head: 'Window', cell: r => <WindowCell hook={r.hook} /> }
        ]}
        rows={campaigns.data ?? []}
        keyOf={r => r.hook}
        detail={r => <CampaignPreview hook={r.hook} />}
        empty={campaigns.isLoading ? 'Loading…' : 'No launches yet. New launch starts one.'}
      />
      <p className="muted small mt8">Expand a row for figures; follow the token link for the campaign page.</p>
    </>
  )
}

function TokenNameCell ({ hook, fallback }: { hook: `0x${string}`; fallback: string }) {
  const c = useCampaign(hook)
  if (!c.data) return <HashLink hash={fallback} />
  return (
    <Link to={`/token/${hook}`}>
      {c.data.tokenName} <span className="muted mono">${c.data.tokenSymbol}</span>
    </Link>
  )
}

function CampaignStateCell ({ hook }: { hook: `0x${string}` }) {
  const c = useCampaign(hook)
  if (!c.data) return <span className="muted">…</span>
  return campaignChip(c.data)
}

function WindowCell ({ hook }: { hook: `0x${string}` }) {
  const c = useCampaign(hook)
  if (!c.data) return null
  return <span className="mono">{fmtBlocks(c.data.streamBlocks)}</span>
}

function CampaignPreview ({ hook }: { hook: `0x${string}` }) {
  const c = useCampaign(hook)
  if (!c.data) return null
  const s = c.data
  const soldPct = s.cap > 0n ? Number((s.totalTokensClaimed * 10000n) / s.cap) / 100 : 0
  return (
    <>
      <div>
        <span className="label">Sold</span>
        <div className="mono">{fmtTokens(s.totalTokensClaimed)} / {fmtTokens(s.cap)} ({soldPct}%)</div>
      </div>
      <div>
        <span className="label">Raised</span>
        <div className="mono">{fmtUsdc(s.totalUsdcRaised)} USDC</div>
      </div>
      <div>
        <span className="label">Hook fee</span>
        <div className="mono">{s.feeBps / 100}%</div>
      </div>
    </>
  )
}

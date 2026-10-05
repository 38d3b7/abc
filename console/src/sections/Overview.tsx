import { useQuery } from '@tanstack/react-query'
import { useBalance } from 'wagmi'
import { api } from '../api/client'
import { useAgent } from '../App'
import { fmtUsdc, fmtUsdcFull } from '../lib/format'
import { StatStrip } from '../components/StatStrip'
import { Table } from '../components/Table'
import { Chip, stateTone } from '../components/Chip'
import { HashLink } from '../components/HashLink'
import { ProgressBar } from '../components/ProgressBar'
import { PageShell, PageStatus } from '../components/PageShell'
import { executorUnreachableMessage } from '../lib/executorError'
import { useCampaign, campaignChip } from './Token'

function TokenStatus ({ hook }: { hook: `0x${string}` }) {
  const c = useCampaign(hook)
  if (!c.data) return null
  return campaignChip(c.data)
}

function parseBalance (json: string | undefined): bigint {
  if (!json) return 0n
  try {
    const p = JSON.parse(json) as { usdc6: string; residualWei: string }
    return BigInt(p.usdc6) * 1_000_000_000_000n + BigInt(p.residualWei)
  } catch { return 0n }
}

/** Overview: one balance, meter buckets against caps, gas reserve, last five intents. */
export function Overview () {
  const agent = useAgent()
  const a = agent.data

  const balance = useBalance({
    address: (a?.walletAddress ?? undefined) as `0x${string}` | undefined,
    query: { enabled: Boolean(a?.walletAddress) }
  })
  const ledger = useQuery({
    queryKey: ['ledger', a?.id],
    queryFn: () => api.getLedger(a!.id),
    enabled: Boolean(a),
    retry: false
  })
  const intents = useQuery({
    queryKey: ['intents', a?.id],
    queryFn: () => api.listIntents(a!.id),
    enabled: Boolean(a),
    retry: false
  })

  if (agent.isError) {
    return (
      <PageStatus
        title="Overview"
        message={executorUnreachableMessage(agent.error)}
      />
    )
  }
  if (!a) {
    return (
      <PageStatus
        title="Overview"
        message={agent.isLoading ? 'Loading…' : 'No agent registered yet.'}
      />
    )
  }

  const buckets = (['gas', 'inference', 'trading'] as const).map(b => ({
    bucket: b,
    used: parseBalance(ledger.data?.[b])
  }))
  const caps: Record<string, bigint | undefined> = {
    gas: a.policy.maxPerTxUsdc6 !== undefined ? BigInt(a.policy.maxPerTxUsdc6) * 10n ** 12n * 100n : undefined,
    inference: undefined,
    trading: undefined
  }

  const intentRows = (intents.data ?? []).slice(0, 5)

  return (
    <PageShell
      title="Overview"
      lead={`${a.name} — balances, meter buckets, and the five most recent intents.`}
      titleAside={a.policy.paused ? <Chip tone="bad">Paused</Chip> : <Chip tone="ok">Active</Chip>}
    >
      <div className="content-stack">
        <StatStrip stats={[
          {
            label: 'Agent USDC balance',
            value: balance.data ? `${fmtUsdc(balance.data.value)} USDC` : (a.walletAddress ? '…' : 'wallet not provisioned'),
          },
          {
            label: 'Token',
            value: a.tokenAddress
              ? <span className="inline-flex items-center gap-2"><HashLink hash={a.tokenAddress} />{a.hookAddress ? <TokenStatus hook={a.hookAddress as `0x${string}`} /> : null}</span>
              : 'not launched',
            small: true
          },
          { label: 'Hook', value: a.hookAddress ? <HashLink hash={a.hookAddress} /> : '—', small: true },
          { label: 'Policy', value: a.policy.paused ? 'paused' : 'active', small: true }
        ]} />

        <div className="panel">
          <div className="panel-head"><h2>Meter buckets</h2><span className="muted small">Cumulative ledger position per bucket</span></div>
          <div className="panel-body">
            {buckets.map(({ bucket, used }) => (
              <div key={bucket} className="form-row" style={{ gridTemplateColumns: '120px 1fr 160px' }}>
                <span className="label">{bucket}</span>
                <ProgressBar frac={caps[bucket] ? Number(used) / Number(caps[bucket]) : 0} />
                <span className="mono right" title={fmtUsdcFull(used)}>{fmtUsdc(used)} USDC</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Last five intents</h2>
            <span className="record-count">{intentRows.length} shown</span>
          </div>
          <div className="panel-body flush">
            <Table
              columns={[
                { head: 'Time', role: 'mono', cell: r => r.createdAt.slice(11, 19) },
                { head: 'Type', role: 'mono', cell: r => r.type },
                { head: 'State', cell: r => <Chip tone={stateTone(r.state)}>{r.state}</Chip> },
                { head: 'Tx', role: 'mono', cell: r => r.txHash ? <HashLink hash={r.txHash} kind="tx" /> : <span className="muted">—</span> }
              ]}
              rows={intentRows}
              keyOf={r => r.id}
              empty={intents.isLoading ? 'Loading…' : 'No intents yet.'}
            />
          </div>
        </div>
      </div>
    </PageShell>
  )
}

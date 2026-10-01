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
      <>
        <div className="page-head"><h1>Overview</h1></div>
        <p className="muted">Executor unreachable at {(agent.error as Error).message.includes('fetch') ? 'its API address' : ''}. Start the executor and set VITE_EXECUTOR_URL / VITE_ABC_API_KEY.</p>
      </>
    )
  }
  if (!a) {
    return (
      <>
        <div className="page-head"><h1>Overview</h1></div>
        <p className="muted">{agent.isLoading ? 'Loading…' : 'No agent registered yet.'}</p>
      </>
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

  return (
    <>
      <div className="page-head">
        <h1>Overview</h1>
        <span className="sub">{a.name} — operating record</span>
      </div>

      <StatStrip stats={[
        {
          label: 'Agent USDC balance',
          value: balance.data ? `${fmtUsdc(balance.data.value)} USDC` : (a.walletAddress ? '…' : 'wallet not provisioned'),
        },
        { label: 'Token', value: a.tokenAddress ? <HashLink hash={a.tokenAddress} /> : 'not launched', small: true },
        { label: 'Hook', value: a.hookAddress ? <HashLink hash={a.hookAddress} /> : '—', small: true },
        { label: 'Policy', value: a.policy.paused ? 'paused' : 'active', small: true }
      ]} />

      <div className="panel mt16">
        <div className="panel-head"><h2>Meter buckets</h2><span className="muted small">cumulative ledger position per bucket</span></div>
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

      <div className="panel mt16">
        <div className="panel-head"><h2>Last five intents</h2></div>
        <div className="panel-body flush">
          <Table
            columns={[
              { head: 'Time', cell: r => <span className="mono">{r.createdAt.slice(11, 19)}</span> },
              { head: 'Type', cell: r => <span className="mono">{r.type}</span> },
              { head: 'State', cell: r => <Chip tone={stateTone(r.state)}>{r.state}</Chip> },
              { head: 'Tx', cell: r => r.txHash ? <HashLink hash={r.txHash} kind="tx" /> : <span className="muted">—</span> }
            ]}
            rows={(intents.data ?? []).slice(0, 5)}
            keyOf={r => r.id}
            empty={intents.isLoading ? 'Loading…' : 'No intents yet.'}
          />
        </div>
      </div>
    </>
  )
}

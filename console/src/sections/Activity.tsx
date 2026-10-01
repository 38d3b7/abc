import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type Intent, type InferencePayment } from '../api/client'
import { useAgent } from '../App'
import { Table } from '../components/Table'
import { Chip, stateTone } from '../components/Chip'
import { HashLink } from '../components/HashLink'
import { KeyValue } from '../components/KeyValue'
import { fmtTime } from '../lib/format'

const PAGE_SIZE = 25

/** One-line amount summary per intent type (params differ by type). */
function amountOf (i: Intent): string {
  const p = i.params as Record<string, string | undefined>
  switch (i.type) {
    case 'transfer':
      return p.amountWei ? `${(Number(p.amountWei) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 6 })} USDC` : '—'
    case 'lge_deposit':
      return p.amount ? `${(Number(p.amount) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 4 })} tokens` : '—'
    case 'swap':
      return p.amountIn ? `${(Number(p.amountIn) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 6 })} USDC` : '—'
    case 'fund_gas':
    case 'draw_inference':
      return p.amountWei ? `${(Number(p.amountWei) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 6 })} USDC` : '—'
    default:
      return '—'
  }
}

function counterpartyOf (i: Intent): string | null {
  const p = i.params as Record<string, string | undefined>
  return p.to ?? p.hook ?? p.recipient ?? null
}

const STATE_FILTERS = [
  { value: 'all', label: 'All states' },
  { value: 'FINAL', label: 'Final' },
  { value: 'AWAITING_CONFIRMATION', label: 'Awaiting confirmation' },
  { value: 'in-flight', label: 'In flight' },
  { value: 'FAILED', label: 'Failed / rejected' }
] as const

function matchesStateFilter (state: string, filter: string): boolean {
  if (filter === 'all') return true
  if (filter === 'in-flight') {
    return !['FINAL', 'AWAITING_CONFIRMATION', 'DROPPED', 'REVERTED', 'REJECTED', 'FAILED'].includes(state)
  }
  if (filter === 'FAILED') {
    return state === 'FAILED' || state === 'REJECTED' || state === 'REVERTED'
  }
  return state === filter
}

/** Activity: the intent ledger. Every state transition, tx hash, rationale. */
export function Activity () {
  const agent = useAgent()
  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState<string>('all')

  const intents = useQuery({
    queryKey: ['intents', agent.data?.id],
    queryFn: () => api.listIntents(agent.data!.id),
    enabled: Boolean(agent.data),
    retry: false
  })

  const inference = useQuery({
    queryKey: ['inference', agent.data?.id],
    queryFn: () => api.listInference(agent.data!.id),
    enabled: Boolean(agent.data),
    retry: false,
    refetchInterval: 15_000
  })

  const filtered = useMemo(() => {
    const list = intents.data ?? []
    const q = query.trim().toLowerCase()
    return list.filter(r => {
      if (!matchesStateFilter(r.state, stateFilter)) return false
      if (!q) return true
      const hay = [
        r.type,
        r.state,
        r.id,
        r.txHash ?? '',
        r.rationale ?? '',
        counterpartyOf(r) ?? ''
      ].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [intents.data, query, stateFilter])

  const recordLabel = intents.isLoading
    ? 'Loading…'
    : `${filtered.length} record${filtered.length === 1 ? '' : 's'}`

  return (
    <>
      <header className="page-head">
        <h1>Activity</h1>
        <p className="sub">The intent ledger. Expand a row for its state timeline and signed rationale.</p>
      </header>

      <div className="page-toolbar">
        <input
          type="search"
          className="mono-input"
          placeholder="Search type, state, hash…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search intents"
        />
        <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} aria-label="Filter by state">
          {STATE_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <span className="record-count">{recordLabel}</span>
      </div>

      <div className="table-section">
        <Table
          columns={[
            { head: 'Time', cell: r => <span className="mono">{fmtTime(Math.floor(new Date(r.createdAt).getTime() / 1000))}</span> },
            { head: 'Type', cell: r => <span className="mono">{r.type}</span> },
            { head: 'Amount', num: true, cell: r => <span className="mono">{amountOf(r)}</span> },
            { head: 'Counterparty', cell: r => { const c = counterpartyOf(r); return c ? <HashLink hash={c} /> : <span className="muted">—</span> } },
            { head: 'State', cell: r => <Chip tone={stateTone(r.state)}>{r.state}</Chip> },
            { head: 'Tx', cell: r => r.txHash ? <HashLink hash={r.txHash} kind="tx" /> : <span className="muted">—</span> },
            { head: 'Rationale', cell: r => <span className="small muted">{r.rationale ?? '—'}</span> }
          ]}
          rows={filtered}
          keyOf={r => r.id}
          pageSize={PAGE_SIZE}
          empty={intents.isLoading ? 'Loading…' : agent.isError ? 'Executor unreachable.' : 'No intents match this filter.'}
          detail={r => (
            <div className="detail-grid">
              <section className="detail-section">
                <span className="detail-section-title">State history</span>
                {r.stateHistory.length === 0 ? (
                  <span className="muted small">No transitions recorded.</span>
                ) : (
                  <table className="detail-history" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {r.stateHistory.map((h, i) => (
                        <tr key={i}>
                          <td className="mono">{h.at.slice(11, 19)}</td>
                          <td><Chip tone={stateTone(h.to)}>{h.to}</Chip></td>
                          <td className="small muted">{h.detail ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
              <section className="detail-section">
                <span className="detail-section-title">Rationale</span>
                <p className="detail-rationale">{r.rationale ?? '—'}</p>
              </section>
              <section className="detail-section">
                <span className="detail-section-title">Record</span>
                <KeyValue entries={[
                  ['Intent', r.id],
                  ['Wallet', r.walletAddress],
                  ['Rationale sig', r.rationaleSig ? `${r.rationaleSig.slice(0, 18)}…` : '—'],
                  ['Error', r.error ?? '—']
                ]} />
              </section>
            </div>
          )}
        />
      </div>

      <header className="page-head" style={{ marginTop: '2rem' }}>
        <h2>Inference payments</h2>
        <p className="sub">One row per model call, paid by the agent over the x402 Gateway rail from its own raise.</p>
      </header>
      <div className="table-section">
        <Table<InferencePayment>
          columns={[
            { head: 'Time', cell: r => <span className="mono">{fmtTime(Math.floor(new Date(r.createdAt).getTime() / 1000))}</span> },
            { head: 'Model', cell: r => <span className="mono">{r.model}</span> },
            { head: 'Price', num: true, cell: r => <span className="mono">${(Number(r.priceUsdc6) / 1e6).toFixed(4)}</span> },
            { head: 'Tokens', num: true, cell: r => <span className="mono">{r.tokensIn != null ? `${r.tokensIn}→${r.tokensOut ?? 0}` : '—'}</span> },
            { head: 'State', cell: r => <Chip tone={r.state === 'SETTLED' ? 'ok' : r.state === 'UNCERTAIN' ? 'warn' : 'bad'}>{r.state}</Chip> },
            { head: 'Nonce', cell: r => <span className="mono small muted">{r.eip3009Nonce.slice(0, 14)}…</span> },
            { head: 'Settlement', cell: r => r.settlementRef ? <HashLink hash={r.settlementRef} kind="tx" /> : <span className="muted">batched</span> }
          ]}
          rows={inference.data ?? []}
          keyOf={r => r.id}
          pageSize={PAGE_SIZE}
          empty={inference.isLoading ? 'Loading…' : 'No paid calls yet.'}
        />
      </div>
    </>
  )
}

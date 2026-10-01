import { useQuery } from '@tanstack/react-query'
import { api, type Intent } from '../api/client'
import { useAgent } from '../App'
import { Table } from '../components/Table'
import { Chip, stateTone } from '../components/Chip'
import { HashLink } from '../components/HashLink'
import { KeyValue } from '../components/KeyValue'
import { fmtTime } from '../lib/format'

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
      return p.amountWei ? `${(Number(p.amountWei) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 6 })} USDC` : '—'
    default:
      return '—'
  }
}

function counterpartyOf (i: Intent): string | null {
  const p = i.params as Record<string, string | undefined>
  return p.to ?? p.hook ?? p.recipient ?? null
}

/** Activity: the intent ledger. Every state transition, tx hash, rationale. */
export function Activity () {
  const agent = useAgent()
  const intents = useQuery({
    queryKey: ['intents', agent.data?.id],
    queryFn: () => api.listIntents(agent.data!.id),
    enabled: Boolean(agent.data),
    retry: false
  })

  return (
    <>
      <div className="page-head">
        <h1>Activity</h1>
        <span className="sub">The intent ledger. Expand a row for its state timeline and signed rationale.</span>
      </div>

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
        rows={intents.data ?? []}
        keyOf={r => r.id}
        empty={intents.isLoading ? 'Loading…' : agent.isError ? 'Executor unreachable.' : 'No intents yet.'}
        detail={r => (
          <>
            <div>
              <span className="label">State history</span>
              <div className="mt8">
                {r.stateHistory.length === 0 ? <span className="muted small">No transitions recorded.</span> : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {r.stateHistory.map((h, i) => (
                        <tr key={i}>
                          <td className="mono small" style={{ padding: '2px 12px 2px 0' }}>{h.at.slice(11, 19)}</td>
                          <td style={{ padding: '2px 12px 2px 0' }}><Chip tone={stateTone(h.to)}>{h.to}</Chip></td>
                          <td className="small muted">{h.detail ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <div>
              <span className="label">Record</span>
              <KeyValue entries={[
                ['Intent', r.id],
                ['Wallet', r.walletAddress],
                ['Rationale sig', r.rationaleSig ? `${r.rationaleSig.slice(0, 18)}…` : '—'],
                ['Error', r.error ?? '—']
              ]} />
            </div>
          </>
        )}
      />
    </>
  )
}

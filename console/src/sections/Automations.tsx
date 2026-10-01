import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Automation } from '../api/client'
import { useAgent } from '../App'
import { Table } from '../components/Table'
import { Chip } from '../components/Chip'
import { Button } from '../components/Button'
import { Drawer } from '../components/Drawer'
import { KeyValue } from '../components/KeyValue'
import { fmtTime } from '../lib/format'

function specSummary (a: Automation): string {
  switch (a.kind) {
    case 'cron': return `every ${String(a.spec.intervalSeconds ?? '?')}s`
    case 'price': return `when price ${String(a.spec.op ?? '≥')} ${String(a.spec.value ?? '?')}`
    case 'fee_accrued': return `when fees ≥ ${String(a.spec.thresholdUsdc ?? '?')} USDC`
  }
}

/** Automations: armed/paused table; create is a form, not a wizard. */
export function Automations () {
  const agent = useAgent()
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const automations = useQuery({
    queryKey: ['automations', agent.data?.id],
    queryFn: () => api.listAutomations(agent.data!.id),
    enabled: Boolean(agent.data),
    retry: false
  })

  async function toggle (a: Automation) {
    setError(null)
    try {
      await api.setAutomationActive(a.id, !a.active)
      await qc.invalidateQueries({ queryKey: ['automations'] })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <>
      <header className="page-head">
        <h1>Automations</h1>
        <p className="sub">Standing instructions the worker fires and re-validates at fire time.</p>
      </header>

      <div className="page-toolbar">
        <span className="record-count">
          {automations.isLoading ? 'Loading…' : `${(automations.data ?? []).length} automation${(automations.data ?? []).length === 1 ? '' : 's'}`}
        </span>
        <span className="spacer" />
        <Button variant="primary" onClick={() => setCreateOpen(true)} disabled={!agent.data}>New automation</Button>
      </div>

      {error ? <p className="small" style={{ color: 'var(--bad-ink)' }}>{error}</p> : null}

      <div className="table-section">
      <Table
        columns={[
          { head: 'Created', cell: r => <span className="mono">{fmtTime(Math.floor(new Date(r.createdAt).getTime() / 1000))}</span> },
          { head: 'Kind', cell: r => <span className="mono">{r.kind}</span> },
          { head: 'Cadence / trigger', cell: r => <span className="small">{specSummary(r)}</span> },
          { head: 'Intent', cell: r => <span className="mono">{String((r.intentTemplate as { type?: string }).type ?? '—')}</span> },
          { head: 'Last fired', cell: r => r.lastFiredAt ? <span className="mono">{fmtTime(Math.floor(new Date(r.lastFiredAt).getTime() / 1000))}</span> : <span className="muted">never</span> },
          { head: 'State', cell: r => r.active ? <Chip tone="ok">Armed</Chip> : <Chip tone="warn">Paused</Chip> },
          { head: '', cell: r => <Button onClick={() => void toggle(r)}>{r.active ? 'Pause' : 'Resume'}</Button> }
        ]}
        rows={automations.data ?? []}
        keyOf={r => r.id}
        empty={automations.isLoading ? 'Loading…' : agent.isError ? 'Executor unreachable.' : 'No automations.'}
        detail={r => (
          <section className="detail-section">
            <span className="detail-section-title">Intent template</span>
            <KeyValue entries={Object.entries((r.intentTemplate as { params?: Record<string, unknown> }).params ?? {}).map(([k, v]) => [k, String(v)])} />
          </section>
        )}
      />
      </div>

      {createOpen && agent.data ? (
        <CreateAutomation agentId={agent.data.id} onClose={() => setCreateOpen(false)} />
      ) : null}
    </>
  )
}

function CreateAutomation ({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [kind, setKind] = useState<Automation['kind']>('cron')
  const [intervalSeconds, setIntervalSeconds] = useState('3600')
  const [thresholdUsdc, setThresholdUsdc] = useState('25')
  const [intentType, setIntentType] = useState('claim_fees')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit () {
    setBusy(true)
    setError(null)
    try {
      const spec = kind === 'cron'
        ? { intervalSeconds: Number(intervalSeconds) }
        : kind === 'fee_accrued'
          ? { thresholdUsdc: Number(thresholdUsdc) }
          : { op: '>=', value: 0 }
      await api.createAutomation(agentId, kind, spec, { type: intentType, params: {} })
      await qc.invalidateQueries({ queryKey: ['automations'] })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer title="New automation" onClose={onClose}>
      <div className="form-row"><span className="label">Trigger</span>
        <select value={kind} onChange={e => setKind(e.target.value as Automation['kind'])}>
          <option value="cron">Cron (interval)</option>
          <option value="fee_accrued">Fees accrued above threshold</option>
        </select>
      </div>
      {kind === 'cron' ? (
        <div className="form-row"><span className="label">Interval (seconds)</span>
          <input type="number" value={intervalSeconds} onChange={e => setIntervalSeconds(e.target.value)} min="60" /></div>
      ) : null}
      {kind === 'fee_accrued' ? (
        <div className="form-row"><span className="label">Threshold (USDC)</span>
          <input type="number" value={thresholdUsdc} onChange={e => setThresholdUsdc(e.target.value)} min="1" /></div>
      ) : null}
      <div className="form-row"><span className="label">Intent to fire</span>
        <select value={intentType} onChange={e => setIntentType(e.target.value)}>
          <option value="claim_fees">claim_fees</option>
          <option value="get_balances">get_balances</option>
          <option value="fund_gas">fund_gas</option>
        </select>
      </div>
      <div className="panel-body">
        {error ? <p className="small" style={{ color: 'var(--bad-ink)' }}>{error}</p> : null}
        <Button variant="primary" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </Drawer>
  )
}

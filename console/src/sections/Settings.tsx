import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAgent } from '../App'
import { Button } from '../components/Button'
import { Chip } from '../components/Chip'
import { HashLink } from '../components/HashLink'
import { PageShell, PageStatus } from '../components/PageShell'

/**
 * Settings: policy as a document. Each field shows its current value;
 * changes go through the owner's session (the console's API key).
 */
export function Settings () {
  const agent = useAgent()
  const qc = useQueryClient()
  const a = agent.data

  const [maxPerTx, setMaxPerTx] = useState('')
  const [confirmAbove, setConfirmAbove] = useState('')
  const [allowlist, setAllowlist] = useState('')
  const [paused, setPaused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!a) return
    setMaxPerTx(a.policy.maxPerTxUsdc6 !== undefined ? String(a.policy.maxPerTxUsdc6 / 1e6) : '')
    setConfirmAbove(a.policy.confirmAboveUsdc6 !== undefined ? String(a.policy.confirmAboveUsdc6 / 1e6) : '')
    setAllowlist((a.policy.recipientAllowlist ?? []).join('\n'))
    setPaused(Boolean(a.policy.paused))
  }, [a?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (agent.isError) {
    return (
      <PageStatus
        title="Settings"
        message="Executor unreachable. Policy lives in the executor; start it to view or change limits."
      />
    )
  }
  if (!a) return <PageStatus title="Settings" message="Loading…" />

  async function save () {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const policy = {
        ...(maxPerTx !== '' ? { maxPerTxUsdc6: Math.round(Number(maxPerTx) * 1e6) } : {}),
        ...(confirmAbove !== '' ? { confirmAboveUsdc6: Math.round(Number(confirmAbove) * 1e6) } : {}),
        recipientAllowlist: allowlist.split('\n').map(s => s.trim()).filter(s => s.startsWith('0x')),
        paused
      }
      await api.updateAgentPolicy(a!.id, policy)
      await qc.invalidateQueries({ queryKey: ['agent'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageShell
      title="Settings"
      lead="Policy the pipeline enforces before any signature. Change history is in Activity."
      titleAside={a.policy.paused ? <Chip tone="bad">Paused</Chip> : <Chip tone="ok">Active</Chip>}
    >
      <div className="content-stack">
        <div className="panel">
          <div className="panel-head"><h2>Limits</h2></div>
          <div className="form-row">
            <span className="label">Per-transaction limit (USDC)</span>
            <input type="number" value={maxPerTx} onChange={e => setMaxPerTx(e.target.value)} min="0" />
          </div>
          <div className="form-row">
            <span className="label">Confirmation required above (USDC)</span>
            <input type="number" value={confirmAbove} onChange={e => setConfirmAbove(e.target.value)} min="0" />
          </div>
          <div className="form-row">
            <span className="label">Recipient allowlist (one address per line; empty = any)</span>
            <textarea rows={4} value={allowlist} onChange={e => setAllowlist(e.target.value)} placeholder="0x…" />
          </div>
          <div className="form-row">
            <span className="label">Pause all intents</span>
            <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={paused} onChange={e => setPaused(e.target.checked)} style={{ width: 'auto' }} />
              {paused ? 'Paused — every intent is refused at POLICY_PASSED' : 'Not paused'}
            </label>
          </div>
          <div className="panel-body">
            {error ? <p className="small" style={{ color: 'var(--bad-ink)' }}>{error}</p> : null}
            <Button variant="primary" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : saved ? 'Saved' : 'Save policy'}
            </Button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Identity</h2></div>
          <div className="form-row"><span className="label">Agent</span><span className="mono small">{a.id}</span></div>
          <div className="form-row">
            <span className="label">Wallet</span>
            <span className="mono small">
              {a.walletAddress ? <HashLink hash={a.walletAddress} /> : 'provisioned on first intent'}
            </span>
          </div>
          <div className="form-row">
            <span className="label">Registered</span>
            <span className="mono small">{a.createdAt.slice(0, 19).replace('T', ' ')}Z</span>
          </div>
        </div>
      </div>
    </PageShell>
  )
}

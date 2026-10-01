import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type AgentMessage, type Intent } from '../api/client'
import { useAgent } from '../App'
import { Table } from '../components/Table'
import { Chip, stateTone, type Tone } from '../components/Chip'
import { Button } from '../components/Button'
import { fmtTime } from '../lib/format'

/** Message states to chip tones (CONSOLE.md palette: amber awaits, red fails). */
function messageTone (state: AgentMessage['state']): Tone {
  switch (state) {
    case 'done': return 'ok'
    case 'failed': return 'bad'
    default: return 'warn'
  }
}

/** Chat: the operator's instruction channel. Instructions are plain rows;
 *  agent replies are ledger records — reply text, linked intent chips with
 *  live states, and an explicit pending/done/failed state. No bubbles. */
export function Chat () {
  const agent = useAgent()
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const messages = useQuery({
    queryKey: ['messages', agent.data?.id],
    queryFn: () => api.listMessages(agent.data!.id),
    enabled: Boolean(agent.data),
    retry: false,
    refetchInterval: 3000
  })

  // intent chips resolve against the same ledger Activity shows
  const intents = useQuery({
    queryKey: ['intents', agent.data?.id],
    queryFn: () => api.listIntents(agent.data!.id),
    enabled: Boolean(agent.data),
    retry: false,
    refetchInterval: 5000
  })
  const intentById = new Map<string, Intent>((intents.data ?? []).map(i => [i.id, i]))

  async function send (e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !agent.data || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.sendMessage(agent.data.id, text)
      setDraft('')
      await qc.invalidateQueries({ queryKey: ['messages', agent.data.id] })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="page-head">
        <h1>Chat</h1>
        <p className="sub">Instructions to the agent. Each reply is a ledger record: the text, the intents it produced, and its state.</p>
      </header>

      <form className="chat-composer" onSubmit={e => void send(e)}>
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Instruct the agent — e.g. prepare the token launch, or report balances"
          disabled={!agent.data || busy}
        />
        <Button variant="primary" type="submit" disabled={!agent.data || busy || !draft.trim()}>
          {busy ? 'Sending…' : 'Send instruction'}
        </Button>
      </form>
      {error ? <p className="small" style={{ color: 'var(--bad-ink)' }}>{error}</p> : null}

      <div className="table-section">
        <Table
          columns={[
            { head: 'Time', cell: m => <span className="mono">{fmtTime(Math.floor(new Date(m.createdAt).getTime() / 1000))}</span> },
            { head: 'From', cell: m => <span className="mono">{m.role === 'operator' ? 'Operator' : 'Agent'}</span> },
            {
              head: 'Record',
              cell: m => m.state === 'failed'
                ? <span className="small" style={{ color: 'var(--bad-ink)' }}>{m.error ?? 'failed'}</span>
                : <span className="small">{m.text || <span className="muted">—</span>}</span>
            },
            {
              head: 'Intents',
              cell: m => m.intentIds.length === 0
                ? <span className="muted">—</span>
                : (
                  <span className="intent-chips">
                    {m.intentIds.map(id => {
                      const intent = intentById.get(id)
                      return intent
                        ? <Link key={id} to="/activity" className="chip-link"><Chip tone={stateTone(intent.state)}>{intent.type} · {intent.state}</Chip></Link>
                        : <Chip key={id} tone="plain">{id.slice(0, 8)}…</Chip>
                    })}
                  </span>
                  )
            },
            {
              head: 'State',
              cell: m => m.role === 'operator'
                ? <span className="muted small">recorded</span>
                : <Chip tone={messageTone(m.state)}>{m.state}</Chip>
            }
          ]}
          rows={messages.data ?? []}
          keyOf={m => m.id}
          empty={messages.isLoading ? 'Loading…' : agent.isError ? 'Executor unreachable.' : 'No instructions yet.'}
        />
      </div>
    </>
  )
}

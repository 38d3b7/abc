import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type AgentMessage, type Intent } from '../api/client'
import { useAgent } from '../App'
import { Table } from '../components/Table'
import { Chip, stateTone, type Tone } from '../components/Chip'
import { Button } from '../components/Button'
import { fmtTime } from '../lib/format'
import { PageShell } from '../components/PageShell'

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

  const intents = useQuery({
    queryKey: ['intents', agent.data?.id],
    queryFn: () => api.listIntents(agent.data!.id),
    enabled: Boolean(agent.data),
    retry: false,
    refetchInterval: 5000
  })
  const intentById = new Map<string, Intent>((intents.data ?? []).map(i => [i.id, i]))

  // The agent's published site record (null until its first app_publish).
  // Polls alongside intents so the toggle enables itself when a publish lands.
  const site = useQuery({
    queryKey: ['agent-app', agent.data?.id],
    queryFn: () => api.getApp(agent.data!.id),
    enabled: Boolean(agent.data),
    retry: false,
    refetchInterval: 5000
  })
  const [showSite, setShowSite] = useState(false)
  const publishedSite = site.data?.published ? site.data : null
  const siteUrl = publishedSite ? `https://${publishedSite.slug}.agenticbusinessconsole.com` : null
  // Done app intents bump this key, remounting the iframe — an agent edit
  // landing FINAL visibly reloads the pane. Reuses the intents poll; no new
  // endpoint or interval.
  const siteVersion = (intents.data ?? []).filter(i =>
    (i.type === 'app_publish' || i.type === 'app_edit') && i.state === 'FINAL').length

  const rows = messages.data ?? []

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

  const composer = (
    <>
      <form className="chat-composer page-toolbar--composer" onSubmit={e => void send(e)}>
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
    </>
  )

  const siteToggle = siteUrl
    ? <Button onClick={() => setShowSite(v => !v)}>{showSite ? 'Hide site' : 'View site'}</Button>
    : <Button disabled title="The agent has not published its site yet">Site not published</Button>

  const ledger = (
    <>
      <div className="page-toolbar">
        <span className="record-count">
          {messages.isLoading ? 'Loading…' : `${rows.length} record${rows.length === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className="table-section">
        <Table
          columns={[
            { head: 'Time', role: 'mono', cell: m => fmtTime(Math.floor(new Date(m.createdAt).getTime() / 1000)) },
            { head: 'From', role: 'muted', cell: m => (m.role === 'operator' ? 'Operator' : 'Agent') },
            {
              head: 'Record',
              role: 'primary',
              cell: m => m.state === 'failed'
                ? <span className="small" style={{ color: 'var(--bad-ink)' }}>{m.error ?? 'failed'}</span>
                : (m.text || <span className="muted">—</span>)
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
          rows={rows}
          keyOf={m => m.id}
          empty={messages.isLoading ? 'Loading…' : agent.isError ? 'Executor unreachable.' : 'No instructions yet.'}
        />
      </div>
    </>
  )

  return (
    <PageShell
      title="Chat"
      lead="Instructions to the agent. Each reply is a ledger record: text, linked intents, and state."
      toolbar={composer}
      titleAside={siteToggle}
    >
      {showSite && siteUrl && publishedSite
        ? (
          <div className="chat-split">
            <div className="chat-split-ledger">{ledger}</div>
            <aside className="site-pane">
              <div className="site-pane-head">
                <span className="small" style={{ fontFamily: 'var(--mono)' }}>{publishedSite.slug}.agenticbusinessconsole.com</span>
                <a href={siteUrl} target="_blank" rel="noopener noreferrer">Open ↗</a>
              </div>
              <iframe key={siteVersion} src={siteUrl} title={`${publishedSite.name} site`} />
            </aside>
          </div>
          )
        : ledger}
    </PageShell>
  )
}

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type AgentMessage, type Intent } from '../api/client'
import { useAgent } from '../App'
import { Table } from '../components/Table'
import { Chip, stateTone, type Tone } from '../components/Chip'
import { Button } from '../components/Button'
import { Select } from '../components/Select'
import { fmtTime } from '../lib/format'
import { PageShell } from '../components/PageShell'

const CHAT_MODELS = [
  { id: 'default', label: 'Agent default' }
] as const

/** Message states to chip tones (CONSOLE.md palette: amber awaits, red fails). */
function messageTone (state: AgentMessage['state']): Tone {
  switch (state) {
    case 'done': return 'ok'
    case 'failed': return 'bad'
    default: return 'warn'
  }
}

interface ChatPaneProps {
  rows: AgentMessage[]
  intentById: Map<string, Intent>
  loading: boolean
  empty: string
  draft: string
  setDraft: (v: string) => void
  model: string
  setModel: (v: string) => void
  busy: boolean
  error: string | null
  canSend: boolean
  onSend: (e: FormEvent) => void
}

/** Scrollable ledger + bottom docked composer (instruction channel, not bubbles). */
function ChatPane ({
  rows,
  intentById,
  loading,
  empty,
  draft,
  setDraft,
  model,
  setModel,
  busy,
  error,
  canSend,
  onSend
}: ChatPaneProps) {
  const transcriptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = transcriptRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [rows.length, loading])

  return (
    <div className="chat-pane">
      <div className="chat-transcript" ref={transcriptRef}>
        <div className="chat-transcript-meta">
          <span className="record-count">
            {loading ? 'Loading…' : `${rows.length} record${rows.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="table-section chat-transcript-table">
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
            empty={empty}
          />
        </div>
      </div>

      <form className="chat-composer-dock" onSubmit={onSend}>
        <button
          type="button"
          className="chat-composer-icon"
          aria-label="Add context"
          title="Add context (coming soon)"
          disabled
        >
          +
        </button>
        <Select
          className="chat-composer-model compact"
          aria-label="Model"
          value={model}
          onChange={e => setModel(e.target.value)}
          disabled={!canSend || busy}
        >
          {CHAT_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </Select>
        <textarea
          className="chat-composer-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Instruct the agent — e.g. prepare the token launch, or report balances"
          disabled={!canSend || busy}
          rows={1}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
        />
        <button
          type="submit"
          className="chat-composer-send"
          aria-label="Send instruction"
          disabled={!canSend || busy || !draft.trim()}
        >
          <span aria-hidden="true">↑</span>
        </button>
      </form>
      {error ? <p className="chat-composer-error">{error}</p> : null}
    </div>
  )
}

/** Chat: the operator's instruction channel. Instructions are plain rows;
 *  agent replies are ledger records — reply text, linked intent chips with
 *  live states, and an explicit pending/done/failed state. No bubbles. */
export function Chat () {
  const agent = useAgent()
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [model, setModel] = useState<string>(CHAT_MODELS[0].id)
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
  const siteVersion = (intents.data ?? []).filter(i =>
    (i.type === 'app_publish' || i.type === 'app_edit') && i.state === 'FINAL').length

  const rows = messages.data ?? []
  const canSend = Boolean(agent.data)

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

  const siteToggle = siteUrl
    ? <Button onClick={() => setShowSite(v => !v)}>{showSite ? 'Hide site' : 'View site'}</Button>
    : <Button disabled title="The agent has not published its site yet">Site not published</Button>

  const paneProps = {
    rows,
    intentById,
    loading: messages.isLoading,
    empty: messages.isLoading ? 'Loading…' : agent.isError ? 'Executor unreachable.' : 'No instructions yet.',
    draft,
    setDraft,
    model,
    setModel,
    busy,
    error,
    canSend,
    onSend: (e: FormEvent) => void send(e)
  }

  return (
    <PageShell
      className="page-frame--chat"
      title="Chat"
      lead="Instructions to the agent. Each reply is a ledger record: text, linked intents, and state."
      titleAside={siteToggle}
    >
      {showSite && siteUrl && publishedSite
        ? (
          <div className="chat-split">
            <div className="chat-split-ledger">
              <ChatPane {...paneProps} />
            </div>
            <aside className="site-pane">
              <div className="site-pane-head">
                <span className="small" style={{ fontFamily: 'var(--mono)' }}>{publishedSite.slug}.agenticbusinessconsole.com</span>
                <a href={siteUrl} target="_blank" rel="noopener noreferrer">Open ↗</a>
              </div>
              <iframe key={siteVersion} src={siteUrl} title={`${publishedSite.name} site`} />
            </aside>
          </div>
          )
        : <ChatPane {...paneProps} />}
    </PageShell>
  )
}

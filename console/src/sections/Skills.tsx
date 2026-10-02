import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type AgentSkill } from '../api/client'
import { useAgent } from '../App'
import { Table } from '../components/Table'
import { Chip } from '../components/Chip'
import { Button } from '../components/Button'
import { fmtTime } from '../lib/format'
import { PageShell } from '../components/PageShell'
import { InstallSkillDrawer } from '../components/InstallSkillDrawer'

/** Skills: the agent's installed skills as a table — slug, provider, kind,
 *  license, source, enabled state, added-at. Install is a form (registry
 *  pick or a URL); enable/disable are explicit actions. */
export function Skills () {
  const agent = useAgent()
  const qc = useQueryClient()
  const [installOpen, setInstallOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const skills = useQuery({
    queryKey: ['agent-skills', agent.data?.id],
    queryFn: () => api.listAgentSkills(agent.data!.id),
    enabled: Boolean(agent.data),
    retry: false
  })

  async function toggle (s: AgentSkill) {
    if (!agent.data) return
    setError(null)
    try {
      await api.setSkillEnabled(agent.data.id, s.slug, !s.enabled)
      await qc.invalidateQueries({ queryKey: ['agent-skills'] })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const rows = skills.data ?? []

  const toolbar = (
    <div className="page-toolbar">
      <span className="record-count">
        {skills.isLoading ? 'Loading…' : `${rows.length} installed`}
      </span>
      <span className="spacer" />
      <Button variant="primary" onClick={() => setInstallOpen(true)} disabled={!agent.data}>Install skill</Button>
    </div>
  )

  return (
    <PageShell
      title="Skills"
      lead="Knowledge and capabilities installed on the agent. Enabled skills load into every turn."
      toolbar={toolbar}
    >
      {error ? <p className="small" style={{ color: 'var(--bad-ink)' }}>{error}</p> : null}

      <div className="table-section">
        <Table
          columns={[
            { head: 'Added', role: 'mono', cell: s => fmtTime(Math.floor(new Date(s.addedAt).getTime() / 1000)) },
            { head: 'Slug', role: 'primary', cell: s => s.slug },
            { head: 'Provider', role: 'muted', cell: s => s.provider },
            { head: 'Kind', cell: s => <Chip tone={s.kind === 'capability' ? 'acc' : 'plain'}>{s.kind}</Chip> },
            { head: 'License', role: 'mono', cell: s => s.licenseSpdx },
            {
              head: 'Source',
              role: 'muted',
              cell: s => (
                <a className="hashlink" href={s.sourceUrl} target="_blank" rel="noreferrer">
                  {s.referenceOnly ? 'upstream (reference-only)' : 'vendored'}
                </a>
              )
            },
            {
              head: 'Intents it can raise',
              role: 'mono',
              cell: s => s.kind === 'capability' && s.tools.length > 0
                ? s.tools.join(', ')
                : <span className="muted">—</span>
            },
            { head: 'State', cell: s => s.enabled ? <Chip tone="ok">Enabled</Chip> : <Chip tone="warn">Disabled</Chip> },
            { head: '', cell: s => <Button onClick={() => void toggle(s)}>{s.enabled ? 'Disable' : 'Enable'}</Button> }
          ]}
          rows={rows}
          keyOf={s => s.slug}
          empty={skills.isLoading ? 'Loading…' : agent.isError ? 'Executor unreachable.' : 'No skills installed. The agent runs on the base intent set until you install some.'}
        />
      </div>

      {installOpen && agent.data ? (
        <InstallSkillDrawer agentId={agent.data.id} onClose={() => setInstallOpen(false)} />
      ) : null}
    </PageShell>
  )
}

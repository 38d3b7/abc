import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type AgentSkill } from '../api/client'
import { useAgent } from '../App'
import { Table } from '../components/Table'
import { Chip } from '../components/Chip'
import { Button } from '../components/Button'
import { Drawer } from '../components/Drawer'
import { fmtTime } from '../lib/format'
import { Select } from '../components/Select'
import { PageShell } from '../components/PageShell'

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
        <InstallSkill agentId={agent.data.id} onClose={() => setInstallOpen(false)} />
      ) : null}
    </PageShell>
  )
}

const LICENSE_OPTIONS = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC0-1.0', 'NOASSERTION (no license — reference-only)']

function InstallSkill ({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [url, setUrl] = useState('')
  const [provider, setProvider] = useState('')
  const [license, setLicense] = useState(LICENSE_OPTIONS[0]!)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const catalog = useQuery({
    queryKey: ['skill-catalog'],
    queryFn: () => api.listSkillCatalog(),
    retry: false
  })
  const installed = useQuery({
    queryKey: ['agent-skills', agentId],
    queryFn: () => api.listAgentSkills(agentId),
    retry: false
  })
  const installedSlugs = new Set((installed.data ?? []).map(s => s.slug))

  async function refresh () {
    await qc.invalidateQueries({ queryKey: ['agent-skills'] })
    await qc.invalidateQueries({ queryKey: ['skill-catalog'] })
  }

  async function installFromRegistry (slug: string) {
    setBusy(true)
    setError(null)
    try {
      await api.installSkill(agentId, slug)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function installFromUrl () {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const spdx = license.startsWith('NOASSERTION') ? 'NOASSERTION' : license
      const res = await api.installSkillFromUrl(agentId, url.trim(), spdx, provider.trim())
      setNotice(res.vendored
        ? `Installed ${res.skill.slug}: content vendored with provenance.`
        : `Installed ${res.skill.slug}: reference-only — content stays upstream and is fetched live.`)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer title="Install skill" onClose={onClose}>
      <section className="detail-section">
        <span className="detail-section-title">From the registry</span>
        <Table
          columns={[
            { head: 'Slug', role: 'primary', cell: s => s.slug },
            { head: 'Kind', role: 'muted', cell: s => s.kind },
            { head: 'License', role: 'mono', cell: s => s.licenseSpdx },
            {
              head: '',
              cell: s => installedSlugs.has(s.slug)
                ? <span className="muted small">installed</span>
                : <Button onClick={() => void installFromRegistry(s.slug)} disabled={busy}>Install</Button>
            }
          ]}
          rows={catalog.data ?? []}
          keyOf={s => s.slug}
          empty={catalog.isLoading ? 'Loading…' : 'Registry is empty.'}
        />
      </section>

      <section className="detail-section">
        <span className="detail-section-title">From a URL</span>
        <p className="small muted">
          A raw SKILL.md URL. The license is operator-asserted from the upstream repo's LICENSE — the import is
          refused if the content fails the security scan, and unlicensed content installs reference-only.
        </p>
        <div className="form-row"><span className="label">SKILL.md URL</span>
          <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://raw.githubusercontent.com/…/SKILL.md" /></div>
        <div className="form-row"><span className="label">Provider</span>
          <input type="text" value={provider} onChange={e => setProvider(e.target.value)} placeholder="e.g. Clawpump" /></div>
        <div className="form-row"><span className="label">License (SPDX)</span>
          <Select value={license} onChange={e => setLicense(e.target.value)}>
            {LICENSE_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </Select></div>
        <div className="panel-body">
          {error ? <p className="small" style={{ color: 'var(--bad-ink)' }}>{error}</p> : null}
          {notice ? <p className="small" style={{ color: 'var(--ok-ink)' }}>{notice}</p> : null}
          <Button variant="primary" disabled={busy || !url.trim() || !provider.trim()} onClick={() => void installFromUrl()}>
            {busy ? 'Importing…' : 'Import and install'}
          </Button>
        </div>
      </section>
    </Drawer>
  )
}

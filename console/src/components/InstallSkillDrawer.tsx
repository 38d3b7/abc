import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { Table } from './Table'
import { Button } from './Button'
import { Drawer } from './Drawer'
import { Select } from './Select'

const LICENSE_OPTIONS = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC0-1.0', 'NOASSERTION (no license — reference-only)']

export function InstallSkillDrawer ({ agentId, onClose }: { agentId: string; onClose: () => void }) {
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

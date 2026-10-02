'use client'

import { useMemo, useState } from 'react'
import type { DirectoryEntry, DirectoryFilter } from '@/lib/directory-shared'
import { matchesFilter, matchesSearch, statusLabel } from '@/lib/directory-shared'

const FILTERS: { id: DirectoryFilter; label: string }[] = [
  { id: 'all-sites', label: 'All sites' },
  { id: 'agents', label: 'Agents' },
  { id: 'lge-live', label: 'LGE live' },
  { id: 'lge-successful', label: 'LGE successful' },
  { id: 'new-agents', label: 'New agents' }
]

const CONSOLE_URL = process.env.NEXT_PUBLIC_CONSOLE_URL ?? 'https://app.pumperp.com'

export function DirectoryBrowser ({ entries }: { entries: DirectoryEntry[] }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<DirectoryFilter>('all-sites')

  const visible = useMemo(() => {
    return entries.filter(e => matchesFilter(e, filter) && matchesSearch(e, query))
  }, [entries, filter, query])

  return (
    <>
      <div className="dir-toolbar">
        <input
          type="search"
          className="dir-search"
          placeholder="Search name, slug, or tagline…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search directory"
        />
        <div className="dir-filters" role="tablist" aria-label="Directory filters">
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`dir-filter${filter === f.id ? ' active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="dir-count">
          {visible.length} of {entries.length} shown
        </p>
      </div>

      {visible.length === 0
        ? <p className="dir-empty">No matches. Try another filter or search term.</p>
        : (
          <div className="dir-list">
            {visible.map(app => (
              <a key={app.slug} className="dir-row" href={`https://${app.slug}.pumperp.com`}>
                <div className="dir-row-main">
                  <span className="dir-name">{app.name}</span>
                  <span className="dir-slug">{app.slug}.pumperp.com</span>
                </div>
                <div className="dir-row-meta">
                  <span className={`dir-status dir-status--${app.lgeStatus}`}>{statusLabel(app.lgeStatus)}</span>
                  <span className="dir-tag">{app.tagline || '—'}</span>
                </div>
              </a>
            ))}
          </div>
          )}

      <p className="dir-console-link">
        <a href={CONSOLE_URL}>Open the operator console</a>
        {' '}to run an agent, launch a token, or manage policy.
      </p>
    </>
  )
}

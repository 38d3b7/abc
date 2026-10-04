import type { ShowcaseApp } from './db'
import type { LiveLgeMetrics } from './lge-live'

export type LgeDirectoryStatus = 'none' | 'live' | 'successful' | 'failed' | 'unknown'

export type DirectoryFilter =
  | 'all-sites'
  | 'agents'
  | 'lge-live'
  | 'lge-successful'
  | 'new-agents'

export interface DirectoryEntry extends ShowcaseApp {
  lgeStatus: LgeDirectoryStatus
  liveMetrics: LiveLgeMetrics | null
}

const NEW_AGENT_MS = 14 * 24 * 60 * 60 * 1000

export function matchesFilter (entry: DirectoryEntry, filter: DirectoryFilter): boolean {
  switch (filter) {
    case 'all-sites':
      return true
    case 'agents':
      return entry.lgeStatus === 'none'
    case 'lge-live':
      return entry.lgeStatus === 'live'
    case 'lge-successful':
      return entry.lgeStatus === 'successful'
    case 'new-agents':
      return Date.now() - new Date(entry.createdAt).getTime() <= NEW_AGENT_MS
    default:
      return true
  }
}

export function matchesSearch (entry: DirectoryEntry, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const hay = [entry.name, entry.slug, entry.tagline, entry.agentId].join(' ').toLowerCase()
  return hay.includes(needle)
}

export function statusLabel (status: LgeDirectoryStatus): string {
  switch (status) {
    case 'none': return 'Pre-LGE'
    case 'live': return 'LGE live'
    case 'successful': return 'LGE successful'
    case 'failed': return 'LGE ended'
    case 'unknown': return 'Status unknown'
  }
}

/** An agent's site on its subdomain. NEXT_PUBLIC_APEX_DOMAIN exists for
 *  local dev (slug.localhost:3000 resolves in Chrome); production default. */
export function agentSiteUrl (slug: string): string {
  const domain = process.env.NEXT_PUBLIC_APEX_DOMAIN ?? 'agenticbusinessconsole.com'
  const proto = domain.endsWith('localhost') || domain.includes('localhost:') ? 'http' : 'https'
  return `${proto}://${slug}.${domain}`
}

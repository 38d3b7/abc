import type { ShowcaseApp } from './db'

export type LgeDirectoryStatus = 'none' | 'live' | 'successful' | 'failed' | 'unknown'

export type DirectoryFilter =
  | 'all-sites'
  | 'agents'
  | 'lge-live'
  | 'lge-successful'
  | 'new-agents'

export interface DirectoryEntry extends ShowcaseApp {
  lgeStatus: LgeDirectoryStatus
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

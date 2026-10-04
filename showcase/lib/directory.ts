import type { ShowcaseApp } from './db'
import { readHookLgeStatus } from './lge-status'
import { readLiveLgeMetrics } from './lge-live'
import type { DirectoryEntry, DirectoryFilter, LgeDirectoryStatus } from './directory-shared'

export type { DirectoryEntry, DirectoryFilter, LgeDirectoryStatus } from './directory-shared'
export { matchesFilter, matchesSearch, statusLabel } from './directory-shared'

export async function enrichDirectory (apps: ShowcaseApp[]): Promise<DirectoryEntry[]> {
  const withHooks = apps.filter(a => a.hookAddress)
  const statusByHook = new Map<string, LgeDirectoryStatus>()
  await Promise.all(withHooks.map(async (a) => {
    const st = await readHookLgeStatus(a.hookAddress!)
    statusByHook.set(a.hookAddress!.toLowerCase(), st)
  }))

  // Live LGEs get richer tile metrics; failures are non-fatal.
  const metricsByHook = new Map<string, NonNullable<DirectoryEntry['liveMetrics']>>()
  await Promise.all(withHooks.map(async (a) => {
    const st = statusByHook.get(a.hookAddress!.toLowerCase())
    if (st !== 'live') return
    const m = await readLiveLgeMetrics(a)
    if (m) metricsByHook.set(a.hookAddress!.toLowerCase(), m)
  }))

  return apps.map(app => ({
    ...app,
    lgeStatus: app.hookAddress
      ? (statusByHook.get(app.hookAddress.toLowerCase()) ?? 'unknown')
      : 'none',
    liveMetrics: app.hookAddress ? metricsByHook.get(app.hookAddress.toLowerCase()) ?? null : null
  }))
}

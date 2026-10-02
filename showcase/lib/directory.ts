import type { ShowcaseApp } from './db'
import { readHookLgeStatus } from './lge-status'
import type { DirectoryEntry, LgeDirectoryStatus } from './directory-shared'

export type { DirectoryEntry, DirectoryFilter, LgeDirectoryStatus } from './directory-shared'
export { matchesFilter, matchesSearch, statusLabel } from './directory-shared'

export async function enrichDirectory (apps: ShowcaseApp[]): Promise<DirectoryEntry[]> {
  const withHooks = apps.filter(a => a.hookAddress)
  const statusByHook = new Map<string, LgeDirectoryStatus>()
  await Promise.all(withHooks.map(async (a) => {
    const st = await readHookLgeStatus(a.hookAddress!)
    statusByHook.set(a.hookAddress!.toLowerCase(), st)
  }))
  return apps.map(app => ({
    ...app,
    lgeStatus: app.hookAddress
      ? (statusByHook.get(app.hookAddress.toLowerCase()) ?? 'unknown')
      : 'none'
  }))
}

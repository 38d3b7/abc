import { config } from '../config.js'
import type { AppRow } from '../db/store.js'

/**
 * Push an app record to the showcase app's write API. The showcase serves
 * <slug>.pumperp.com from its own store; the executor is the source of
 * truth and pushes on every publish/edit. Unset URL = local dev no-op.
 * Non-2xx throws so the intent DROPPEDs rather than drifting silently.
 */
export async function pushAppToShowcase (app: AppRow): Promise<void> {
  if (!config.appsPushUrl) return
  const res = await fetch(config.appsPushUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.appsPushKey}`
    },
    body: JSON.stringify(app)
  })
  if (!res.ok) throw new Error(`showcase push failed: ${res.status} ${await res.text()}`)
}

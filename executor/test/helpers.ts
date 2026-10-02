/**
 * Shared API-test app builder: MemoryStore + stub runner/signer/queue.
 * The runner stub only serves the quotes route's unpriceable path (422);
 * auth/ownership/limits never reach real pipeline work.
 */

import { createApp as build, type AppEnv } from '../src/api/server.js'
import type { Store } from '../src/db/store.js'
import type { Hono } from 'hono'

export function createApp (store: Store): Hono<AppEnv> {
  return build({
    store,
    runner: {
      quoteIntent: async () => ({ quote: null, intent: null })
    } as never,
    signer: {
      name: 'local_dev',
      ensureWallet: async () => ({ address: '0x00000000000000000000000000000000000000aa', providerRef: '' })
    } as never,
    enqueuePrompt: async () => {}
  })
}

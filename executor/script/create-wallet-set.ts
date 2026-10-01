/**
 * One-time operator provisioning: create the Circle wallet set that holds
 * all agent SCAs, print the id for CIRCLE_WALLET_SET_ID. Idempotent-ish —
 * re-running lists existing sets instead of creating a duplicate.
 *
 *   npx tsx script/create-wallet-set.ts
 *
 * Reads CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET from the environment (source
 * contracts/.env or export them).
 */

import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'

const apiKey = process.env.CIRCLE_API_KEY
const entitySecret = process.env.CIRCLE_ENTITY_SECRET
if (!apiKey || !entitySecret) {
  console.error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET required')
  process.exit(1)
}

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })

const existing = await client.listWalletSets()
const sets = existing.data?.walletSets ?? []
if (sets.length > 0) {
  console.log('existing wallet sets:')
  for (const s of sets) console.log(`  ${s.id}  ${s.name ?? ''}`)
} else {
  const res = await client.createWalletSet({ name: 'abc-agents' })
  const ws = res.data?.walletSet
  if (!ws?.id) {
    console.error('createWalletSet returned no id', JSON.stringify(res.data))
    process.exit(1)
  }
  console.log(`created wallet set: ${ws.id}  (${ws.name ?? 'abc-agents'})`)
}
const id = sets[0]?.id ?? (await client.listWalletSets()).data?.walletSets?.[0]?.id
console.log('\nSet in the executor environment:')
console.log(`  CIRCLE_WALLET_SET_ID=${id ?? '(see above)'}`)

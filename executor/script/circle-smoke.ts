/**
 * Circle adapter smoke test: provision one SCA on ARC-TESTNET in the
 * operator wallet set and print it. Does NOT send a transaction (the SCA
 * deploys on its first on-chain tx, gas managed by Circle).
 *
 *   npx tsx script/circle-smoke.ts
 */

import { CircleScaSigner } from '../src/signer/circle.js'

const { CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, CIRCLE_WALLET_SET_ID } = process.env
if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET || !CIRCLE_WALLET_SET_ID) {
  console.error('CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, CIRCLE_WALLET_SET_ID required')
  process.exit(1)
}

const signer = new CircleScaSigner(CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET, CIRCLE_WALLET_SET_ID)
const w = await signer.ensureWallet('smoke-test')
console.log(`SCA provisioned on ARC-TESTNET:`)
console.log(`  address:     ${w.address}`)
console.log(`  providerRef: ${w.providerRef}`)

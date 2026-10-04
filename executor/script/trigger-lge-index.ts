import { createPublicClient, http } from 'viem'
import { config, arcTestnet } from '../src/config.js'
import { PgStore } from '../src/db/pg.js'
import { indexLgeBoard } from '../src/worker/lgeBoard.js'

const store = new PgStore(config.databaseUrl)
const chain = createPublicClient({ chain: arcTestnet, transport: http() })
await indexLgeBoard(store, chain)
console.log('[trigger] lge board index done')
process.exit(0)

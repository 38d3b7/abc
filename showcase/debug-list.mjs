import { listOpenRaises } from './lib/lge.ts'
const raises = await listOpenRaises()
console.log('raises count', raises.length)
for (const r of raises) console.log(r.name, r.symbol, r.hook, 'slug', r.agentSlug, 'blocksLeft', r.blocksLeft)

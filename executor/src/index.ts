/** Executor entrypoint: API server + worker in one process for the demo. */
import { serveApi } from './api/server.js'
import { startWorker } from './worker/index.js'

const port = Number(process.env.PORT || 8787)

await serveApi(port)
if (process.env.ABC_WORKER !== 'off') {
  await startWorker()
}

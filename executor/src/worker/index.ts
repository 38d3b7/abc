/**
 * Worker: pg-boss on the same Postgres (no Redis). Jobs:
 *   agent-prompt          — run the agent loop for an agent with a prompt
 *   automation-tick       — scan active automations, enqueue those that are due
 *   automation-fire       — re-validate and fire a due automation
 *   keeper-claim-protocol — hourly permissionless claimProtocol sweep per hook
 *   index-deposits        — system emitter: poll Deposited events into the DB
 *
 * Runs only against the production PgStore (jobs are operational, not part of
 * the pipeline's testable core).
 */

import { PgBoss } from 'pg-boss'
import { createPublicClient, encodeFunctionData, http, parseAbi, type Address, type Log } from 'viem'
import { config, arcTestnet } from '../config.js'
import { PgStore } from '../db/pg.js'
import { PipelineRunner } from '../pipeline/runner.js'
import { createSigner, createKeeperSigner } from '../signer/index.js'
import { QuoteSigner } from '../quotes/sign.js'
import { runAgentLoop } from '../agent/loop.js'
import { isSent } from '../signer/types.js'
import { isDue } from './due.js'

export const QUEUES = {
  agentPrompt: 'agent-prompt',
  automationTick: 'automation-tick',
  automationFire: 'automation-fire',
  keeperClaimProtocol: 'keeper-claim-protocol',
  indexDeposits: 'index-deposits'
} as const

const HOOK_ABI = parseAbi([
  'function protocolAccrued() view returns (uint256)',
  'function participantFeesBooked() view returns (uint256)',
  'function claimProtocol()'
])

const DEPOSITED_EVENT = parseAbi([
  'event Deposited(address indexed user, uint256 amountOfTokens, uint256 amountOfUSDC, uint256 usdcContractBalance)'
])[0]

const MIN_SWEEP = 25n * 10n ** 18n

export async function startWorker (): Promise<void> {
  const store = new PgStore(config.databaseUrl)
  const quoteSigner = await QuoteSigner.create(config.quoteSecret || undefined)
  const chain = createPublicClient({ chain: arcTestnet, transport: http() })
  const runner = new PipelineRunner({
    store,
    signer: createSigner(),
    chain,
    quoteSigner,
    chainId: arcTestnet.id
  })

  const boss = new PgBoss(config.databaseUrl)
  await boss.start()

  // ---- agent prompt runs ----
  await boss.createQueue(QUEUES.agentPrompt)
  await boss.work<{ agentId: string; prompt: string }>(
    QUEUES.agentPrompt,
    async ([job]) => {
      if (!job) return
      const agent = await store.getAgent(job.data.agentId)
      if (!agent) throw new Error(`agent ${job.data.agentId} not found`)
      await runAgentLoop({ store, runner, agent, prompt: job.data.prompt, quoteSigner })
    }
  )

  // ---- automation tick: who is due? (every minute) ----
  await boss.createQueue(QUEUES.automationTick)
  await boss.work(QUEUES.automationTick, async () => {
    const rows = await store.listActiveAutomations()
    const now = Date.now()
    for (const row of rows) {
      let booked: bigint | undefined
      if (row.kind === 'fee_accrued' && row.hook_address) {
        booked = await chain.readContract({
          address: row.hook_address as Address,
          abi: HOOK_ABI,
          functionName: 'participantFeesBooked'
        })
      }
      if (isDue({
        kind: row.kind,
        spec: row.spec,
        lastFiredAt: row.last_fired_at,
        createdAt: row.created_at,
        participantFeesBooked: booked
      }, now)) {
        await boss.send(QUEUES.automationFire, { automationId: row.id })
      }
    }
  })
  await boss.schedule(QUEUES.automationTick, '* * * * *')

  // ---- automation fires (re-validated at fire time) ----
  await boss.createQueue(QUEUES.automationFire)
  await boss.work<{ automationId: string }>(
    QUEUES.automationFire,
    async ([job]) => {
      if (!job) return
      const row = await store.getAutomation(job.data.automationId)
      if (!row || !row.active) return
      const full = (await store.listActiveAutomations()).find(a => a.id === row.id)
      let booked: bigint | undefined
      if (full?.kind === 'fee_accrued' && full.hook_address) {
        booked = await chain.readContract({
          address: full.hook_address as Address,
          abi: HOOK_ABI,
          functionName: 'participantFeesBooked'
        })
      }
      if (full && !isDue({
        kind: full.kind,
        spec: full.spec,
        lastFiredAt: full.last_fired_at,
        createdAt: full.created_at,
        participantFeesBooked: booked
      }, Date.now())) return
      const t = row.intent_template as { type: string; params: Record<string, unknown> }
      const agent = await store.getAgent(row.agent_id)
      if (!agent) return
      const wallet = await store.agentWalletAddress(row.agent_id)
      if (!wallet) return
      await runner.runIntent(row.agent_id, wallet, t.type, t.params, {
        text: `automation ${row.kind} ${row.id} fired`,
        signature: ''
      })
      await store.markAutomationFired(row.id)
    }
  )

  // ---- hourly keeper: permissionless claimProtocol sweeps ----
  await boss.createQueue(QUEUES.keeperClaimProtocol)
  await boss.work(QUEUES.keeperClaimProtocol, async () => {
    const keeper = createKeeperSigner()
    const hooks = await store.listCampaignHooks()
    for (const hook of hooks) {
      const accrued = await chain.readContract({
        address: hook as Address, abi: HOOK_ABI, functionName: 'protocolAccrued'
      })
      if (accrued < MIN_SWEEP) continue
      const res = await keeper.send({
        to: hook as Address,
        data: encodeFunctionData({ abi: HOOK_ABI, functionName: 'claimProtocol' }),
        value: 0n,
        chainId: arcTestnet.id
      })
      console.log(
        `[keeper] claimProtocol on ${hook}:`,
        isSent(res) ? res.txHash : `refused (${res.reason})`
      )
    }
  })
  await boss.schedule(QUEUES.keeperClaimProtocol, '7 * * * *') // hourly at minute 7

  // ---- deposit indexer (system emitter) ----
  await boss.createQueue(QUEUES.indexDeposits)
  await boss.work(QUEUES.indexDeposits, async () => {
    const hooks = await store.listCampaignHooks()
    const latest = await chain.getBlockNumber()
    for (const hook of hooks) {
      const fromBlock = await store.indexerCheckpoint(`deposits:${hook}`)
      if (fromBlock > latest) continue
      const logs = await chain.getLogs({
        address: hook as Address,
        event: DEPOSITED_EVENT,
        fromBlock,
        toBlock: latest
      })
      for (const log of logs) {
        await store.recordDeposit(hook, log as Log & { args: { user?: Address; amountOfTokens?: bigint; amountOfUSDC?: bigint } })
      }
      await store.setIndexerCheckpoint(`deposits:${hook}`, latest + 1n)
    }
  })
  await boss.schedule(QUEUES.indexDeposits, '*/2 * * * *') // every 2 minutes

  console.log('[worker] pg-boss started, queues:', Object.values(QUEUES).join(', '))
}

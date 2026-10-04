/**
 * Demo seed: create test wallets, deploy two LGEs (live + successful),
 * create agents + publish apps through the live executor API.
 *
 * Usage:
 *   FUNDING_KEY=0x... npm run seed
 */
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { freshWallet, fund } from './lib/chain.js'
import { launchLGE, deposit, getCap } from './lib/launch.js'
import { siweLogin, createAgent, publishApp, registerCampaign } from './lib/api.js'

const FUNDING_KEY = (process.env.FUNDING_KEY ?? '') as `0x${string}`
if (!FUNDING_KEY) {
  console.error('FUNDING_KEY required')
  process.exit(1)
}

mkdirSync('out', { recursive: true })

interface DemoState {
  funding: string
  alpha?: { pk: string; address: string; hook: string; token: string; agentId: string; slug: string; txHash: string }
  beta?: { pk: string; address: string; hook: string; token: string; agentId: string; slug: string; txHash: string }
  participant?: { pk: string; address: string }
}

async function main () {
  console.log('[seed] starting demo seed against', process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.io')

  // 1. wallets
  const alphaOwner = freshWallet('alpha-owner')
  const betaOwner = freshWallet('beta-owner')
  const participant = freshWallet('participant')
  await fund(FUNDING_KEY, alphaOwner.address, 2)
  await fund(FUNDING_KEY, betaOwner.address, 2)
  await fund(FUNDING_KEY, participant.address, 1)

  // 2. launch Alpha: a live LGE with a long window and a small deposit
  const alpha = await launchLGE(alphaOwner.pk, {
    name: 'Alpha Agent',
    symbol: 'ALPH',
    capTokens: 20_000,
    streamBlocks: 7200n, // ~1 hour
    minTokenPrice: 20_000n,
    maxTokenPrice: 80_000n,
    feeBps: 100
  })
  await deposit(participant.pk, alpha.hookAddress, 500n * 10n ** 18n)

  // 3. launch Beta: fill cap -> successful -> pool + LP
  const beta = await launchLGE(betaOwner.pk, {
    name: 'Beta Agent',
    symbol: 'BETA',
    capTokens: 20_000,
    streamBlocks: 3600n, // ~30 min
    minTokenPrice: 20_000n,
    maxTokenPrice: 80_000n,
    feeBps: 100
  })
  const betaCap = await getCap(beta.tokenAddress)
  const betaClaimed = 0n
  await deposit(participant.pk, beta.hookAddress, betaCap - betaClaimed)
  console.log(`[seed] beta filled to cap (${betaCap / 10n ** 18n} tokens)`)

  // 4. create agents + publish apps via executor API (SIWE sessions)
  const alphaSession = await siweLogin(alphaOwner.pk)
  const alphaAgent = await createAgent(alphaSession, 'Alpha Agent', 'alpha-agent-demo')
  await publishApp(alphaSession, alphaAgent.id, {
    name: 'Alpha Agent',
    tagline: 'First live LGE on the ABC board.',
    idea: 'A demo agent to exercise the live LGE card, deposit flow, and public board.',
    links: [{ label: 'Deposit', url: `https://alpha-agent-demo.agenticbusinessconsole.com` }]
  })
  await registerCampaign(alphaSession, alphaAgent.id, {
    tokenAddress: alpha.tokenAddress,
    hookAddress: alpha.hookAddress,
    name: 'Alpha Agent',
    symbol: 'ALPH',
    cap: (20_000n * 10n ** 18n).toString(),
    startBlock: alpha.startBlock.toString(),
    streamBlocks: alpha.streamBlocks.toString(),
    minTokenPrice: '20000',
    maxTokenPrice: '80000',
    feeBps: 100
  })

  const betaSession = await siweLogin(betaOwner.pk)
  const betaAgent = await createAgent(betaSession, 'Beta Agent', 'beta-agent-demo')
  await publishApp(betaSession, betaAgent.id, {
    name: 'Beta Agent',
    tagline: 'A successful LGE that cleared and now trades.',
    idea: 'Demo agent for the live tokens board, pool swaps, and fee flows.',
    links: [{ label: 'Trade', url: `https://beta-agent-demo.agenticbusinessconsole.com` }]
  })
  await registerCampaign(betaSession, betaAgent.id, {
    tokenAddress: beta.tokenAddress,
    hookAddress: beta.hookAddress,
    name: 'Beta Agent',
    symbol: 'BETA',
    cap: (20_000n * 10n ** 18n).toString(),
    startBlock: beta.startBlock.toString(),
    streamBlocks: beta.streamBlocks.toString(),
    minTokenPrice: '20000',
    maxTokenPrice: '80000',
    feeBps: 100
  })

  const state: DemoState = {
    funding: FUNDING_KEY,
    alpha: {
      pk: alphaOwner.pk,
      address: alphaOwner.address,
      hook: alpha.hookAddress,
      token: alpha.tokenAddress,
      agentId: alphaAgent.id,
      slug: alphaAgent.slug,
      txHash: alpha.txHash
    },
    beta: {
      pk: betaOwner.pk,
      address: betaOwner.address,
      hook: beta.hookAddress,
      token: beta.tokenAddress,
      agentId: betaAgent.id,
      slug: betaAgent.slug,
      txHash: beta.txHash
    },
    participant: {
      pk: participant.pk,
      address: participant.address
    }
  }

  writeFileSync('out/state.json', JSON.stringify(state, null, 2))
  console.log('[seed] done. state written to out/state.json')
}

main().catch(e => {
  console.error('\nSEED FAIL:', e.message)
  process.exit(1)
})

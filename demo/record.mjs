/**
 * Demo recorder: drives the console in system Chrome and records a WebM
 * via puppeteer's screencast. Requires the vite dev server (:5174) and the
 * executor (:8787) running. Output: demo/abc-demo.webm
 *
 *   npm i && npm run record
 *
 * The walkthrough is paced for a <3 min cut: Overview → Token (WLK3 success
 * view) → Activity (expanded intent) → Automations → Settings → explorer.
 */

import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.CONSOLE_URL ?? 'http://localhost:5174'
const WLK3 = '0xD110BC51cE240f110D9f26AFFB745eb51E80AAcC'

const beat = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--window-size=1440,900', '--hide-scrollbars']
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })

mkdirSync(new URL('.', import.meta.url).pathname, { recursive: true })
const outPath = new URL('./abc-demo.webm', import.meta.url).pathname
const recorder = await page.screencast({ path: outPath })

const go = async (url, settleMs = 3500) => {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 }).catch(() => {})
  await beat(settleMs)
}

try {
  // Beat 1 — Overview: identity, balance, meter buckets, last intents.
  await go(`${BASE}/`, 8000)

  // Beat 2 — Token list: all campaigns, both states visible.
  await go(`${BASE}/token`, 7000)

  // Beat 3 — WLK3 success view: stat strip, position, lock bar, fee ledgers.
  await go(`${BASE}/token/${WLK3}`, 9000)
  await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'smooth' }))
  await beat(5000)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  await beat(3000)

  // Beat 4 — Activity: expand the first FINAL intent for the state timeline.
  await go(`${BASE}/activity`, 7000)
  await page.evaluate(() => {
    document.querySelector('tr.row-expandable')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await beat(7000)

  // Beat 5 — Automations: the armed cron.
  await go(`${BASE}/automations`, 6000)

  // Beat 6 — Settings: policy + identity.
  await go(`${BASE}/settings`, 6000)

  // Beat 7 — On-chain proof: the hook on the explorer.
  await go(`https://explorer.testnet.arc.io/address/${WLK3}`, 9000)
} finally {
  await recorder.stop()
  await browser.close()
}
console.log(`recorded: ${outPath}`)

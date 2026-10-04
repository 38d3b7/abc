/**
 * Demo verification: screenshots of the apex site showing the seeded agents.
 * Requires `npm run seed` first (out/state.json).
 */
import 'dotenv/config'
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const APEX = process.env.APEX_URL ?? 'https://agenticbusinessconsole.com'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

async function main () {
  const state = JSON.parse(readFileSync('out/state.json', 'utf8')) as {
    alpha?: { slug: string }
    beta?: { slug: string }
  }
  if (!state.alpha || !state.beta) {
    console.error('run npm run seed first')
    process.exit(1)
  }

  mkdirSync('out/screens', { recursive: true })

  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  const snap = async (name: string, url: string) => {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `out/screens/${name}.png`, fullPage: true })
    console.log(`[snap] out/screens/${name}.png`)
  }

  try {
    await snap('apex-home', APEX)
    await snap('apex-directory', `${APEX}/?filter=all-sites`)
    await snap('apex-live', `${APEX}/?filter=lge-live`)
    await snap('alpha-site', `${APEX.replace('https://', 'https://alpha-agent-demo.')}`)
    await snap('beta-site', `${APEX.replace('https://', 'https://beta-agent-demo.')}`)
  } finally {
    await browser.close()
  }

  console.log('[verify] screenshots saved to out/screens/')
}

main().catch(e => {
  console.error('\nVERIFY FAIL:', e.message)
  process.exit(1)
})

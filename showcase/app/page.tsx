import { listPublished } from '@/lib/db'
import { enrichDirectory } from '@/lib/directory'
import { listOpenRaises } from '@/lib/lge'
import { fetchBoard } from '@/lib/board'
import { DirectoryBrowser } from './components/DirectoryBrowser'
import { OpenRaises } from './components/OpenRaises'
import { LiveTokens } from './components/LiveTokens'

export const dynamic = 'force-dynamic'

const CONSOLE_URL = process.env.NEXT_PUBLIC_CONSOLE_URL ?? process.env.CONSOLE_BASE_URL ?? 'https://app.agenticbusinessconsole.com'

/** Apex agenticbusinessconsole.com: the token market (open raises + live
 *  tokens) above the directory of published agent storefronts. */
export default async function Directory () {
  const apps = await listPublished()
  const [entries, raises, board] = await Promise.all([
    enrichDirectory(apps),
    listOpenRaises().catch(() => []),
    fetchBoard()
  ])

  return (
    <main className="shell shell--wide">
      <header className="masthead">
        <div className="masthead-logo-row">
          <img
            className="masthead-logo"
            src="/brand/abc-logo-cutout.png"
            alt="abc"
            width={180}
            height={84}
          />
          <a className="masthead-console" href={process.env.NEXT_PUBLIC_CONSOLE_URL ?? 'https://app.agenticbusinessconsole.com'}>
            Operator console
          </a>
        </div>
        <h1>Welcome to the Agentic Business Console</h1>
        <div className="masthead-accent-line" aria-hidden="true" />
      </header>

      <OpenRaises raises={raises} consoleUrl={CONSOLE_URL} />
      <LiveTokens board={board} />

      <section className="section" aria-label="Agent directory">
        <h2>Agents</h2>
        <DirectoryBrowser entries={entries} />
      </section>

      <footer className="footer">agenticbusinessconsole.com</footer>
    </main>
  )
}

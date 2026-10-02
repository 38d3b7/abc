import { listPublished } from '@/lib/db'
import { enrichDirectory } from '@/lib/directory'
import { DirectoryBrowser } from './components/DirectoryBrowser'

export const dynamic = 'force-dynamic'

/** Apex agenticbusinessconsole.com: directory of published agent storefronts. */
export default async function Directory () {
  const apps = await listPublished()
  const entries = await enrichDirectory(apps)

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

      <DirectoryBrowser entries={entries} />

      <footer className="footer">agenticbusinessconsole.com</footer>
    </main>
  )
}

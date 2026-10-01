import { notFound } from 'next/navigation'
import { getAppBySlug } from '@/lib/db'

export const dynamic = 'force-dynamic'

const CONSOLE_BASE_URL = process.env.CONSOLE_BASE_URL || 'https://pumperp.com'

/** One agent's storefront: structured blocks pushed by the executor. */
export default async function Storefront ({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const app = await getAppBySlug(slug)
  if (!app) notFound()

  const ideaParagraphs = app.idea.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)

  return (
    <main className="shell">
      <header className="masthead">
        <div className="kicker">{app.slug}.pumperp.com</div>
        <h1>{app.name}</h1>
        {app.tagline && <p className="tagline">{app.tagline}</p>}
      </header>

      {ideaParagraphs.length > 0 && (
        <section className="section idea">
          <h2>The idea</h2>
          {ideaParagraphs.map((p, i) => <p key={i}>{p}</p>)}
        </section>
      )}

      {app.roadmap.length > 0 && (
        <section className="section">
          <h2>Roadmap</h2>
          <ul className="roadmap">
            {app.roadmap.map((item, i) => (
              <li key={i} className={item.done ? 'done' : ''}>
                <span className="mark">{item.done ? '✓' : '·'}</span>
                <span className="text">{item.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {app.hookAddress && (
        <section className="section">
          <h2>The raise</h2>
          <div className="token-facts">
            {app.tokenAddress && <div><span className="k">token</span>{app.tokenAddress}</div>}
            <div><span className="k">sale</span>{app.hookAddress}</div>
          </div>
          <p style={{ marginTop: 16 }}>
            <a className="cta" href={`${CONSOLE_BASE_URL}/token/${app.hookAddress}`}>
              Deposit into the LGE
            </a>
          </p>
          <p className="cta-note">
            Deposits are USDC on Arc testnet. 25% of trading fees stream to LGE
            participants in perpetuity.
          </p>
        </section>
      )}

      {app.links.length > 0 && (
        <section className="section">
          <h2>Links</h2>
          <div className="links">
            {app.links.map((l, i) => (
              <a key={i} href={l.url} rel="noopener noreferrer" target="_blank">{l.label}</a>
            ))}
          </div>
        </section>
      )}

      <footer className="footer">
        published by the agent · last edit {new Date(app.updatedAt).toISOString().slice(0, 10)}
      </footer>
    </main>
  )
}

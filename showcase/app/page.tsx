import { listPublished } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Apex pumperp.com: the directory of published agent storefronts. */
export default async function Directory () {
  const apps = await listPublished()
  return (
    <main className="shell">
      <header className="masthead">
        <div className="kicker">pumperp</div>
        <h1>Agent-run businesses</h1>
        <p className="tagline">
          Each storefront is published by an autonomous agent raising through its
          Liquidity Generation Event on Arc.
        </p>
      </header>
      {apps.length === 0
        ? <p style={{ color: 'var(--ink-3)' }}>No agents have published yet.</p>
        : apps.map(app => (
          <a key={app.slug} className="dir-row" href={`https://${app.slug}.pumperp.com`}>
            <span className="dir-name">{app.name}</span>
            <span className="dir-tag">{app.tagline}</span>
          </a>
        ))}
      <footer className="footer">pumperp.com — agentic business console</footer>
    </main>
  )
}

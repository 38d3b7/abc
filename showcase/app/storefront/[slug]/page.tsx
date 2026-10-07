import { notFound } from 'next/navigation'
import { getAppBySlug } from '@/lib/db'
import { readLiveLgeMetricsByHook } from '@/lib/lge-live'
import { fmtCount, fmtDuration, fmtUsd } from '@/lib/format'

export const dynamic = 'force-dynamic'

const CONSOLE_BASE_URL = process.env.CONSOLE_BASE_URL || 'https://app.agenticbusinessconsole.com'

/** One agent's site: structured blocks pushed by the executor. */
export default async function Storefront ({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const app = await getAppBySlug(slug)
  if (!app) notFound()

  const metrics = app.hookAddress ? await readLiveLgeMetricsByHook(app.hookAddress) : null
  const ideaParagraphs = app.idea.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)

  const capProg = metrics && metrics.capUsdc > 0
    ? Math.min(metrics.raisedUsdc / metrics.capUsdc, 1)
    : 0
  const priceRange = metrics
    ? metrics.maxTokensPerUsdc - metrics.minTokensPerUsdc
    : 0
  const priceProg = metrics && priceRange > 0
    ? Math.min(Math.max((metrics.currentTokensPerUsdc - metrics.minTokensPerUsdc) / priceRange, 0), 1)
    : 0

  return (
    <main className="shell">
      <header className="masthead">
        <div className="kicker">{app.slug}.agenticbusinessconsole.com</div>
        <h1>{app.name}</h1>
        {app.tagline && <p className="tagline">{app.tagline}</p>}
        {app.xHandle && (
          <p className="x-handle">
            <a href={`https://x.com/${app.xHandle}`} rel="noopener noreferrer" target="_blank">@{app.xHandle}</a>
          </p>
        )}
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

      {app.hookAddress && metrics && (
        <section className="section">
          <h2>The raise</h2>
          <div className="raise-card">
            <div className="raise-row">
              <span className="raise-label">Token</span>
              <span className="raise-value">{metrics.tokenName} ({metrics.tokenSymbol})</span>
            </div>
            <div className="raise-row">
              <span className="raise-label">Raised</span>
              <span className="raise-value">{fmtUsd(metrics.raisedUsdc)} <span className="board-dim">/ {fmtUsd(metrics.capUsdc)}</span></span>
            </div>
            <div className="raise-row">
              <span className="raise-label">Progress</span>
              <span className="raise-value">
                <span className="board-progress" role="progressbar" aria-valuenow={Math.round(capProg * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <span className="board-progress-fill" style={{ width: `${Math.round(capProg * 100)}%` }} />
                </span>
                <span className="board-dim">{Math.round(capProg * 100)}%</span>
              </span>
            </div>
            <div className="raise-row">
              <span className="raise-label">Rate</span>
              <span className="raise-value">{fmtCount(metrics.currentTokensPerUsdc)} <span className="board-dim">/ USDC</span></span>
            </div>
            <div className="raise-row">
              <span className="raise-label">Time left</span>
              <span className="raise-value">{fmtDuration(metrics.secondsLeft)}</span>
            </div>
            <div className="raise-row">
              <span className="raise-label">Price curve</span>
              <span className="raise-value">
                <span className="board-progress" role="progressbar" aria-valuenow={Math.round(priceProg * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <span className="board-progress-fill" style={{ width: `${Math.round(priceProg * 100)}%` }} />
                </span>
                <span className="board-dim">{fmtCount(metrics.minTokensPerUsdc)} → {fmtCount(metrics.maxTokensPerUsdc)}</span>
              </span>
            </div>
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
          <div className="token-facts" style={{ marginTop: 16 }}>
            {app.tokenAddress && <div><span className="k">token</span>{app.tokenAddress}</div>}
            <div><span className="k">sale</span>{app.hookAddress}</div>
          </div>
        </section>
      )}

      {app.hookAddress && !metrics && (
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

'use client'

import type { OpenRaise } from '@/lib/lge'
import { agentSiteUrl } from '@/lib/directory-shared'
import { fmtCount, fmtDuration, fmtUsd } from '@/lib/format'

/**
 * Open raises — LGEs in progress, read from chain state. The deposit CTA
 * lives on the agent's own site (PRODUCT.md); the row links there.
 */
export function OpenRaises ({ raises, consoleUrl }: { raises: OpenRaise[]; consoleUrl: string }) {
  return (
    <section className="section board-section" aria-label="Open raises">
      <h2>Open raises</h2>
      {raises.length === 0
        ? <p className="dir-empty">No raises open right now.</p>
        : (
          <div className="board-table-wrap">
            <table className="board-table">
              <thead>
                <tr>
                  <th>Token</th>
                  <th className="num">Raised</th>
                  <th className="num">Progress</th>
                  <th className="num">Rate</th>
                  <th className="num">Time left</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {raises.map(r => {
                  const href = r.agentSlug
                    ? agentSiteUrl(r.agentSlug)
                    : `${consoleUrl}/token/${r.hook}`
                  return (
                    <tr
                      key={r.hook}
                      onClick={() => { window.location.href = href }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div className="board-token">
                          <a className="board-token-name" href={href} onClick={e => e.stopPropagation()}>{r.name || '—'}</a>
                          <span className="board-token-sub">
                            {r.symbol || '—'}
                            {r.agentName ? ` · ${r.agentName}` : ''}
                          </span>
                        </div>
                      </td>
                      <td className="num">{fmtUsd(r.raisedUsdc)} <span className="board-dim">/ {fmtUsd(r.capUsdc)}</span></td>
                      <td className="num">
                        <div className="board-progress" role="progressbar" aria-valuenow={Math.round(r.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                          <div className="board-progress-fill" style={{ width: `${Math.round(r.progress * 100)}%` }} />
                        </div>
                        <span className="board-dim">{Math.round(r.progress * 100)}%</span>
                      </td>
                      <td className="num">{fmtCount(r.tokensPerUsdc)} <span className="board-dim">/ USDC</span></td>
                      <td className="num">{fmtDuration(r.secondsLeft)}</td>
                      <td className="num">
                        <a className="board-cta" href={href} onClick={e => e.stopPropagation()}>Deposit</a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}
    </section>
  )
}

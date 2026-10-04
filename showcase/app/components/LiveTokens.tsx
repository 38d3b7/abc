import type { Board } from '@/lib/board'
import { agentSiteUrl } from '@/lib/directory-shared'
import { changeSinceLaunch, fmtAgo, fmtCount, fmtPct, fmtPrice, fmtUsd, shortAddr } from '@/lib/format'

const EXPLORER = 'https://testnet.arcscan.app'

/**
 * Live tokens — LGEs that cleared and now trade on their v4 pools. Data is
 * the executor's public indexer (PoolManager.Swap per pool); ranked by 24h
 * volume. The tape is the latest swaps across all board tokens.
 */
export function LiveTokens ({ board }: { board: Board }) {
  return (
    <section className="section board-section" aria-label="Live tokens">
      <h2>Live tokens</h2>
      {!board.live && <p className="board-note">Market data is temporarily unavailable.</p>}
      {board.tokens.length === 0
        ? <p className="dir-empty">No tokens trading yet — the first raise to clear seeds its pool here.</p>
        : (
          <div className="board-table-wrap">
            <table className="board-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Token</th>
                  <th className="num">Price</th>
                  <th className="num">Since launch</th>
                  <th className="num">Mcap</th>
                  <th className="num">24h volume</th>
                  <th className="num">24h trades</th>
                  <th className="num">24h traders</th>
                </tr>
              </thead>
              <tbody>
                {board.tokens.map((t, i) => {
                  const change = changeSinceLaunch(t.priceUsdc, t.launchPriceUsdc)
                  return (
                    <tr key={t.hookAddress}>
                      <td className="board-rank">{i + 1}</td>
                      <td>
                        <div className="board-token">
                          {t.agentSlug
                            ? <a className="board-token-name" href={agentSiteUrl(t.agentSlug)}>{t.name ?? '—'}</a>
                            : <span className="board-token-name">{t.name ?? '—'}</span>}
                          <span className="board-token-sub">
                            {t.symbol ?? '—'}
                            {t.agentName ? ` · ${t.agentName}` : ''}
                          </span>
                        </div>
                      </td>
                      <td className="num">{fmtPrice(t.priceUsdc)}</td>
                      <td className={`num ${change != null ? (change >= 0 ? 'board-up' : 'board-down') : ''}`}>
                        {fmtPct(change)}
                      </td>
                      <td className="num">{fmtUsd(t.mcapUsdc)}</td>
                      <td className="num">{fmtUsd(t.volume24hUsdc)}</td>
                      <td className="num">
                        {t.trades24h}
                        {t.trades24h > 0 && (
                          <span className="board-dim"> ({t.buys24h}B/{t.sells24h}S)</span>
                        )}
                      </td>
                      <td className="num">{t.traders24h}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}

      {board.activity.length > 0 && (
        <div className="board-tape" aria-label="Recent activity">
          {board.activity.map(s => (
            <a
              key={`${s.txHash}`}
              className="board-tape-item"
              href={`${EXPLORER}/tx/${s.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className={s.isBuy ? 'board-up' : 'board-down'}>
                {s.isBuy ? 'Buy' : 'Sell'}
              </span>
              {' '}{fmtCount(s.tokenAmount)} {s.symbol ?? '?'}
              {' '}<span className="board-dim">for</span> {fmtUsd(s.usdcAmount)}
              {' '}<span className="board-dim">by</span> <span className="board-mono">{shortAddr(s.trader)}</span>
              {' '}<span className="board-dim">{fmtAgo(s.blockTs)}</span>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}

'use client'

import { useMemo } from 'react'
import type { DirectoryEntry } from '@/lib/directory-shared'
import { agentSiteUrl } from '@/lib/directory-shared'
import { fmtCount, fmtDuration, fmtUsd } from '@/lib/format'

/** An ABC-paper styled square card inspired by the legacy LGE frontend's
 *  MemeCoinTile: a quiet frame with progress indicators on each side.
 *  Only renders for live LGE entries that have on-chain metrics. */
export function LiveLgeCard ({ entry }: { entry: DirectoryEntry }) {
  const m = entry.liveMetrics
  if (!m) {
    return (
      <a className="lge-card" href={agentSiteUrl(entry.slug)}>
        <div className="lge-card-body">
          <span className="lge-card-name">{entry.name}</span>
          <span className="lge-card-tagline">{entry.tagline || '—'}</span>
          <span className="lge-card-note">LGE live · details loading</span>
        </div>
      </a>
    )
  }

  const latestBlock = 0n // server has no client block; time via measured seconds
  const progress = useMemo(() => {
    const capProg = m.capUsdc > 0 ? Math.min(m.raisedUsdc / m.capUsdc, 1) : 0
    const priceRange = m.maxTokensPerUsdc - m.minTokensPerUsdc
    const priceProg = priceRange > 0
      ? Math.min(Math.max((m.currentTokensPerUsdc - m.minTokensPerUsdc) / priceRange, 0), 1)
      : 0
    return { capProg, priceProg }
  }, [m])

  // Time-left is a server-rendered snapshot from the block the metrics were
  // read at; we intentionally don't poll blocks in the card.
  const secondsLeft = m.secondsLeft

  return (
    <a className="lge-card" href={agentSiteUrl(entry.slug)}>
      {/* top edge — raised to cap */}
      <div className="lge-card-edge lge-card-top">
        <div className="lge-card-track">
          <div className="lge-card-fill" style={{ width: `${Math.round(progress.capProg * 100)}%` }} />
        </div>
        <span className="lge-card-edge-label">{Math.round(progress.capProg * 100)}% to cap</span>
      </div>

      {/* right edge — time remaining */}
      <div className="lge-card-edge lge-card-right">
        <div className="lge-card-track-v">
          <div className="lge-card-fill-v" style={{ height: '100%' }} />
        </div>
        <span className="lge-card-edge-label-v">{secondsLeft > 0 ? fmtDuration(secondsLeft) : 'ending'}</span>
      </div>

      {/* bottom edge — price progress along the rising curve
          The hook's price is tokens per 1 USDC; show the range in those
          units (matching the console's own price display). */}
      <div className="lge-card-edge lge-card-bottom">
        <span className="lge-card-edge-label">{fmtCount(m.maxTokensPerUsdc)}</span>
        <div className="lge-card-track">
          <div className="lge-card-fill" style={{ width: `${Math.round(progress.priceProg * 100)}%` }} />
        </div>
        <span className="lge-card-edge-label">{fmtCount(m.minTokensPerUsdc)}</span>
      </div>

      {/* left edge — token identity */}
      <div className="lge-card-edge lge-card-left">
        <span className="lge-card-token">{m.tokenSymbol}</span>
        <span className="lge-card-name-v">{entry.name}</span>
      </div>

      <div className="lge-card-body">
        <span className="lge-card-price">{fmtCount(m.currentTokensPerUsdc)}<span className="lge-card-price-sub">tokens / USDC</span></span>
        <span className="lge-card-stat">{fmtUsd(m.raisedUsdc)} raised</span>
        <span className="lge-card-stat">{Math.round(progress.capProg * 100)}% to cap</span>
        <span className="lge-card-cta">View raise →</span>
      </div>
    </a>
  )
}

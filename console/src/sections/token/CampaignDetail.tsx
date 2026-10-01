import { usePublicClient, useWatchBlockNumber } from 'wagmi'
import { useState } from 'react'
import { useCampaign, campaignChip } from '../Token'
import { priceCurve, type CampaignState } from '../../lib/lge'
import { fmtTokens, fmtUsdc, fmtBlocks, priceToUsdcPerToken } from '../../lib/format'
import { StatStrip } from '../../components/StatStrip'
import { LineChart } from '../../components/LineChart'
import { ProgressBar } from '../../components/ProgressBar'
import { HashLink } from '../../components/HashLink'
import { DepositBox } from './DepositBox'
import { SuccessView } from './SuccessView'
import { FailedView } from './FailedView'

export function CampaignDetail ({ hook }: { hook: `0x${string}` }) {
  const campaign = useCampaign(hook)
  const [block, setBlock] = useState<bigint>(0n)
  useWatchBlockNumber({ onBlockNumber: setBlock })
  const client = usePublicClient()
  void client

  if (campaign.error) {
    return <div className="page-head"><h1>Token</h1><span className="sub">Failed to load campaign: {(campaign.error as Error).message}</span></div>
  }
  if (!campaign.data) {
    return <div className="page-head"><h1>Token</h1><span className="sub">Loading…</span></div>
  }
  const s = campaign.data
  const endBlock = s.startBlock + s.streamBlocks
  const live = !s.isLgeFinished && block > 0n && block <= endBlock
  const soldFrac = s.cap > 0n ? Number(s.totalTokensClaimed) / Number(s.cap) : 0
  const blocksLeft = block > 0n && endBlock > block ? endBlock - block : 0n

  return (
    <>
      <div className="page-head">
        <h1>{s.tokenName} <span className="muted mono">${s.tokenSymbol}</span></h1>
        {campaignChip(s)}
        <HashLink hash={hook} />
        <HashLink hash={s.token} />
      </div>

      <StatStrip stats={[
        { label: 'Raised', value: `${fmtUsdc(s.totalUsdcRaised)} USDC` },
        { label: 'Sold', value: `${fmtTokens(s.totalTokensClaimed)} / ${fmtTokens(s.cap)}` },
        { label: 'Current rate', value: `${Number(s.currentPrice).toLocaleString('en-US')} tok/USDC` },
        { label: 'Implied price', value: `${priceToUsdcPerToken(s.currentPrice)} USDC` },
        live
          ? { label: 'Time left', value: fmtBlocks(blocksLeft) }
          : { label: 'Hook fee', value: `${s.feeBps / 100}%` }
      ]} />

      {live || (!s.isLgeFinished && !s.isLgeSuccessful) ? (
        <LiveView s={s} block={block} soldFrac={soldFrac} />
      ) : s.isLgeSuccessful ? (
        <SuccessView s={s} />
      ) : (
        <FailedView s={s} />
      )}
    </>
  )
}

function LiveView ({ s, block, soldFrac }: { s: CampaignState; block: bigint; soldFrac: number }) {
  const started = block >= s.startBlock
  return (
    <>
      <div className="panel mt16">
        <div className="panel-head">
          <h2>Rising rate</h2>
          <span className="muted small">
            {started
              ? `block ${block} of ${s.startBlock}–${s.startBlock + s.streamBlocks}`
              : `opens at block ${s.startBlock} (~${fmtBlocks(s.startBlock - block)})`}
          </span>
        </div>
        <div className="panel-body">
          <LineChart
            points={priceCurve(s)}
            {...(started ? { nowX: Number(block) } : {})}
            formatY={v => v.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            formatX={v => fmtBlocks(Math.max(0, v - Number(s.startBlock)))}
            yLabel="tokens per USDC"
          />
          <div className="mt8">
            <span className="label">Progress to cap</span>
            <ProgressBar frac={soldFrac} />
          </div>
        </div>
      </div>

      <div className="panel mt16">
        <div className="panel-head"><h2>Deposit</h2></div>
        <div className="panel-body">
          <DepositBox s={s} block={block} />
        </div>
      </div>
    </>
  )
}

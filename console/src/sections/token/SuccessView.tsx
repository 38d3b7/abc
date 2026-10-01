import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { LGEHookAbi } from '../../config/contracts/abis/LGEHookAbi'
import { readUserState, type CampaignState } from '../../lib/lge'
import { fmtUsdc, fmtUsdcFull, fmtTokens } from '../../lib/format'
import { StatStrip } from '../../components/StatStrip'
import { ProgressBar } from '../../components/ProgressBar'
import { Button } from '../../components/Button'
import { KeyValue } from '../../components/KeyValue'
import { Chip } from '../../components/Chip'

/** Post-success: fee ledgers, claims with exact amounts, lock progress, LP shares + exit. */
export function SuccessView ({ s }: { s: CampaignState }) {
  const { address, isConnected } = useAccount()
  const client = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const user = useQuery({
    queryKey: ['userState', s.hook, address],
    queryFn: () => readUserState(client!, s.hook, address!),
    enabled: Boolean(client && address)
  })

  const lockFrac = s.totalUsdcRaised > 0n
    ? Number(s.participantFeesBooked) / Number(s.totalUsdcRaised)
    : 0

  async function call (label: string, fn: 'claimParticipant' | 'claimAgent' | 'claimLiquidity' | 'exitLiquidity' | 'claimPendingNative') {
    setBusy(label)
    setError(null)
    try {
      const hash = await writeContractAsync({ address: s.hook, abi: LGEHookAbi, functionName: fn })
      await client!.waitForTransactionReceipt({ hash })
      void user.refetch()
    } catch (e) {
      setError(`${label}: ${(e as Error).message.split('\n')[0]}`)
    } finally {
      setBusy(null)
    }
  }

  const isAgent = address && address.toLowerCase() === s.agent.toLowerCase()
  const u = user.data
  const exitOpen = !s.lpLocked && s.exitThreshold > 0n && s.feeVolume30d < s.exitThreshold

  return (
    <>
      <div className="panel mt16">
        <div className="panel-head"><h2>Fee ledger</h2><span className="muted small">25% participants · 50% agent · 25% protocol</span></div>
        <StatStrip stats={[
          { label: 'Participants (25%)', value: `${fmtUsdc(s.participantFeesBooked)} USDC` },
          { label: 'Agent (50%)', value: `${fmtUsdc(s.agentAccrued)} USDC` },
          { label: 'Protocol (25%)', value: `${fmtUsdc(s.protocolAccrued)} USDC` }
        ]} />
      </div>

      <div className="panel mt16">
        <div className="panel-head">
          <h2>LP lock</h2>
          {s.lpLocked ? <Chip tone="ok">Locked forever</Chip> : <Chip tone="acc">Accruing</Chip>}
        </div>
        <div className="panel-body">
          <ProgressBar frac={lockFrac} ok={s.lpLocked} />
          <p className="muted small mt8">
            Booked participant fees {fmtUsdc(s.participantFeesBooked)} USDC of {fmtUsdc(s.totalUsdcRaised)} USDC raised.
            When booked fees equal total spend, every participant's LP locks forever.
          </p>
        </div>
      </div>

      {isConnected && u ? (
        <div className="panel mt16">
          <div className="panel-head"><h2>Your position</h2></div>
          <div className="panel-body">
            <KeyValue entries={[
              ['Deposited (liquidity half)', `${fmtUsdc(u.usdcToLiquidityDeposited)} USDC`],
              ['Tokens to liquidity', `${fmtTokens(u.tokensToLiquidity)} $${s.tokenSymbol}`],
              ['LP share', u.hasClaimedLp ? `${fmtTokens(u.lpShare)} (recorded)` : 'not claimed'],
              ['Claimable fees', `${fmtUsdc(u.claimable)} USDC`],
              ...(u.pendingNative > 0n ? [['Parked refund', `${fmtUsdc(u.pendingNative)} USDC`] as [string, string]] : [])
            ]} />
            <div className="mt16" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                disabled={busy !== null || u.claimable === 0n}
                title={u.claimable > 0n ? fmtUsdcFull(u.claimable) : undefined}
                onClick={() => void call('Claim fees', 'claimParticipant')}
              >
                {busy === 'Claim fees' ? 'Claiming…' : `Claim ${fmtUsdc(u.claimable)} USDC`}
              </Button>
              {!u.hasClaimedLp && u.usdcToLiquidityDeposited > 0n ? (
                <Button disabled={busy !== null} onClick={() => void call('Record LP share', 'claimLiquidity')}>
                  {busy === 'Record LP share' ? 'Recording…' : 'Record LP share'}
                </Button>
              ) : null}
              {u.hasClaimedLp && !u.exited ? (
                <Button
                  variant="danger"
                  disabled={busy !== null || !exitOpen}
                  title={exitOpen ? 'Withdraw both legs of your LP share plus accrued fees' : 'Exit closed: LP locked, or 30-day fee volume above the exit threshold'}
                  onClick={() => void call('Exit liquidity', 'exitLiquidity')}
                >
                  {busy === 'Exit liquidity' ? 'Exiting…' : 'Exit liquidity'}
                </Button>
              ) : null}
              {u.pendingNative > 0n ? (
                <Button disabled={busy !== null} onClick={() => void call('Claim parked', 'claimPendingNative')}>
                  {busy === 'Claim parked' ? 'Claiming…' : `Claim parked ${fmtUsdc(u.pendingNative)} USDC`}
                </Button>
              ) : null}
              {isAgent ? (
                <Button
                  disabled={busy !== null || s.agentAccrued === 0n}
                  onClick={() => void call('Claim agent fees', 'claimAgent')}
                >
                  {busy === 'Claim agent fees' ? 'Claiming…' : `Agent claim ${fmtUsdc(s.agentAccrued)} USDC`}
                </Button>
              ) : null}
            </div>
            {error ? <p className="small mt8" style={{ color: 'var(--bad-ink)' }}>{error}</p> : null}
          </div>
        </div>
      ) : (
        <p className="muted small mt16">Connect a wallet to see your position and claim fees.</p>
      )}

      <div className="panel mt16">
        <div className="panel-head"><h2>Treasury half</h2></div>
        <div className="panel-body">
          <KeyValue entries={[
            ['Treasury USDC at success', `${fmtUsdc(s.treasuryUsdc)} USDC`],
            ['LP position', s.positionTokenId > 0n ? `#${s.positionTokenId} (hook-custodied)` : '—'],
            ['Pending buy', s.pendingBuy > 0n ? `${fmtUsdc(s.pendingBuy)} USDC (permissionless treasuryBuy)` : 'none']
          ]} />
        </div>
      </div>
    </>
  )
}

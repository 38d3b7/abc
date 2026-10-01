import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { LGEHookAbi } from '../../config/contracts/abis/LGEHookAbi'
import { readUserState, type CampaignState } from '../../lib/lge'
import { fmtUsdc } from '../../lib/format'
import { Button } from '../../components/Button'

/** Failed LGE: everyone withdraws their full deposit. */
export function FailedView ({ s }: { s: CampaignState }) {
  const { address, isConnected } = useAccount()
  const client = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const user = useQuery({
    queryKey: ['userState', s.hook, address],
    queryFn: () => readUserState(client!, s.hook, address!),
    enabled: Boolean(client && address)
  })
  const u = user.data
  const refundable = u ? u.usdcToLiquidityDeposited + u.remainingUsdcDeposited : 0n

  async function withdraw () {
    setBusy(true)
    setError(null)
    try {
      const hash = await writeContractAsync({ address: s.hook, abi: LGEHookAbi, functionName: 'withdraw' })
      await client!.waitForTransactionReceipt({ hash })
      setDone(true)
      void user.refetch()
    } catch (e) {
      setError((e as Error).message.split('\n')[0])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel mt16">
      <div className="panel-head"><h2>LGE failed — refunds open</h2></div>
      <div className="panel-body">
        <p className="small">
          The window closed below the cap. Every participant recovers their full deposit.
          {u && refundable > 0n ? <> Your refund: <span className="mono">{fmtUsdc(refundable)} USDC</span>.</> : null}
        </p>
        {error ? <p className="small" style={{ color: 'var(--bad-ink)' }}>{error}</p> : null}
        {done ? <p className="small" style={{ color: 'var(--ok-ink)' }}>Refund received.</p> : null}
        {isConnected ? (
          <Button variant="primary" disabled={busy || !u || refundable === 0n} onClick={() => void withdraw()}>
            {busy ? 'Withdrawing…' : `Withdraw ${fmtUsdc(refundable)} USDC`}
          </Button>
        ) : (
          <span className="muted small">Connect a wallet to withdraw.</span>
        )}
      </div>
    </div>
  )
}

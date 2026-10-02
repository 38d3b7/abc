import { useEffect, useMemo, useState } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { parseEther } from 'viem'
import { LGECalculationsLibraryAbi } from '../../config/contracts/abis/LGECalculationsLibraryAbi'
import { LGEHookAbi } from '../../config/contracts/abis/LGEHookAbi'
import { CALCULATIONS_LIBRARY_ARC_TESTNET } from '../../config/contracts/addresses'
import { fmtUsdc, fmtUsdcFull, fmtTokens } from '../../lib/format'
import { Button } from '../../components/Button'
import type { CampaignState } from '../../lib/lge'

/**
 * Participant deposit flow, lifted from lge-frontend's BuyTokensModal and
 * updated for hook v2: quote from the calculations library (returns both
 * halves of the spend), 5% slippage on the value sent, and the
 * deposit(amount, maxUsdcPerToken, deadline) overload for buyer protection.
 */
export function DepositBox ({ s, block }: { s: CampaignState; block: bigint }) {
  const { address, isConnected } = useAccount()
  const client = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<bigint | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const remaining = s.cap - s.totalTokensClaimed
  const amountWei = useMemo(() => {
    if (!amount || Number(amount) <= 0) return undefined
    try { return parseEther(amount) } catch { return undefined }
  }, [amount])

  // Requote every ~10 blocks (~5s), not every block: with 0.5s blocks the
  // cleanup cancelled every in-flight read before it resolved and the quote
  // never landed. Keep the previous quote while requoting — the 5% slippage
  // headroom covers the drift.
  const quoteTick = block / 10n
  useEffect(() => {
    if (!client || !amountWei || block === 0n) return
    let cancelled = false
    client.readContract({
      address: CALCULATIONS_LIBRARY_ARC_TESTNET as `0x${string}`,
      abi: LGECalculationsLibraryAbi,
      functionName: 'calculateUsdcNeeded',
      args: [block, s.startBlock, s.streamBlocks, s.minTokenPrice, s.maxTokenPrice, amountWei]
    }).then(q => { if (!cancelled) setQuote(q as bigint) })
      .catch((e) => {
        if (!cancelled) {
          setQuote(null)
          setError(`Quote failed: ${(e as Error).message.split('\n')[0]}`)
        }
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, amountWei, quoteTick, s.startBlock, s.streamBlocks, s.minTokenPrice, s.maxTokenPrice])

  const withSlippage = quote !== null ? (quote * 105n) / 100n : undefined

  async function deposit () {
    if (!address || !amountWei || quote === null) return
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      // maxUsdcPerToken: ceil(1e18 / currentPrice) usdc-wei per whole token
      // with 5% headroom, matching the hook's own computation in the overload.
      const price = s.currentPrice
      const usdcPerToken = ((10n ** 18n + price - 1n) / price) * 105n / 100n
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)
      const hash = await writeContractAsync({
        address: s.hook,
        abi: LGEHookAbi,
        functionName: 'deposit',
        args: [amountWei, usdcPerToken, deadline],
        value: withSlippage!
      })
      await client!.waitForTransactionReceipt({ hash })
      setDone(hash)
      setAmount('')
    } catch (e) {
      setError((e as Error).message.split('\n')[0])
    } finally {
      setBusy(false)
    }
  }

  const pct = (p: number) => {
    const v = (Number(remaining) / 1e18) * (p / 100)
    setAmount(v > 0 ? v.toFixed(4).replace(/\.?0+$/, '') : '0')
  }

  return (
    <div>
      <div className="form-row">
        <span className="label">Amount (tokens)</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" min="0" />
          <Button onClick={() => pct(25)}>25%</Button>
          <Button onClick={() => pct(50)}>50%</Button>
          <Button onClick={() => pct(75)}>75%</Button>
          <Button onClick={() => pct(100)}>All</Button>
        </div>
      </div>
      <div className="form-row">
        <span className="label">Cost (both halves)</span>
        <span className="mono" title={quote !== null ? fmtUsdcFull(quote) : undefined}>
          {quote !== null ? `${fmtUsdc(quote)} USDC` : '—'}
          {withSlippage ? <span className="muted"> · sends ≤ {fmtUsdc(withSlippage)} with slippage, excess refunded</span> : null}
        </span>
      </div>
      <div className="form-row">
        <span className="label">Remaining</span>
        <span className="mono">{fmtTokens(remaining)} ${s.tokenSymbol}</span>
      </div>
      <div className="panel-body">
        <p className="small muted">
          Need test USDC? <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet.circle.com</a> — select Arc Testnet.
        </p>
        {error ? <p className="small" style={{ color: 'var(--bad-ink)' }}>{error}</p> : null}
        {done ? <p className="small" style={{ color: 'var(--ok-ink)' }}>Deposit confirmed. <a href={`https://explorer.testnet.arc.io/tx/${done}`} target="_blank" rel="noreferrer">View transaction</a></p> : null}
        {!isConnected ? (
          <span className="muted small">Connect a wallet to deposit.</span>
        ) : (
          <Button variant="primary" disabled={busy || !amountWei || quote === null} onClick={() => void deposit()}>
            {busy ? 'Depositing…' : 'Deposit'}
          </Button>
        )}
      </div>
    </div>
  )
}

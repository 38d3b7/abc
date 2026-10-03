import { useState } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { parseEther } from 'viem'
import { mineLaunch } from '../../lib/lge'
import { BLOCKS_PER_HOUR } from '../../lib/chain'
import { LGEManagerAbi } from '../../config/contracts/abis/LGEManagerAbi'
import { LGE_MANAGER_ARC_TESTNET } from '../../config/contracts/addresses'
import { Drawer } from '../../components/Drawer'
import { Button } from '../../components/Button'

/**
 * Launch wizard: a single ruled form, not a stepped card carousel.
 * Defaults are sized for testnet demos (small raise, 24h window).
 */
export function LaunchWizard ({ onClose, onLaunched }: { onClose: () => void; onLaunched: (hook: string) => void }) {
  const { address } = useAccount()
  const client = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [cap, setCap] = useState('20000')
  const [windowHours, setWindowHours] = useState('24')
  const [minPrice, setMinPrice] = useState('20000')   // tokens per USDC at start
  const [maxPrice, setMaxPrice] = useState('80000')   // tokens per USDC at end
  const [feeBps, setFeeBps] = useState('100')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const valid = name.trim() !== '' && symbol.trim() !== '' && Number(cap) > 0 &&
    Number(windowHours) > 0 && Number(minPrice) > 0 && Number(maxPrice) > Number(minPrice) &&
    Number(feeBps) >= 0 && Number(feeBps) <= 300 && Boolean(address)

  async function submit () {
    if (!address || !client) return
    setError(null)
    try {
      setBusy('Reading current block…')
      const block = await client.getBlockNumber()
      const params = {
        name: name.trim(),
        symbol: symbol.trim(),
        cap: parseEther(cap),
        agent: address,
        startBlock: block + 20n, // ~10s of breathing room before the window opens
        streamBlocks: BigInt(Math.round(Number(windowHours) * BLOCKS_PER_HOUR)),
        // Prices are raw token-wei/usdc-wei ratios: both legs are 18-dec, so
        // "20000 tokens per USDC" is simply 20000 (NOT parseEther).
        minTokenPrice: BigInt(minPrice),
        maxTokenPrice: BigInt(maxPrice),
        exitThreshold: 0n, // unset item: exits disabled until the protocol sets a default
        feeBps: Number(feeBps),
        vestingCliff: 0n,
        vestingDuration: 31_536_000n // 12 months
      }
      setBusy('Mining hook salt locally (a few seconds)…')
      const mined = await mineLaunch(client, params)
      setBusy(`Salt mined (${mined.hookAddress.slice(0, 10)}…). Confirm the transaction.`)
      const hash = await writeContractAsync({
        address: LGE_MANAGER_ARC_TESTNET as `0x${string}`,
        abi: LGEManagerAbi,
        functionName: 'deployToken',
        args: [{
          tokenConfig: {
            tokenAdmin: address,
            name: params.name,
            symbol: params.symbol,
            image: '',
            metadata: '',
            cap: params.cap,
            tokenSalt: mined.tokenSalt
          },
          hookConfig: {
            hookSalt: mined.hookSalt,
            startBlock: params.startBlock,
            streamBlocks: params.streamBlocks,
            minTokenPrice: params.minTokenPrice,
            maxTokenPrice: params.maxTokenPrice,
            exitThreshold: params.exitThreshold,
            feeBps: params.feeBps,
            vestingCliff: params.vestingCliff,
            vestingDuration: params.vestingDuration
          }
        }],
        // deployToken deploys both the token and the hook via CREATE2; the
        // hook is large and wallets consistently underestimate the gas limit
        // on Arc's 0.5s blocks. Hard-cap well above observed usage (~5M).
        gas: 6_500_000n
      })
      setBusy('Waiting for confirmation…')
      await client.waitForTransactionReceipt({ hash })
      onLaunched(mined.hookAddress)
    } catch (e) {
      setError((e as Error).message.split('\n')[0])
      setBusy(null)
    }
  }

  return (
    <Drawer title="New launch" onClose={onClose}>
      <div className="form-row"><span className="label">Token name</span>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Acme Agent Token" /></div>
      <div className="form-row"><span className="label">Symbol</span>
        <input type="text" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="ACME" /></div>
      <div className="form-row"><span className="label">Supply (tokens)</span>
        <input type="number" value={cap} onChange={e => setCap(e.target.value)} min="1" /></div>
      <div className="form-row"><span className="label">Window (hours)</span>
        <input type="number" value={windowHours} onChange={e => setWindowHours(e.target.value)} min="0.01" step="0.01" /></div>
      <div className="form-row"><span className="label">Start rate (tokens/USDC)</span>
        <input type="number" value={minPrice} onChange={e => setMinPrice(e.target.value)} min="1" /></div>
      <div className="form-row"><span className="label">End rate (tokens/USDC)</span>
        <input type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} min="1" /></div>
      <div className="form-row"><span className="label">Hook fee (bps, ≤ 300)</span>
        <input type="number" value={feeBps} onChange={e => setFeeBps(e.target.value)} min="0" max="300" /></div>
      <div className="form-row"><span className="label">Agent wallet</span>
        <span className="mono small">{address ?? 'connect a wallet'}</span></div>

      <div className="panel-body">
        <p className="muted small">
          Half of each deposit pairs into the v4 pool at the clearing rate; the other half buys 5% of supply
          into a 12-month vesting grant for the agent and funds its inference escrow. 25% of trading fees go to
          LGE participants in perpetuity; a participant's LP locks once their booked fees equal their spend.
        </p>
        {error ? <p className="small" style={{ color: 'var(--bad-ink)' }}>{error}</p> : null}
        <Button variant="primary" disabled={!valid || busy !== null} onClick={() => void submit()}>
          {busy ?? 'Launch'}
        </Button>
      </div>
    </Drawer>
  )
}

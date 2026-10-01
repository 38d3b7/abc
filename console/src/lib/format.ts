import { formatUnits } from 'viem'

/** Native USDC on Arc has 18 decimals. Display as currency; residual on hover. */
export function fmtUsdc (wei: bigint, decimals = 2): string {
  const v = Number(formatUnits(wei, 18))
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** Full precision for hover/title: 6-dec cents plus the wei residual. */
export function fmtUsdcFull (wei: bigint): string {
  const usdc6 = wei / 1_000_000_000_000n
  const residual = wei % 1_000_000_000_000n
  const base = (Number(usdc6) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })
  return residual === 0n ? `${base} USDC` : `${base} USDC + ${residual} wei`
}

export function fmtTokens (wei: bigint): string {
  const v = Number(formatUnits(wei, 18))
  return v.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

/** ~0.5s blocks on Arc. */
export function fmtBlocks (blocks: bigint | number): string {
  const secs = Number(blocks) / 2
  if (secs < 90) return `${Math.round(secs)}s`
  if (secs < 5400) return `${Math.round(secs / 60)} min`
  return `${(secs / 3600).toFixed(1)} h`
}

export function fmtTime (unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace('T', ' ').slice(0, 19) + 'Z'
}

/** tokens-per-USDC (raw token-wei/usdc-wei ratio) → USDC per whole token, display */
export function priceToUsdcPerToken (tokensPerUsdc: bigint): string {
  if (tokensPerUsdc === 0n) return '—'
  const usdc = 1 / Number(tokensPerUsdc)
  if (usdc === 0) return '—'
  return usdc.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 })
}

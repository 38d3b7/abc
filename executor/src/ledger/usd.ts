/**
 * Dual-unit USDC amounts. Arc native USDC is 18-decimal; humans and Circle
 * think in 6-decimal USDC. Every ledger amount is stored as the pair
 * (usdc6, residualWei) with:
 *
 *   valueWei = usdc6 * 1e12 + residualWei
 *   usdc6 = trunc(valueWei / 1e12)   (toward zero)
 *   residualWei = valueWei - usdc6 * 1e12   (same sign as valueWei)
 */

export const WEI_PER_USDC6 = 1_000_000_000_000n // 1e12

export interface UsdParts {
  usdc6: bigint
  residualWei: bigint
}

export function splitUsd (valueWei: bigint): UsdParts {
  const usdc6 = valueWei / WEI_PER_USDC6 // bigint division truncates toward zero
  return { usdc6, residualWei: valueWei - usdc6 * WEI_PER_USDC6 }
}

export function joinUsd (parts: UsdParts): bigint {
  return parts.usdc6 * WEI_PER_USDC6 + parts.residualWei
}

/** Postgres numeric round-trips as string; normalize on read. */
export function partsFromRow (row: { amount_usdc6: string | number; residual_wei: string | number }): UsdParts {
  return { usdc6: BigInt(row.amount_usdc6), residualWei: BigInt(row.residual_wei) }
}

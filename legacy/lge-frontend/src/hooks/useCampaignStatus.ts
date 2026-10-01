import { useMemo } from 'react'

interface UseCampaignStatusParams {
  startBlock?: bigint
  streamBlocks?: bigint
  currentBlock?: bigint
  isLgeSuccessful?: boolean
  isLgeFinished?: boolean
  totalUserDeposit?: bigint
}

export function useCampaignStatus({
  startBlock,
  streamBlocks,
  currentBlock,
  isLgeSuccessful,
  isLgeFinished,
  totalUserDeposit
}: UseCampaignStatusParams) {
  const campaignEnded = useMemo(() => {
    if (!startBlock || !streamBlocks || !currentBlock) return false
    const endBlock = startBlock + streamBlocks
    return currentBlock >= endBlock
  }, [startBlock, streamBlocks, currentBlock])

  const canWithdraw = useMemo(() => {
    return Boolean(campaignEnded && totalUserDeposit && totalUserDeposit > 0n)
  }, [campaignEnded, totalUserDeposit])

  const canClaimLiquidity = useMemo(() => {
    return Boolean(
      Boolean(isLgeSuccessful) &&
        Boolean(isLgeFinished) &&
        totalUserDeposit &&
        totalUserDeposit > 0n
    )
  }, [isLgeSuccessful, isLgeFinished, totalUserDeposit])

  return {
    campaignEnded,
    canWithdraw,
    canClaimLiquidity
  }
}

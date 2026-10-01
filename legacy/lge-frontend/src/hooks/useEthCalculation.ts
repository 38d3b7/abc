import { useState, useEffect, useMemo } from 'react'
import { usePublicClient, useChainId } from 'wagmi'
import { parseEther } from 'viem'
import { LGE_CALCULATIONS_LIBRARY_ABI } from '../config/contracts/abis/LGECalculationsLibraryAbi'
import { getChainConfig } from '../config/chainConfig'

interface UseEthCalculationParams {
  tokenAmount: string
  currentBlock?: bigint
  startBlock?: bigint
}

export function useEthCalculation ({
  tokenAmount,
  currentBlock,
  startBlock
}: UseEthCalculationParams) {
  const publicClient = usePublicClient()
  const chainId = useChainId()
  const calculationsLibrary = getChainConfig(chainId)?.calculationsLibrary
  const [ethExpected, setEthExpected] = useState<bigint | undefined>(undefined)

  const tokenAmountWithDecimals = useMemo(() => {
    if (!tokenAmount || tokenAmount === '') return undefined
    try {
      return parseEther(tokenAmount)
    } catch {
      return undefined
    }
  }, [tokenAmount])

  useEffect(() => {
    if (
      !publicClient ||
      !calculationsLibrary ||
      !currentBlock ||
      !startBlock ||
      !tokenAmountWithDecimals
    ) {
      return
    }

    const fetchEthNeeded = async () => {
      try {
        // calculateEthNeeded(currentBlock, startBlock, amountOfTokens)
        const eth = await publicClient.readContract({
          address: calculationsLibrary,
          abi: LGE_CALCULATIONS_LIBRARY_ABI,
          functionName: 'calculateEthNeeded',
          args: [currentBlock, startBlock, tokenAmountWithDecimals]
        })
        setEthExpected(eth as bigint)
      } catch (error) {
        console.error('Error fetching native amount needed:', error)
        setEthExpected(undefined)
      }
    }

    fetchEthNeeded()
  }, [
    publicClient,
    calculationsLibrary,
    currentBlock,
    startBlock,
    tokenAmountWithDecimals
  ])

  const ethWithSlippage = useMemo(() => {
    if (!ethExpected) return undefined
    return (ethExpected * 105n) / 100n
  }, [ethExpected])

  return {
    tokenAmountWithDecimals,
    ethExpected,
    ethWithSlippage
  }
}

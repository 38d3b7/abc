import { useChainId } from 'wagmi'
import { getChainConfig, ChainConfig } from '../config/chainConfig'

export function useChainConfig (): ChainConfig | undefined {
  const chainId = useChainId()
  return getChainConfig(chainId)
}

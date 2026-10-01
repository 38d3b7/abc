import { useState, useEffect } from "react";
import { usePublicClient, useChainId } from "wagmi";
import { LGE_CALCULATIONS_LIBRARY_ABI } from "../config/contracts/abis/LGECalculationsLibraryAbi";
import { getChainConfig } from "../config/chainConfig";
import { UseCampaignPriceParams } from "../types";

export function useCampaignPrice({
  startingPrice,
  endingPrice,
  currentBlock,
  startBlock,
}: UseCampaignPriceParams) {
  const [currentPrice, setCurrentPrice] = useState<bigint | null>(null);
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const calculationsLibrary = getChainConfig(chainId)?.calculationsLibrary;

  useEffect(() => {
    if (
      !publicClient ||
      !startingPrice ||
      !endingPrice ||
      !currentBlock ||
      !startBlock ||
      !calculationsLibrary
    ) {
      return;
    }

    const fetchPrice = async () => {
      try {
        const price = await publicClient.readContract({
          address: calculationsLibrary,
          abi: LGE_CALCULATIONS_LIBRARY_ABI,
          functionName: "calculateCurrentTokenPrice",
          args: [currentBlock, startBlock],
        });
        setCurrentPrice(price as bigint);
      } catch (error) {
        console.error("Error fetching price:", error);
        setCurrentPrice(null);
      }
    };

    fetchPrice();
  }, [
    publicClient,
    startingPrice,
    endingPrice,
    currentBlock,
    startBlock,
    calculationsLibrary,
  ]);

  const calculatePriceProgress = () => {
    if (!startingPrice || !endingPrice || !currentPrice) return 0;

    const startingTokensPerETH = parseFloat(startingPrice) / 1e18;
    const endingTokensPerETH = parseFloat(endingPrice) / 1e18;
    const currentTokensPerETH = parseFloat(currentPrice.toString()) / 1e18;

    const totalRange = startingTokensPerETH - endingTokensPerETH;
    const currentRange = startingTokensPerETH - currentTokensPerETH;

    if (totalRange === 0) return 0;
    return Math.min(Math.max((currentRange / totalRange) * 100, 0), 100);
  };

  return {
    currentPrice,
    priceProgress: calculatePriceProgress(),
  };
}

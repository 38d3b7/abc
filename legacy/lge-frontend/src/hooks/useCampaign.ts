import { useState, useEffect } from "react";
import { useReadContract, useChainId } from "wagmi";
import { useBlockData } from "./useBlockData";
import { useCampaignData } from "./useCampaignData";
import { useCampaignTime } from "./useCampaignTime";
import { useETHPrice } from "./useETHPrice";
import { UseCampaignParams } from "../types";
import { LGE_CALCULATIONS_LIBRARY_ABI } from "../config/contracts/abis/LGECalculationsLibraryAbi";
import { getChainConfig } from "../config/chainConfig";

export function useCampaign({
  hookAddress,
  campaignDuration,
}: UseCampaignParams) {
  const [currentPrice, setCurrentPrice] = useState<bigint | null>(null);
  const chainId = useChainId();
  const calculationsLibrary = getChainConfig(chainId)?.calculationsLibrary;

  const { currentBlock, publicClient } = useBlockData();

  const {
    startBlock,
    totalTokensPurchased,
    totalTokenSupply,
    lpProgress,
    remainingTokens,
  } = useCampaignData({ hookAddress });

  const { data: minTokenPrice } = useReadContract({
    address: calculationsLibrary,
    abi: LGE_CALCULATIONS_LIBRARY_ABI,
    functionName: "MIN_TOKEN_PRICE",
    query: { enabled: !!calculationsLibrary },
  });

  const { data: maxTokenPrice } = useReadContract({
    address: calculationsLibrary,
    abi: LGE_CALCULATIONS_LIBRARY_ABI,
    functionName: "MAX_TOKEN_PRICE",
    query: { enabled: !!calculationsLibrary },
  });

  useEffect(() => {
    if (!publicClient || !currentBlock || !startBlock || !calculationsLibrary) {
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
  }, [publicClient, currentBlock, startBlock, calculationsLibrary]);

  const calculatePriceProgress = () => {
    if (!minTokenPrice || !maxTokenPrice || !currentPrice) return 0;

    const startingTokensPerETH = Number(minTokenPrice);
    const endingTokensPerETH = Number(maxTokenPrice);
    const currentTokensPerETH = Number(currentPrice);

    const totalRange = startingTokensPerETH - endingTokensPerETH;
    const currentRange = startingTokensPerETH - currentTokensPerETH;

    if (totalRange === 0) return 0;
    return Math.min(Math.max((currentRange / totalRange) * 100, 0), 100);
  };

  const priceProgress = calculatePriceProgress();

  const { timeProgress, countdown, isEnded, isStarted } = useCampaignTime({
    startBlock,
    currentBlock,
    campaignDuration,
  });

  const { ethPrice } = useETHPrice();

  const getCurrentUSDPrice = () => {
    if (!currentPrice || !ethPrice) return "0.00000";
    const tokensPerETH = parseFloat(currentPrice.toString());
    if (tokensPerETH === 0) return "0.00000";
    const ethPerToken = 1 / tokensPerETH;
    const usdPerToken = ethPerToken * ethPrice;
    return usdPerToken.toFixed(5);
  };

  return {
    currentBlock,
    publicClient,
    startBlock,
    totalTokensPurchased,
    totalTokenSupply,
    lpProgress,
    remainingTokens,
    currentPrice,
    priceProgress,
    ethPrice,
    currentUSDPrice: getCurrentUSDPrice(),
    timeProgress,
    countdown,
    isEnded,
    isStarted,
  };
}

import { useReadContract } from "wagmi";
import { LGE_HOOK_ABI } from "../config/contracts/abis/LGEHookAbi";
import { UseCampaignDataParams } from "../types";
import { LGE_TOKEN_ABI } from "../config/contracts/abis/LGETokenAbi";

export function useCampaignData({
  hookAddress,
  tokenAddress,
}: UseCampaignDataParams) {
  const { data: startBlock } = useReadContract({
    address: hookAddress as `0x${string}`,
    abi: LGE_HOOK_ABI,
    functionName: "startBlock",
  });

  const { data: totalTokensClaimed } = useReadContract({
    address: hookAddress as `0x${string}`,
    abi: LGE_HOOK_ABI,
    functionName: "totalTokensClaimed",
  });

  const { data: totalSupply } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: LGE_TOKEN_ABI,
    functionName: "TOTAL_SUPPLY",
  });

  const calculateLPProgress = () => {
    if (!totalTokensClaimed || !totalSupply) return 0;

    const purchased = parseFloat(totalTokensClaimed.toString()) / 1e18;
    const supply = parseFloat(totalSupply.toString()) / 1e18;

    if (supply === 0) return 0;

    const progress = (purchased / supply) * 100;
    return Math.min(Math.max(progress, 0), 100);
  };

  const calculateRemainingTokens = () => {
    if (!totalSupply) return 0;

    const supply = parseFloat(totalSupply.toString()) / 1e18;

    if (!totalTokensClaimed) return supply;

    const purchased = parseFloat(totalTokensClaimed.toString()) / 1e18;

    return supply - purchased;
  };

  return {
    startBlock: startBlock as bigint | undefined,
    totalTokensPurchased: totalTokensClaimed as bigint | undefined,
    totalTokenSupply: totalSupply as bigint | undefined,
    lpProgress: calculateLPProgress(),
    remainingTokens: calculateRemainingTokens(),
  };
}

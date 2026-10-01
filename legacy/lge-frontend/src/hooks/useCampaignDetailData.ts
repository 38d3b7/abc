import { useMemo } from "react";
import { useReadContract, useChainId } from "wagmi";
import { LGE_HOOK_ABI } from "../config/contracts/abis/LGEHookAbi";
import { getChainConfig } from "../config/chainConfig";
import { LGE_CALCULATIONS_LIBRARY_ABI } from "../config/contracts/abis/LGECalculationsLibraryAbi";

export function useCampaignDetailData(
  campaignAddress?: string,
  userAddress?: string,
) {
  const chainId = useChainId();
  const calculationsLibrary = getChainConfig(chainId)?.calculationsLibrary;

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

  const { data: totalDeposits } = useReadContract({
    address: campaignAddress as `0x${string}`,
    abi: LGE_HOOK_ABI,
    functionName: "totalDeposits",
    query: { enabled: !!campaignAddress },
  });

  const { data: tokenAddress } = useReadContract({
    address: campaignAddress as `0x${string}`,
    abi: LGE_HOOK_ABI,
    functionName: "token",
    query: { enabled: !!campaignAddress },
  });

  const { data: userState } = useReadContract({
    address: campaignAddress as `0x${string}`,
    abi: LGE_HOOK_ABI,
    functionName: "userStates",
    args: userAddress ? [userAddress as `0x${string}`] : undefined,
    query: { enabled: !!(campaignAddress && userAddress) },
  });

  const { data: streamBlocks } = useReadContract({
    address: campaignAddress as `0x${string}`,
    abi: LGE_HOOK_ABI,
    functionName: "STREAM_BLOCKS",
    query: { enabled: !!campaignAddress },
  });

  const { data: isLgeSuccessful } = useReadContract({
    address: campaignAddress as `0x${string}`,
    abi: LGE_HOOK_ABI,
    functionName: "isLgeSuccessful",
    query: { enabled: !!campaignAddress },
  });

  const { data: isLgeFinished } = useReadContract({
    address: campaignAddress as `0x${string}`,
    abi: LGE_HOOK_ABI,
    functionName: "isLgeFinished",
    query: { enabled: !!campaignAddress },
  });

  // Calculate total user deposit
  const totalUserDeposit = useMemo(() => {
    if (userState && Array.isArray(userState)) {
      return (
        ((userState as readonly unknown[])[0] as bigint) +
        ((userState as readonly unknown[])[1] as bigint)
      );
    }
    return 0n;
  }, [userState]);

  return {
    minTokenPrice: minTokenPrice as bigint | undefined,
    maxTokenPrice: maxTokenPrice as bigint | undefined,
    totalDeposits: totalDeposits as bigint | undefined,
    tokenAddress,
    userState,
    streamBlocks: streamBlocks as bigint | undefined,
    isLgeSuccessful: Boolean(isLgeSuccessful),
    isLgeFinished: Boolean(isLgeFinished),
    totalUserDeposit,
  };
}

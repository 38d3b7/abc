import { useState, useEffect } from "react";
import { usePublicClient } from "wagmi";
import { getAllCampaigns } from "../services/api/campaign";
import { getUser } from "../services/api/user";
import { LGE_HOOK_ABI } from "../config/contracts/abis/LGEHookAbi";
import { User, TokenData } from "../types";

export function useUserTokens(address?: string) {
  const publicClient = usePublicClient();
  const [userData, setUserData] = useState<User | null>(null);
  const [userTokens, setUserTokens] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!address || !publicClient) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const userResponse = await getUser(address);
        setUserData(userResponse.data);

        const campaignsResponse = await getAllCampaigns();

        const tokensData: TokenData[] = [];

        for (const campaign of campaignsResponse.data) {
          try {
            const userState = (await publicClient.readContract({
              address: campaign.hookAddress as `0x${string}`,
              abi: LGE_HOOK_ABI,
              functionName: "userStates",
              args: [address as `0x${string}`],
            })) as [bigint, bigint, bigint, boolean];

            const startBlock = await publicClient.readContract({
              address: campaign.hookAddress as `0x${string}`,
              abi: LGE_HOOK_ABI,
              functionName: "startBlock",
            });

            const totalBlocks = await publicClient.readContract({
              address: campaign.hookAddress as `0x${string}`,
              abi: LGE_HOOK_ABI,
              functionName: "TOTAL_BLOCKS",
            });

            const isLgeSuccessful = await publicClient.readContract({
              address: campaign.hookAddress as `0x${string}`,
              abi: LGE_HOOK_ABI,
              functionName: "isLgeSuccessful",
            });

            const isLgeFinished = await publicClient.readContract({
              address: campaign.hookAddress as `0x${string}`,
              abi: LGE_HOOK_ABI,
              functionName: "isLgeFinished",
            });

            if (userState[2] > 0n) {
              tokensData.push({
                id: campaign.id,
                hookAddress: campaign.hookAddress,
                tokenAddress: campaign.tokenAddress,
                tokenName: campaign.tokenName,
                tokenSymbol: campaign.tokenSymbol,
                tokenImageUrl: campaign.tokenImageUrl,
                tokensToLiquidity: userState[2],
                ethToLiquidityDeposited: userState[0],
                remainingEthDeposited: userState[1],
                hasClaimed: userState[3],
                startBlock: startBlock as bigint,
                totalBlocks: totalBlocks as bigint,
                isLgeSuccessful: Boolean(isLgeSuccessful),
                isLgeFinished: Boolean(isLgeFinished),
              });
            }
          } catch (campaignError) {
            console.error(
              `Error fetching data for campaign ${campaign.id}:`,
              campaignError,
            );
          }
        }

        setUserTokens(tokensData);
      } catch (err) {
        console.error("Error fetching user data:", err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [address, publicClient]);

  return { userData, userTokens, loading, error };
}

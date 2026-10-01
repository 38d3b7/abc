import { useState } from "react";
import { useWriteContract, useReadContract, useChainId } from "wagmi";
import toast from "react-hot-toast";
import { decodeEventLog } from "viem";
import { LGE_MANAGER_ABI } from "../config/contracts/abis/LGEManagerAbi";
import { LGE_CALCULATIONS_LIBRARY_ABI } from "../config/contracts/abis/LGECalculationsLibraryAbi";
import { HOOK_MINER_ABI } from "../config/contracts/abis/HookMinerAbi";
import { getChainConfig } from "../config/chainConfig";
import { createCampaign as createCampaignApi } from "../services/api/campaign";
import { UseCreateCampaignParams } from "../types";

export function useCreateCampaign({
  publicClient,
  onSuccess,
}: UseCreateCampaignParams) {
  const [isCreating, setIsCreating] = useState(false);
  const { writeContractAsync } = useWriteContract();
  const chainId = useChainId();
  const chainConfig = getChainConfig(chainId);

  const { data: FLAGS } = useReadContract({
    address: chainConfig?.lgeManager,
    abi: LGE_MANAGER_ABI,
    functionName: "FLAGS",
    query: { enabled: !!chainConfig?.lgeManager },
  });

  const { data: MIN_TOKEN_PRICE } = useReadContract({
    address: chainConfig?.calculationsLibrary,
    abi: LGE_CALCULATIONS_LIBRARY_ABI,
    functionName: "MIN_TOKEN_PRICE",
    query: { enabled: !!chainConfig?.calculationsLibrary },
  });

  const { data: MAX_TOKEN_PRICE } = useReadContract({
    address: chainConfig?.calculationsLibrary,
    abi: LGE_CALCULATIONS_LIBRARY_ABI,
    functionName: "MAX_TOKEN_PRICE",
    query: { enabled: !!chainConfig?.calculationsLibrary },
  });

  const useHookMiner = (hookConstructorArgs?: `0x${string}`) => {
    return useReadContract({
      address: chainConfig?.hookMiner,
      abi: HOOK_MINER_ABI,
      functionName: "find",
      args: [
        chainConfig?.lgeManager as `0x${string}`,
        FLAGS as bigint,
        chainConfig?.hookBytecode as `0x${string}`,
        hookConstructorArgs,
      ],
      query: {
        enabled: !!(
          chainConfig?.hookMiner &&
          chainConfig?.lgeManager &&
          chainConfig?.hookBytecode &&
          FLAGS &&
          hookConstructorArgs
        ),
      },
    });
  };

  const createCampaign = async (params: {
    address: string;
    tokenName: string;
    tokenSymbol: string;
    imageUrl: string;
    metadata: string;
    hash?: `0x${string}`;
    lockedBlockNumber: bigint;
    hookMinerData?: [string, `0x${string}`];
    tokenAddressComputed?: string;
  }) => {
    const {
      address,
      tokenName,
      tokenSymbol,
      imageUrl,
      metadata,
      hash,
      lockedBlockNumber,
      hookMinerData,
      tokenAddressComputed,
    } = params;

    if (!hookMinerData || !hash) {
      throw new Error("Hook miner data or hash not available");
    }

    if (!chainConfig?.lgeManager) {
      throw new Error("Unsupported chain: no LGE manager configured");
    }

    setIsCreating(true);

    try {
      const tokenConfigArgs = {
        tokenAdmin: address as `0x${string}`,
        name: tokenName,
        symbol: tokenSymbol,
        image: imageUrl,
        metadata: metadata,
        tokenSalt: hash,
      };

      const hookSalt = hookMinerData[1];

      const txHash = await writeContractAsync({
        address: chainConfig.lgeManager,
        abi: LGE_MANAGER_ABI,
        functionName: "deployToken",
        args: [
          {
            tokenConfig: tokenConfigArgs,
            hookConfig: {
              hookSalt: hookSalt,
              startBlock: lockedBlockNumber,
            },
          },
        ],
      });

      const receipt = await publicClient?.waitForTransactionReceipt({
        hash: txHash,
      });

      if (!receipt) {
        throw new Error("Failed to get transaction receipt");
      }

      let tokenAddress: string | undefined;
      let hookAddress: string | undefined;

      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: LGE_MANAGER_ABI,
            data: log.data,
            topics: log.topics,
          });

          if (decoded.eventName === "TokenCreated") {
            tokenAddress = (decoded.args as any).tokenAddress;
            hookAddress = (decoded.args as any).hookAddress;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!tokenAddress || !hookAddress) {
        tokenAddress = tokenAddressComputed;
        hookAddress = hookMinerData[0];

        if (!tokenAddress || !hookAddress) {
          throw new Error("Could not determine token or hook address");
        }
      }

      await createCampaignApi({
        walletAddress: address,
        tokenName,
        tokenSymbol,
        tokenImageUrl: imageUrl,
        metadata,
        startingPrice: MIN_TOKEN_PRICE?.toString() ?? "0",
        endingPrice: MAX_TOKEN_PRICE?.toString() ?? "0",
        hookAddress,
        tokenAddress,
      });

      toast.success("Campaign created successfully!");
      onSuccess?.();

      return { tokenAddress, hookAddress };
    } catch (error: any) {
      console.error("Campaign creation error:", error);
      toast.error(
        `Failed to create campaign: ${error.message || "Unknown error"}`
      );
      throw error;
    } finally {
      setIsCreating(false);
    }
  };

  return {
    isCreating,
    createCampaign,
    useHookMiner,
    FLAGS,
  };
}

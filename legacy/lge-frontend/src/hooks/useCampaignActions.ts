import { useState } from "react";
import { useWriteContract } from "wagmi";
import { parseEther } from "viem";
import toast from "react-hot-toast";
import { LGE_HOOK_ABI } from "../config/contracts/abis/LGEHookAbi";

export function useCampaignActions() {
  const { writeContractAsync } = useWriteContract();
  const [isDepositing, setIsDepositing] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  const deposit = async (
    campaignAddress: string,
    tokenAmount: string,
    ethWithSlippage: bigint,
  ) => {
    if (!campaignAddress || !tokenAmount || !ethWithSlippage) {
      toast.error("Missing required parameters");
      return;
    }

    try {
      setIsDepositing(true);
      const tokenAmountWithDecimals = parseEther(tokenAmount);

      await writeContractAsync({
        address: campaignAddress as `0x${string}`,
        abi: LGE_HOOK_ABI,
        functionName: "deposit",
        args: [tokenAmountWithDecimals],
        value: ethWithSlippage,
      });

      toast.success("Deposit successful!");
      return true;
    } catch (error: any) {
      console.error("Deposit error:", error);
      toast.error(`Deposit failed: ${error.message || "Unknown error"}`);
      return false;
    } finally {
      setIsDepositing(false);
    }
  };

  const withdraw = async (campaignAddress: string) => {
    if (!campaignAddress) {
      toast.error("Campaign address required");
      return;
    }

    try {
      setIsWithdrawing(true);

      await writeContractAsync({
        address: campaignAddress as `0x${string}`,
        abi: LGE_HOOK_ABI,
        functionName: "withdraw",
        args: [],
      });

      toast.success("Withdrawal successful!");
      return true;
    } catch (error: any) {
      console.error("Withdrawal error:", error);
      toast.error(`Withdrawal failed: ${error.message || "Unknown error"}`);
      return false;
    } finally {
      setIsWithdrawing(false);
    }
  };

  const claimLiquidity = async (campaignAddress: string) => {
    if (!campaignAddress) {
      toast.error("Campaign address required");
      return;
    }

    try {
      setIsClaiming(true);

      await writeContractAsync({
        address: campaignAddress as `0x${string}`,
        abi: LGE_HOOK_ABI,
        functionName: "claimLiquidity",
        args: [],
      });

      toast.success("LP tokens claimed successfully!");
      return true;
    } catch (error: any) {
      console.error("Claim error:", error);
      toast.error(`Claim failed: ${error.message || "Unknown error"}`);
      return false;
    } finally {
      setIsClaiming(false);
    }
  };

  return {
    deposit,
    withdraw,
    claimLiquidity,
    isDepositing,
    isWithdrawing,
    isClaiming,
  };
}

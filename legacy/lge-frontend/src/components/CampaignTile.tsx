import { Link } from "react-router-dom";
import { useReadContract } from "wagmi";
import { MemeCoinDisplay } from "./MemeCoinDisplay";
import { useCampaign } from "../hooks";
import { CampaignTileProps } from "../types";
import { LGE_HOOK_ABI } from "../config/contracts/abis/LGEHookAbi";

export function CampaignTile({ campaign }: CampaignTileProps) {
  const { data: streamBlocks } = useReadContract({
    address: campaign.hookAddress as `0x${string}`,
    abi: LGE_HOOK_ABI,
    functionName: "STREAM_BLOCKS",
  });

  const { countdown, lpProgress, currentUSDPrice } = useCampaign({
    hookAddress: campaign.hookAddress,
    campaignDuration: streamBlocks ? Number(streamBlocks) : undefined,
  });

  const timeRemaining = {
    days: parseInt(countdown.days),
    hours: parseInt(countdown.hours),
    minutes: parseInt(countdown.minutes),
    seconds: parseInt(countdown.seconds),
  };

  return (
    <Link to={`/campaign/${campaign.hookAddress}`} className="campaign-tile">
      <MemeCoinDisplay
        imageUrl={campaign.tokenImageUrl}
        tokenName={campaign.tokenName}
        tokenSymbol={campaign.tokenSymbol}
        timeRemaining={timeRemaining}
        progressPercentage={lpProgress}
        currentPrice={currentUSDPrice}
      />
    </Link>
  );
}

import { useState, useEffect, useMemo } from "react";
import { useReadContract } from "wagmi";
import { MemeCoinTile } from "./MemeCoinTile";
import { BuyTokensModal } from "./BuyTokensModal";
import {
  useBlockData,
  useCampaignData,
  useCampaignPrice,
  useCampaignTime,
  useCampaignDetailData,
  useETHPrice,
} from "../hooks";
import { GeometricCampaignTileProps } from "../types";
import { LGE_HOOK_ABI } from "../config/contracts/abis/LGEHookAbi";

export function GeometricCampaignTile({
  campaign,
}: GeometricCampaignTileProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tileSize, setTileSize] = useState(360);

  const { data: streamBlocks } = useReadContract({
    address: campaign.hookAddress as `0x${string}`,
    abi: LGE_HOOK_ABI,
    functionName: "STREAM_BLOCKS",
  });

  const { currentBlock } = useBlockData();
  const { startBlock, lpProgress } = useCampaignData({
    hookAddress: campaign.hookAddress,
    tokenAddress: campaign.tokenAddress,
  });
  const { priceProgress } = useCampaignPrice({
    startingPrice: campaign.startingPrice,
    endingPrice: campaign.endingPrice,
    currentBlock,
    startBlock,
  });
  const { timeProgress, countdown } = useCampaignTime({
    startBlock,
    currentBlock,
    campaignDuration: streamBlocks ? Number(streamBlocks) : undefined,
  });
  const { minTokenPrice, maxTokenPrice } = useCampaignDetailData(
    campaign.hookAddress
  );
  const { ethPrice } = useETHPrice();

  const minPriceUsd = useMemo(() => {
    if (!minTokenPrice || !ethPrice) return 0.001;
    const tokensPerETH = parseFloat(minTokenPrice.toString());
    if (tokensPerETH === 0) return 0.001;
    const ethPerToken = 1 / tokensPerETH;
    return ethPerToken * ethPrice;
  }, [minTokenPrice, ethPrice]);

  const maxPriceUsd = useMemo(() => {
    if (!maxTokenPrice || !ethPrice) return 0.05;
    const tokensPerETH = parseFloat(maxTokenPrice.toString());
    if (tokensPerETH === 0) return 0.05;
    const ethPerToken = 1 / tokensPerETH;
    return ethPerToken * ethPrice;
  }, [maxTokenPrice, ethPrice]);

  useEffect(() => {
    const updateSize = () => {
      const width = window.innerWidth;
      if (width < 600) {
        setTileSize(Math.min(width - 32, 360));
      } else if (width < 1000) {
        setTileSize(320);
      } else {
        setTileSize(360);
      }
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const customContent = (
    <div className="campaign-tile-content">
      {campaign.tokenImageUrl ? (
        <img
          src={campaign.tokenImageUrl}
          alt={campaign.tokenName}
          className="campaign-tile-image"
        />
      ) : (
        <div className="campaign-tile-placeholder">
          <div className="campaign-tile-token-name">{campaign.tokenName}</div>
          <div className="campaign-tile-token-symbol">
            {campaign.tokenSymbol}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <MemeCoinTile
        width={tileSize}
        height={tileSize}
        lpProgress={lpProgress}
        timeProgress={timeProgress}
        priceProgress={priceProgress}
        tokenName={campaign.tokenName}
        tokenSymbol={campaign.tokenSymbol}
        minPrice={minPriceUsd}
        maxPrice={maxPriceUsd}
        countdown={countdown}
        onClick={() => setIsModalOpen(true)}
        animateProgress={true}
        showGlitch={true}
        customContent={customContent}
      />

      <BuyTokensModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        campaign={campaign}
      />
    </>
  );
}

import React, { useState, useEffect, useMemo } from "react";
import { usePublicClient, useWriteContract, useChainId } from "wagmi";
import { parseEther } from "viem";
import { usePrivy } from "@privy-io/react-auth";
import toast from "react-hot-toast";
import { LGE_CALCULATIONS_LIBRARY_ABI } from "../config/contracts/abis/LGECalculationsLibraryAbi";
import { LGE_HOOK_ABI } from "../config/contracts/abis/LGEHookAbi";
import { getChainConfig } from "../config/chainConfig";
import { useCampaignData, useETHPrice, useBlockData } from "../hooks";
import { BuyTokensModalProps } from "../types";

export function BuyTokensModal({
  isOpen,
  onClose,
  campaign,
}: BuyTokensModalProps) {
  const [tokenAmount, setTokenAmount] = useState<string>("0");
  const [ethCost, setEthCost] = useState<number>(0);
  const [usdCost, setUsdCost] = useState<number>(0);
  const [showPreview, setShowPreview] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [ethExpected, setEthExpected] = useState<bigint | null>(null);
  const [isDepositing, setIsDepositing] = useState(false);

  const { totalTokenSupply, remainingTokens, startBlock } = useCampaignData({
    hookAddress: campaign.hookAddress,
    tokenAddress: campaign.tokenAddress,
  });
  const { ethPrice } = useETHPrice();
  const { currentBlock } = useBlockData();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const chainConfig = getChainConfig(chainId);
  const calculationsLibrary = chainConfig?.calculationsLibrary;
  const currencySymbol = chainConfig?.currencySymbol ?? "ETH";
  const { writeContractAsync } = useWriteContract();
  const { authenticated } = usePrivy();

  const isAuthenticated = Boolean(authenticated);

  useEffect(() => {
    if (isOpen) {
      setShowPreview(true);
      setIsFading(false);

      const timer = setTimeout(() => {
        setIsFading(true);
        setTimeout(() => {
          setShowPreview(false);
          setIsFading(false);
        }, 500);
      }, 1000);

      return () => clearTimeout(timer);
    } else {
      setShowPreview(false);
      setIsFading(false);
    }
  }, [isOpen]);

  const tokenAmountWithDecimals = useMemo(() => {
    if (!tokenAmount || tokenAmount === "" || tokenAmount === "0")
      return undefined;
    try {
      return parseEther(tokenAmount);
    } catch {
      return undefined;
    }
  }, [tokenAmount]);

  useEffect(() => {
    console.log("calculateEthNeeded dependencies:", {
      publicClient: !!publicClient,
      currentBlock: currentBlock?.toString(),
      startBlock: startBlock?.toString(),
      tokenAmountWithDecimals: tokenAmountWithDecimals?.toString(),
    });

    if (
      !publicClient ||
      !calculationsLibrary ||
      !currentBlock ||
      !startBlock ||
      !tokenAmountWithDecimals
    ) {
      setEthExpected(null);
      return;
    }

    const fetchEthNeeded = async () => {
      try {
        console.log("Calling calculateEthNeeded with args:", [
          tokenAmountWithDecimals.toString(),
          currentBlock.toString(),
          startBlock.toString(),
        ]);
        const eth = await publicClient.readContract({
          address: calculationsLibrary,
          abi: LGE_CALCULATIONS_LIBRARY_ABI,
          functionName: "calculateEthNeeded",
          args: [currentBlock, startBlock, tokenAmountWithDecimals],
        });
        console.log("calculateEthNeeded result:", eth?.toString());
        setEthExpected(eth as bigint);
      } catch (error) {
        console.error("Error fetching ETH needed:", error);
        setEthExpected(null);
      }
    };

    fetchEthNeeded();
  }, [
    publicClient,
    calculationsLibrary,
    currentBlock,
    startBlock,
    tokenAmountWithDecimals,
  ]);

  const ethWithSlippage = useMemo(() => {
    if (!ethExpected) return undefined;
    return (ethExpected * 105n) / 100n;
  }, [ethExpected]);

  useEffect(() => {
    console.log("Calculating costs:", {
      ethExpected: ethExpected?.toString(),
      ethPrice,
    });
    if (ethExpected && ethPrice) {
      const ethCostValue = parseFloat(ethExpected.toString()) / 1e18;
      console.log(
        "Setting ethCost:",
        ethCostValue,
        "usdCost:",
        ethCostValue * ethPrice
      );
      setEthCost(ethCostValue);
      setUsdCost(ethCostValue * ethPrice);
    } else {
      setEthCost(0);
      setUsdCost(0);
    }
  }, [ethExpected, ethPrice]);

  const totalSupplyFormatted = totalTokenSupply
    ? Number(totalTokenSupply) / 1e18
    : 0;

  const percentageRemaining =
    totalSupplyFormatted > 0
      ? (remainingTokens / totalSupplyFormatted) * 100
      : 0;

  const percentageSold = 100 - percentageRemaining;

  // Note: Progress calculations commented out as they're not currently displayed in the UI
  // Uncomment when implementing visual progress indicators

  // const progressPercentage = (() => {
  //   if (!totalPurchased || !totalSupply) return 0;
  //   const purchased = parseFloat(totalPurchased.toString()) / 1e18;
  //   const supply = parseFloat(totalSupply.toString()) / 1e18;
  //   if (supply === 0) return 0;
  //   const progress = (purchased / supply) * 100;
  //   return Math.min(Math.max(progress, 0), 100);
  // })();

  // const priceProgress = (() => {
  //   if (!campaign.startingPrice || !campaign.endingPrice || !currentPrice) return 0;
  //   const startingTokensPerETH = parseFloat(campaign.startingPrice) / 1e18;
  //   const endingTokensPerETH = parseFloat(campaign.endingPrice) / 1e18;
  //   const currentTokensPerETH = parseFloat(currentPrice.toString()) / 1e18;
  //   const totalRange = startingTokensPerETH - endingTokensPerETH;
  //   const currentRange = startingTokensPerETH - currentTokensPerETH;
  //   if (totalRange === 0) return 0;
  //   return Math.min(Math.max((currentRange / totalRange) * 100, 0), 100);
  // })();

  // const timeProgress = Math.random() * 60 + 20;

  const handlePercentageClick = (percentage: number) => {
    const amount = ((remainingTokens * percentage) / 100).toString();
    setTokenAmount(amount);
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTokenAmount(e.target.value);
  };

  const handleBuy = async () => {
    if (!isAuthenticated) {
      toast.error("Please connect your wallet");
      return;
    }

    if (!tokenAmount || tokenAmount === "0") {
      toast.error("Please enter a token amount");
      return;
    }

    if (!tokenAmountWithDecimals || !ethWithSlippage) {
      toast.error("Invalid token amount or price not available");
      return;
    }

    try {
      setIsDepositing(true);

      await writeContractAsync({
        address: campaign.hookAddress as `0x${string}`,
        abi: LGE_HOOK_ABI,
        functionName: "deposit",
        args: [tokenAmountWithDecimals],
        value: ethWithSlippage,
      });

      toast.success("Deposit successful!");
      setTokenAmount("0");
      onClose();
    } catch (error: any) {
      console.error("Deposit error:", error);
      toast.error(`Deposit failed: ${error.message || "Unknown error"}`);
    } finally {
      setIsDepositing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {showPreview ? (
          <div className={`preview-view ${isFading ? "fade-out" : ""}`}>
            {campaign.tokenImageUrl ? (
              <img src={campaign.tokenImageUrl} alt={campaign.tokenName} />
            ) : (
              <div className="preview-placeholder">
                <div className="token-name">{campaign.tokenName}</div>
                <div className="token-symbol">{campaign.tokenSymbol}</div>
              </div>
            )}
          </div>
        ) : (
          <div className={`details-view ${!showPreview ? "fade-in" : ""}`}>
            <div className="modal-header">
              <h2>
                {showHelp
                  ? "How LGE Works"
                  : `Buy $${campaign.tokenSymbol} Tokens`}
              </h2>
              <div className="header-actions">
                {!showHelp && (
                  <button
                    className="help-button"
                    onClick={() => setShowHelp(true)}
                    title="How LGE Works"
                  >
                    ?
                  </button>
                )}
                <button
                  className="close-button"
                  onClick={showHelp ? () => setShowHelp(false) : onClose}
                >
                  ×
                </button>
              </div>
            </div>

            <div className="modal-body">
              {showHelp ? (
                <div className="help-content-simple">
                  <p>
                    The token rate starts low and rises over time - early buyers
                    get fewer tokens per {currencySymbol}, while later buyers
                    get more tokens per {currencySymbol}. If the LGE does not
                    sell 100% of tokens, all participants recover all of their{" "}
                    {currencySymbol} but if the LGE was a success (100% of
                    tokens were sold) a liquidity position is created and
                    participants own a share of this liquidity in proportion to
                    the share of the token supply they acquired. Participants
                    can claim their LP anytime.
                  </p>
                </div>
              ) : (
                <>
                  <div className="token-info-compact">
                    <div className="tokens-remaining">
                      <div className="tokens-number">
                        {remainingTokens.toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })}
                      </div>
                      <div className="tokens-label">
                        {campaign.tokenSymbol} remaining (
                        {percentageRemaining.toFixed(1)}%)
                      </div>
                    </div>

                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${percentageSold}%` }}
                      />
                    </div>
                  </div>

                  <div className="buy-section">
                    <div className="percentage-buttons">
                      <button onClick={() => handlePercentageClick(100)}>
                        ALL
                      </button>
                      <button onClick={() => handlePercentageClick(75)}>
                        75%
                      </button>
                      <button onClick={() => handlePercentageClick(50)}>
                        50%
                      </button>
                      <button onClick={() => handlePercentageClick(25)}>
                        25%
                      </button>
                    </div>

                    <div className="amount-input-container">
                      <input
                        type="number"
                        value={tokenAmount}
                        onChange={handleAmountChange}
                        placeholder="0"
                        className="amount-input"
                      />
                      <div className="amount-controls">
                        <button
                          className="amount-button"
                          onClick={() =>
                            setTokenAmount(
                              (parseFloat(tokenAmount) + 1000).toString()
                            )
                          }
                        >
                          ▲
                        </button>
                        <button
                          className="amount-button"
                          onClick={() =>
                            setTokenAmount(
                              Math.max(
                                0,
                                parseFloat(tokenAmount) - 1000
                              ).toString()
                            )
                          }
                        >
                          ▼
                        </button>
                      </div>
                    </div>

                    <div className="cost-display">
                      COST: {ethCost.toFixed(6)} {currencySymbol} $
                      {usdCost.toFixed(2)}
                    </div>
                  </div>
                </>
              )}
            </div>

            {!showHelp && (
              <div className="modal-footer">
                <button
                  className="buy-button"
                  onClick={handleBuy}
                  disabled={
                    isDepositing ||
                    !isAuthenticated ||
                    !tokenAmount ||
                    tokenAmount === "0"
                  }
                >
                  {isDepositing ? "DEPOSITING..." : "BUY"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

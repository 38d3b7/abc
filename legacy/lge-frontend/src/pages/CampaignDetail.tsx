import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import toast from "react-hot-toast";
import { formatETHWithUSD, formatPriceWithUSD } from "../utils/priceFormat";
import {
  useCampaign,
  useFetchCampaign,
  useCampaignDetailData,
  useCampaignActions,
  useEthCalculation,
  useCampaignStatus,
  useChainConfig,
} from "../hooks";
import { CampaignMetadata } from "../types";

export function CampaignDetail() {
  const { campaignAddress } = useParams<{ campaignAddress: string }>();
  const navigate = useNavigate();
  const { authenticated, user } = usePrivy();
  const [tokenAmount, setDepositAmount] = useState("");

  const address = user?.wallet?.address;
  const isAuthenticated = Boolean(authenticated);
  const currencySymbol = useChainConfig()?.currencySymbol ?? "ETH";

  const { campaign, loading: loadingCampaign } =
    useFetchCampaign(campaignAddress);

  const {
    minTokenPrice,
    maxTokenPrice,
    totalDeposits,
    tokenAddress,
    streamBlocks,
    isLgeSuccessful,
    isLgeFinished,
    totalUserDeposit,
  } = useCampaignDetailData(campaignAddress, address);

  const { currentBlock, startBlock, currentPrice, ethPrice, lpProgress } =
    useCampaign({
      hookAddress: campaignAddress || "",
      campaignDuration: streamBlocks ? Number(streamBlocks) : undefined,
    });

  const { tokenAmountWithDecimals, ethWithSlippage } = useEthCalculation({
    tokenAmount,
    currentBlock: currentBlock ?? undefined,
    startBlock,
  });

  const { campaignEnded, canWithdraw, canClaimLiquidity } = useCampaignStatus({
    startBlock,
    streamBlocks,
    currentBlock: currentBlock ?? undefined,
    isLgeSuccessful,
    isLgeFinished,
    totalUserDeposit,
  });

  const {
    deposit,
    withdraw,
    claimLiquidity,
    isDepositing,
    isWithdrawing,
    isClaiming,
  } = useCampaignActions();

  const metadata: CampaignMetadata | null = useMemo(() => {
    if (!campaign?.metadata) return null;
    try {
      return typeof campaign.metadata === "string"
        ? JSON.parse(campaign.metadata)
        : campaign.metadata;
    } catch {
      return null;
    }
  }, [campaign?.metadata]);

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAuthenticated || !tokenAmount || !campaignAddress) {
      toast.error("Please connect wallet and enter an amount");
      return;
    }

    if (!tokenAmountWithDecimals || !ethWithSlippage) {
      toast.error("Invalid token amount or price not available");
      return;
    }

    const success = await deposit(
      campaignAddress,
      tokenAmount,
      ethWithSlippage,
    );
    if (success) {
      setDepositAmount("");
    }
  };

  const handleWithdraw = async () => {
    if (!isAuthenticated || !campaignAddress) {
      toast.error("Please connect wallet");
      return;
    }

    await withdraw(campaignAddress);
  };

  const handleClaimLiquidity = async () => {
    if (!isAuthenticated || !campaignAddress) {
      toast.error("Please connect wallet");
      return;
    }

    await claimLiquidity(campaignAddress);
  };

  if (!campaignAddress) {
    return <div className="error">Invalid campaign address</div>;
  }

  if (loadingCampaign) {
    return <div className="loading">Loading campaign data...</div>;
  }

  return (
    <div className="campaign-detail-page">
      <button onClick={() => navigate("/")} className="btn btn-link">
        ← Back to Campaigns
      </button>

      <div className="campaign-detail-container">
        <div className="campaign-header">
          <h1>{campaign?.tokenName || "LGE Campaign"}</h1>
          <span className="token-symbol">
            {campaign?.tokenSymbol ||
              `${campaignAddress.slice(0, 6)}...${campaignAddress.slice(-4)}`}
          </span>
        </div>
        {metadata && (metadata.website || metadata.x || metadata.farcaster) && (
          <div className="token-links">
            {metadata.website && (
              <a
                href={metadata.website}
                target="_blank"
                rel="noopener noreferrer"
                className="token-link"
              >
                🌐 Website
              </a>
            )}
            {metadata.x && (
              <a
                href={metadata.x}
                target="_blank"
                rel="noopener noreferrer"
                className="token-link"
              >
                𝕏 X (Twitter)
              </a>
            )}
            {metadata.farcaster && (
              <a
                href={metadata.farcaster}
                target="_blank"
                rel="noopener noreferrer"
                className="token-link"
              >
                🟣 Farcaster
              </a>
            )}
          </div>
        )}
        <div className="campaign-progress detail">
          <div className="progress-header detail">
            <span>Campaign Progress</span>
            <span>{lpProgress.toFixed(1)}%</span>
          </div>
          <div className="progress-bar-container detail">
            <div
              className="progress-bar-fill detail"
              style={{ width: `${lpProgress}%` }}
            ></div>
          </div>
          <div className="progress-prices detail">
            <div className="price-item">
              <span className="price-label">Start:</span>
              <span className="price-value">
                {minTokenPrice
                  ? formatPriceWithUSD(
                      minTokenPrice as bigint,
                      ethPrice,
                      currencySymbol,
                      { compact: true },
                    )
                  : "..."}
              </span>
            </div>
            <div className="price-item current">
              <span className="price-label">Current:</span>
              <span className="price-value">
                {currentPrice !== null
                  ? formatPriceWithUSD(currentPrice, ethPrice, currencySymbol, {
                      compact: true,
                    })
                  : "Loading..."}
              </span>
            </div>
            <div className="price-item">
              <span className="price-label">End:</span>
              <span className="price-value">
                {maxTokenPrice
                  ? formatPriceWithUSD(
                      maxTokenPrice as bigint,
                      ethPrice,
                      currencySymbol,
                      { compact: true },
                    )
                  : "..."}
              </span>
            </div>
          </div>
          <div className="progress-blocks">
            <span>Block {startBlock?.toString() || "..."}</span>
            <span>Current: {currentBlock?.toString() || "..."}</span>
            <span>
              Block{" "}
              {startBlock && streamBlocks
                ? ((startBlock as bigint) + (streamBlocks as bigint)).toString()
                : "..."}
            </span>
          </div>
        </div>
        <div className="campaign-stats">
          <div className="stat-card">
            <h3>Current Price</h3>
            <p className="stat-value">
              {currentPrice !== null
                ? formatPriceWithUSD(
                    currentPrice,
                    ethPrice,
                    `${currencySymbol} Per Token`,
                  )
                : "Loading..."}
            </p>
          </div>

          <div className="stat-card">
            <h3>Total Deposited</h3>
            <p className="stat-value">
              {totalDeposits !== undefined
                ? formatETHWithUSD(totalDeposits as bigint, ethPrice, currencySymbol)
                : `0 ${currencySymbol}`}
            </p>
          </div>

          <div className="stat-card">
            <h3>Starting Price</h3>
            <p className="stat-value">
              {minTokenPrice
                ? formatPriceWithUSD(
                    minTokenPrice as bigint,
                    ethPrice,
                    `Tokens per ${currencySymbol}`,
                  )
                : `0 Tokens per ${currencySymbol}`}
            </p>
          </div>

          <div className="stat-card">
            <h3>Ending Price</h3>
            <p className="stat-value">
              {maxTokenPrice
                ? formatPriceWithUSD(
                    maxTokenPrice as bigint,
                    ethPrice,
                    `Tokens per ${currencySymbol}`,
                  )
                : `0 Tokens per ${currencySymbol}`}
            </p>
          </div>

          {totalUserDeposit > 0n && (
            <div className="stat-card highlight">
              <h3>Your Deposit</h3>
              <p className="stat-value">
                {formatETHWithUSD(totalUserDeposit, ethPrice, currencySymbol)}
              </p>
            </div>
          )}
        </div>

        <div className="deposit-section">
          <h2>
            {canClaimLiquidity
              ? "Claim LP Tokens"
              : canWithdraw
                ? "Withdraw Tokens"
                : `Deposit ${currencySymbol}`}
          </h2>

          {!isAuthenticated ? (
            <div className="connect-prompt">
              <p>
                Please connect your wallet to{" "}
                {canClaimLiquidity
                  ? "claim"
                  : canWithdraw
                    ? "withdraw"
                    : "deposit"}
              </p>
            </div>
          ) : Boolean(canClaimLiquidity) ? (
            <div className="deposit-form">
              <div className="connect-prompt">
                <p>
                  Campaign was successful! You can now claim your LP tokens.
                </p>
                <p>
                  Your deposit:{" "}
                  {formatETHWithUSD(totalUserDeposit, ethPrice, currencySymbol)}
                </p>
              </div>
              <button
                onClick={handleClaimLiquidity}
                className="btn btn-primary btn-large"
                disabled={isClaiming}
              >
                {isClaiming ? "Claiming..." : "Claim LP Tokens"}
              </button>
            </div>
          ) : Boolean(canWithdraw) ? (
            <div className="deposit-form">
              <div className="connect-prompt">
                <p>Campaign has ended. You can now withdraw your tokens.</p>
                <p>
                  Your deposit:{" "}
                  {formatETHWithUSD(totalUserDeposit, ethPrice, currencySymbol)}
                </p>
              </div>
              <button
                onClick={handleWithdraw}
                className="btn btn-primary btn-large"
                disabled={isWithdrawing}
              >
                {isWithdrawing ? "Withdrawing..." : "Withdraw All"}
              </button>
            </div>
          ) : (
            <form onSubmit={handleDeposit} className="deposit-form">
              <div className="form-group">
                <label htmlFor="amount">Enter amount of tokens to claim</label>
                <input
                  id="amount"
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="1000"
                  value={tokenAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  required
                  disabled={isDepositing || campaignEnded}
                />
                {ethWithSlippage !== undefined && (
                  <p>
                    {currencySymbol} Required:{" "}
                    {formatETHWithUSD(ethWithSlippage, ethPrice, currencySymbol)}{" "}
                    (includes 5% slippage)
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-large"
                disabled={isDepositing || !tokenAmount || campaignEnded}
              >
                {isDepositing
                  ? "Depositing..."
                  : campaignEnded
                    ? "Campaign Ended"
                    : "Deposit"}
              </button>
            </form>
          )}
        </div>
        <div className="contract-info">
          <h3>Hook Contract Address</h3>
          <code>{campaignAddress}</code>
        </div>
        {tokenAddress !== undefined && (
          <div className="contract-info">
            <h3>Token Contract Address</h3>
            <code>{String(tokenAddress)}</code>
          </div>
        )}
      </div>
    </div>
  );
}

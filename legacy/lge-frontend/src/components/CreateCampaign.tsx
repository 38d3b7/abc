import { useState, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import toast from "react-hot-toast";
import { useAccount } from "wagmi";
import {
  useBlockData,
  useCampaignAddresses,
  useCreateCampaign,
  useImageUpload,
} from "../hooks";
import { CreateCampaignProps } from "../types";

export function CreateCampaign({ onSuccess }: CreateCampaignProps) {
  const { authenticated, user } = usePrivy();
  const { isConnected } = useAccount();
  const address = user?.wallet?.address;

  const [campaignParams, setFormData] = useState({
    tokenName: "",
    tokenSymbol: "",
    imageUrl: null as string | null,
    website: "",
    xLink: "",
    farcasterLink: "",
  });

  const {
    isUploading,
    isDragging,
    handleImageChange,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useImageUpload({
    walletAddress: address,
    onSuccess: (imageUrl) => {
      setFormData({
        ...campaignParams,
        imageUrl,
      });
    },
  });

  const { blockTimestamp, currentBlock, publicClient } = useBlockData();
  const lockedBlockNumber = currentBlock;

  const metadata = useMemo(() => {
    return JSON.stringify({
      website: campaignParams.website,
      x: campaignParams.xLink,
      farcaster: campaignParams.farcasterLink,
    });
  }, [
    campaignParams.website,
    campaignParams.xLink,
    campaignParams.farcasterLink,
  ]);

  const { hash, tokenAddressComputed, hookConstructorArgs } =
    useCampaignAddresses({
      address,
      blockTimestamp,
      tokenName: campaignParams.tokenName,
      tokenSymbol: campaignParams.tokenSymbol,
      imageUrl: campaignParams.imageUrl,
      metadata,
      lockedBlockNumber,
    });

  const { isCreating, createCampaign, useHookMiner, FLAGS } = useCreateCampaign(
    {
      publicClient,
      onSuccess,
    }
  );

  const {
    data: hookMinerData,
    isLoading: isHookMinerLoading,
    error: hookMinerError,
  } = useHookMiner(hookConstructorArgs);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...campaignParams,
      [e.target.name]: e.target.value,
    });
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!authenticated || !address || !isConnected) {
      toast.error("Please connect your wallet");
      return;
    }

    if (!campaignParams.imageUrl) {
      toast.error("Please upload the image first");
      return;
    }

    if (!lockedBlockNumber) {
      toast.error("Block number not locked. Please wait and try again.");
      return;
    }

    if (isHookMinerLoading) {
      toast.error("Hook miner is still finding a valid salt. Please wait...");
      return;
    }

    if (hookMinerError) {
      toast.error(`Hook miner error: ${hookMinerError.message}`);
      return;
    }

    if (!FLAGS) {
      toast.error("FLAGS not loaded. Please wait and try again.");
      return;
    }

    if (!hookConstructorArgs) {
      toast.error(
        "Hook constructor args not ready. Please check all fields are filled."
      );
      return;
    }

    if (!hookMinerData || !hash) {
      toast.error("Hook miner data not available. Please try again.");
      return;
    }

    try {
      await createCampaign({
        address,
        tokenName: campaignParams.tokenName,
        tokenSymbol: campaignParams.tokenSymbol,
        imageUrl: campaignParams.imageUrl,
        metadata,
        hash,
        lockedBlockNumber,
        hookMinerData: hookMinerData as [string, `0x${string}`],
        tokenAddressComputed,
      });

      setFormData({
        tokenName: "",
        tokenSymbol: "",
        imageUrl: null,
        website: "",
        xLink: "",
        farcasterLink: "",
      });
    } catch (error) {
      console.error("Campaign creation failed:", error);
    }
  };

  return authenticated ? (
    <div className="create-campaign-container">
      <form onSubmit={handleSubmit} className="create-campaign-form">
        <div className="form-section">
          <h3 className="section-title">
            <span className="section-icon">[TOKEN]</span> Token Information
          </h3>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="tokenName">Token Name *</label>
              <input
                id="tokenName"
                name="tokenName"
                type="text"
                value={campaignParams.tokenName}
                onChange={handleChange}
                required
                placeholder="e.g., Matrix Protocol"
                disabled={isCreating}
              />
            </div>

            <div className="form-group">
              <label htmlFor="tokenSymbol">Token Symbol *</label>
              <input
                id="tokenSymbol"
                name="tokenSymbol"
                type="text"
                value={campaignParams.tokenSymbol}
                onChange={handleChange}
                required
                placeholder="e.g., MTX"
                disabled={isCreating}
                maxLength={10}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="image">Token Image *</label>
            <div
              className={`file-upload-wrapper ${isDragging ? "dragging" : ""} ${
                isUploading ? "uploading" : ""
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                id="image"
                name="image"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                disabled={isCreating || isUploading}
                className="file-input"
              />

              {!campaignParams.imageUrl ? (
                <label
                  htmlFor="image"
                  className={`file-upload-button ${isDragging ? "drag-active" : ""}`}
                >
                  <div className="upload-content">
                    <div className="upload-icon-wrapper">
                      <span className="upload-icon">
                        {isUploading ? "[...]" : "[↑]"}
                      </span>
                    </div>
                    <div className="upload-text-wrapper">
                      <span className="upload-text">
                        {isUploading
                          ? "Uploading..."
                          : isDragging
                            ? "Drop image here"
                            : "Drag & drop or click to upload"}
                      </span>
                      <span className="upload-hint">
                        PNG, JPG, GIF up to 10MB
                      </span>
                    </div>
                  </div>
                  <div className="upload-border-effect">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </label>
              ) : (
                <div className="image-preview-container">
                  <div className="image-preview">
                    <img src={campaignParams.imageUrl} alt="Token preview" />
                    <div className="image-overlay">
                      <span className="success-icon">[✓]</span>
                      <span className="success-text">Image Uploaded</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="change-image-btn"
                    onClick={() =>
                      setFormData({ ...campaignParams, imageUrl: null })
                    }
                    disabled={isCreating}
                  >
                    <span className="btn-icon">[×]</span> Change Image
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 className="section-title">
            <span className="section-icon">[SOCIAL]</span> Social Links
          </h3>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="website">Website</label>
              <input
                id="website"
                name="website"
                type="url"
                value={campaignParams.website}
                onChange={handleChange}
                placeholder="https://yourproject.com"
                disabled={isCreating}
              />
            </div>

            <div className="form-group">
              <label htmlFor="xLink">X (Twitter)</label>
              <input
                id="xLink"
                name="xLink"
                type="url"
                value={campaignParams.xLink}
                onChange={handleChange}
                placeholder="https://x.com/username"
                disabled={isCreating}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="farcasterLink">Farcaster</label>
            <input
              id="farcasterLink"
              name="farcasterLink"
              type="url"
              value={campaignParams.farcasterLink}
              onChange={handleChange}
              placeholder="https://warpcast.com/username"
              disabled={isCreating}
            />
          </div>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary btn-large"
            disabled={
              isCreating || isHookMinerLoading || !campaignParams.imageUrl
            }
          >
            {isCreating
              ? "DEPLOYING TOKEN..."
              : isHookMinerLoading
                ? "PREPARING TOKEN..."
                : "LAUNCH TOKEN"}
          </button>

          {!campaignParams.imageUrl && (
            <p className="form-hint">Upload a token image to continue</p>
          )}
        </div>
      </form>
    </div>
  ) : (
    <div className="connect-prompt">
      <p>Please connect your wallet to create a campaign</p>
    </div>
  );
}

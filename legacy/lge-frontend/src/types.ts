// ============================================
// Campaign-related interfaces
// ============================================
export interface Campaign {
  id: string;
  hookAddress: string;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenImageUrl?: string;
  metadata?: string;
  startingPrice: string;
  endingPrice: string;
  createdAt: string;
}

// Extended Campaign interface with wallet address (for UserLaunches)
export interface CampaignWithWallet extends Campaign {
  walletAddress: string;
  minTokenPrice: string;
  maxTokenPrice: string;
}

export interface CampaignMetadata {
  website?: string;
  x?: string;
  farcaster?: string;
}

// ============================================
// User-related interfaces
// ============================================
export interface User {
  walletAddress: string;
  createdAt: string;
}

export interface TokenData {
  id: string;
  hookAddress: string;
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenImageUrl?: string;
  tokensToLiquidity: bigint;
  ethToLiquidityDeposited: bigint;
  remainingEthDeposited: bigint;
  hasClaimed: boolean;
  startBlock: bigint;
  totalBlocks: bigint;
  isLgeSuccessful: boolean;
  isLgeFinished: boolean;
}

// ============================================
// Component prop interfaces
// ============================================
export interface BuyTokensModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: {
    id: string;
    hookAddress: string;
    tokenAddress: string;
    tokenName: string;
    tokenSymbol: string;
    tokenImageUrl?: string;
    startingPrice: string;
    endingPrice: string;
  };
}

export interface CampaignTileProps {
  campaign: Campaign;
}

export interface GeometricCampaignTileProps {
  campaign: Campaign;
}

export interface CreateCampaignProps {
  onSuccess?: () => void;
}

export interface MemeCoinDisplayProps {
  imageUrl?: string;
  tokenName: string;
  tokenSymbol: string;
  timeRemaining: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  };
  progressPercentage: number;
  currentPrice: string;
}

export interface MemeCoinTileProps {
  width?: number | string;
  height?: number | string;
  lpProgress?: number;
  timeProgress?: number;
  priceProgress?: number;
  tokenName?: string;
  tokenSymbol?: string;
  minPrice?: number;
  maxPrice?: number;
  countdown?: {
    days: string;
    hours: string;
    minutes: string;
    seconds: string;
  };
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  animateProgress?: boolean;
  showGlitch?: boolean;
  customContent?: React.ReactNode;
}

// ============================================
// Hook parameter interfaces
// ============================================

// Blockchain hooks
export interface UseCampaignParams {
  hookAddress: string;
  campaignDuration?: number;
}

export interface UseCampaignAddressesParams {
  address?: string;
  blockTimestamp: bigint | null;
  tokenName: string;
  tokenSymbol: string;
  imageUrl: string | null;
  metadata: string;
  lockedBlockNumber: bigint | null;
}

export interface UseCampaignDataParams {
  hookAddress: string;
  tokenAddress?: string;
}

export interface UseCampaignPriceParams {
  startingPrice: string;
  endingPrice: string;
  currentBlock: bigint | null;
  startBlock?: bigint;
}

export interface UseCampaignTimeParams {
  startBlock?: bigint;
  currentBlock: bigint | null;
  campaignDuration?: number;
}

export interface UseCreateCampaignParams {
  publicClient: any;
  onSuccess?: () => void;
}

// Upload hooks
export interface UseImageUploadParams {
  walletAddress?: string;
  onSuccess?: (imageUrl: string) => void;
}

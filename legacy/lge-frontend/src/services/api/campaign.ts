import { lgeApi } from "./config";

export interface CreateCampaignParams {
  walletAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenImageUrl: string;
  metadata: string;
  startingPrice: string;
  endingPrice: string;
  hookAddress: string;
  tokenAddress: string;
}

export const createCampaign = async (data: CreateCampaignParams) =>
  await lgeApi.post("/campaigns", data, {
    headers: {
      "Content-Type": "application/json",
    },
  });

export const uploadImage = async (data: FormData) =>
  await lgeApi.post<string>("/campaigns/upload-image", data, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

export const getAllCampaigns = async () => {
  try {
    const response = await lgeApi.get("/campaigns");
    return response;
  } catch (error) {
    console.error("getAllCampaigns error:", error);
    throw error;
  }
};

export const getCampaignByHook = async (hookAddress: string) =>
  await lgeApi.get(`/campaigns/${hookAddress}`);

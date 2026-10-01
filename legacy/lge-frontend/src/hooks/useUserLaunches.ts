import { useState, useEffect } from "react";
import { getAllCampaigns } from "../services/api/campaign";
import { getUser } from "../services/api/user";
import { User, CampaignWithWallet } from "../types";

export function useUserLaunches(address?: string) {
  const [userData, setUserData] = useState<User | null>(null);
  const [launchedTokens, setLaunchedTokens] = useState<CampaignWithWallet[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!address) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const userResponse = await getUser(address);
        setUserData(userResponse.data);

        const campaignsResponse = await getAllCampaigns();

        const userLaunchedCampaigns = campaignsResponse.data.filter(
          (campaign: any) =>
            campaign.walletAddress?.toLowerCase() === address?.toLowerCase(),
        );

        setLaunchedTokens(userLaunchedCampaigns);
      } catch (err) {
        console.error("Error fetching user data:", err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [address]);

  return { userData, launchedTokens, loading, error };
}

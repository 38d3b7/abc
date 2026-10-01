import { useState, useEffect } from "react";
import { getAllCampaigns } from "../services/api/campaign";
import { Campaign } from "../types";

export function useFetchCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getAllCampaigns();
      // Sort by createdAt in descending order (newest first, oldest last)
      const sortedCampaigns = [...response.data].sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });
      setCampaigns(sortedCampaigns);
    } catch (err) {
      console.error("Error fetching campaigns:", err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  return { campaigns, loading, error, refetch: fetchCampaigns };
}

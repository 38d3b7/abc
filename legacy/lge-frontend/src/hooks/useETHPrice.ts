import { useState, useEffect } from "react";
import { useChainId } from "wagmi";
import { getETHPrice } from "../services/api/price";
import { getChainConfig } from "../config/chainConfig";

export function useETHPrice() {
  const chainId = useChainId();
  // On chains whose native currency is a USD stablecoin (e.g. Arc, where the
  // native token IS USDC), the USD figure is the native amount itself — skip
  // the ETH/USD feed and use an identity conversion.
  const nativeIsUsdStable =
    getChainConfig(chainId)?.nativeIsUsdStable ?? false;

  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (nativeIsUsdStable) {
      setEthPrice(1);
      setLoading(false);
      setError(null);
      return;
    }

    const fetchPrice = async () => {
      try {
        setLoading(true);
        setError(null);
        const price = await getETHPrice();
        setEthPrice(price);
      } catch (err) {
        setError("Failed to fetch ETH price");
        console.error("Error fetching ETH price:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();

    const interval = setInterval(fetchPrice, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [nativeIsUsdStable]);

  const convertToUSD = (ethAmount: string | number): string | null => {
    if (!ethPrice || ethAmount === null || ethAmount === undefined) return null;

    const eth =
      typeof ethAmount === "string" ? parseFloat(ethAmount) : ethAmount;
    if (isNaN(eth)) return null;

    const usdAmount = eth * ethPrice;
    return usdAmount.toFixed(2);
  };

  return {
    ethPrice,
    loading,
    error,
    convertToUSD,
  };
}

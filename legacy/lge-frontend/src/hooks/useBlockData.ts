import { useState, useEffect } from "react";
import { usePublicClient } from "wagmi";

export function useBlockData() {
  const [currentBlock, setCurrentBlock] = useState<bigint | null>(null);
  const [blockTimestamp, setBlockTimestamp] = useState<bigint | null>(null);
  const publicClient = usePublicClient();

  useEffect(() => {
    const fetchBlock = async () => {
      if (publicClient && !blockTimestamp) {
        const block = await publicClient.getBlock();
        setBlockTimestamp(block.timestamp);
        setCurrentBlock(block.number);
      }
    };
    fetchBlock();
  }, [publicClient, blockTimestamp]);

  useEffect(() => {
    if (!publicClient) return;

    const unwatch = publicClient.watchBlockNumber({
      onBlockNumber: (blockNumber) => {
        setCurrentBlock(blockNumber);
      },
    });

    return () => unwatch();
  }, [publicClient]);

  return {
    currentBlock,
    blockTimestamp,
    publicClient,
  };
}

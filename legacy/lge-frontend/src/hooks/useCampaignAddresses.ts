import { useMemo } from "react";
import { useChainId } from "wagmi";
import {
  getCreate2Address,
  keccak256,
  encodePacked,
  encodeAbiParameters,
  concat,
} from "viem";
import { getChainConfig } from "../config/chainConfig";
import { UseCampaignAddressesParams } from "../types";

export function useCampaignAddresses({
  address,
  blockTimestamp,
  tokenName,
  tokenSymbol,
  imageUrl,
  metadata,
  lockedBlockNumber,
}: UseCampaignAddressesParams) {
  const chainId = useChainId();
  const chainConfig = getChainConfig(chainId);

  const hash = useMemo(() => {
    if (!address || !blockTimestamp) return undefined;
    return keccak256(
      encodePacked(
        ["address", "uint256"],
        [address as `0x${string}`, blockTimestamp],
      ),
    );
  }, [address, blockTimestamp]);

  const tokenConstructorArgs = useMemo(() => {
    if (!address || !imageUrl || !hash || !chainConfig?.lgeManager) {
      return undefined;
    }
    return encodeAbiParameters(
      [
        { type: "string" },
        { type: "string" },
        { type: "address" },
        { type: "string" },
        { type: "string" },
        { type: "address" },
      ],
      [
        tokenName,
        tokenSymbol,
        address as `0x${string}`,
        imageUrl,
        metadata,
        chainConfig.lgeManager,
      ],
    );
  }, [address, tokenName, tokenSymbol, imageUrl, metadata, hash, chainConfig]);

  const tokenAddressComputed = useMemo(() => {
    if (!hash || !tokenConstructorArgs || !chainConfig) return undefined;

    return getCreate2Address({
      from: chainConfig.lgeManager as `0x${string}`,
      salt: hash,
      bytecodeHash: keccak256(
        concat([chainConfig.tokenBytecode, tokenConstructorArgs]),
      ),
    });
  }, [hash, tokenConstructorArgs, chainConfig]);

  const hookConstructorArgs = useMemo(() => {
    if (
      !tokenAddressComputed ||
      !lockedBlockNumber ||
      !chainConfig?.poolManager ||
      !chainConfig?.positionManager ||
      !chainConfig?.permit2
    ) {
      return undefined;
    }

    return encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
      ],
      [
        chainConfig.poolManager,
        chainConfig.positionManager,
        chainConfig.permit2,
        tokenAddressComputed,
        lockedBlockNumber,
      ],
    );
  }, [tokenAddressComputed, lockedBlockNumber, chainConfig]);

  return {
    hash,
    tokenConstructorArgs,
    tokenAddressComputed,
    hookConstructorArgs,
  };
}

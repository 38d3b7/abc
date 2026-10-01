import { createConfig } from "@privy-io/wagmi";
import { http } from "wagmi";
import { mainnet, unichainSepolia } from "viem/chains";
import { arcTestnet } from "./config/chains";

export const config = createConfig({
  chains: [arcTestnet, unichainSepolia, mainnet],
  transports: {
    [arcTestnet.id]: http(),
    [mainnet.id]: http(),
    [unichainSepolia.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

export const LGE_CALCULATIONS_LIBRARY_ABI = [
  {
    type: "function",
    name: "MAX_TOKEN_PRICE",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MIN_TOKEN_PRICE",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "calculateCurrentTokenPrice",
    inputs: [
      { name: "currentBlock", type: "uint256", internalType: "uint256" },
      { name: "startBlock", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "calculateEthNeeded",
    inputs: [
      { name: "currentBlock", type: "uint256", internalType: "uint256" },
      { name: "startBlock", type: "uint256", internalType: "uint256" },
      { name: "amountOfTokens", type: "uint256", internalType: "uint256" },
    ],
    outputs: [
      { name: "ethExpected", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "getAmountsForLiquidity",
    inputs: [
      { name: "sqrtPriceX96", type: "uint160", internalType: "uint160" },
      { name: "tickLower", type: "int24", internalType: "int24" },
      { name: "tickUpper", type: "int24", internalType: "int24" },
      { name: "currentTick", type: "int24", internalType: "int24" },
      { name: "tokenAmount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [
      { name: "ethNeeded", type: "uint256", internalType: "uint256" },
      { name: "liquidity", type: "uint128", internalType: "uint128" },
    ],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "getSqrtPrice",
    inputs: [
      { name: "averagePrice", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ name: "", type: "uint160", internalType: "uint160" }],
    stateMutability: "pure",
  },
];

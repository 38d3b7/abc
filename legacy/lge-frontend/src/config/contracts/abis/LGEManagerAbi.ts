export const LGE_MANAGER_ABI = [
  {
    type: "constructor",
    inputs: [
      { name: "poolManager_", type: "address", internalType: "address" },
      { name: "positionManager_", type: "address", internalType: "address" },
      { name: "permit2_", type: "address", internalType: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "FLAGS",
    inputs: [],
    outputs: [{ name: "", type: "uint160", internalType: "uint160" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "_permit2",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "_poolManager",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "_positionManager",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "deployToken",
    inputs: [
      {
        name: "config",
        type: "tuple",
        internalType: "struct LGEManager.DeploymentConfig",
        components: [
          {
            name: "tokenConfig",
            type: "tuple",
            internalType: "struct LGEManager.TokenConfig",
            components: [
              { name: "tokenAdmin", type: "address", internalType: "address" },
              { name: "name", type: "string", internalType: "string" },
              { name: "symbol", type: "string", internalType: "string" },
              { name: "image", type: "string", internalType: "string" },
              { name: "metadata", type: "string", internalType: "string" },
              { name: "tokenSalt", type: "bytes32", internalType: "bytes32" },
            ],
          },
          {
            name: "hookConfig",
            type: "tuple",
            internalType: "struct LGEManager.HookConfig",
            components: [
              { name: "hookSalt", type: "bytes32", internalType: "bytes32" },
              { name: "startBlock", type: "uint256", internalType: "uint256" },
            ],
          },
        ],
      },
    ],
    outputs: [
      { name: "tokenAddress", type: "address", internalType: "address" },
      { name: "hookAddress", type: "address", internalType: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "TokenCreated",
    inputs: [
      {
        name: "msgSender",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "tokenAddress",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "hookAddress",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
];

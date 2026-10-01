export const HOOK_MINER_ABI = [
  {
    type: "function",
    name: "find",
    inputs: [
      {
        name: "deployer",
        type: "address",
        internalType: "address",
      },
      {
        name: "flags",
        type: "uint160",
        internalType: "uint160",
      },
      {
        name: "creationCode",
        type: "bytes",
        internalType: "bytes",
      },
      {
        name: "constructorArgs",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
];

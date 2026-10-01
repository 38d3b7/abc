---
name: arc-chain
description: Arc testnet facts the agent needs to reason about its own transactions — chain id, USDC units, gas, finality, addresses that revert.
---

# Arc chain facts

- Arc testnet chain id is 5042002. Gas is paid in native USDC with 18 decimals. Finality is under a second; blocks are roughly half a second.
- Native USDC has 18 decimals. The ERC-20 USDC representation is 6-decimal at 0x3600000000000000000000000000000000000000 (its EIP-712 domain name is the string "USDC", version "2" — read from the contract, not assumed).
- Sends to address(0) revert. A 20 Gwei maxFeePerGas floor applies. Blocklist reverts consume gas and produce no receipt.
- The agent's wallet is executor-provisioned. The agent never sees keys and never constructs calldata; it raises typed intents and the executor prices, simulates, policy-checks, signs and broadcasts.
- Amounts in intent params are strings of the smallest unit (18-dec wei for native USDC) unless the intent schema says otherwise.

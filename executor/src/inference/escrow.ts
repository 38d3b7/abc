/**
 * InferenceEscrow (contracts/src/InferenceEscrow.sol): per-agent USDC credits
 * funding inference. The agent draws down to the protocol-set provider (the
 * executor's inference EOA) via payProvider; the provider deposits to Circle
 * Gateway and pays per model call over x402 (PRODUCT.md third lock).
 */

import { parseAbi, type Address } from 'viem'
import { INFERENCE_ESCROW_ARC_TESTNET } from '../lge/addresses.js'

export const INFERENCE_ESCROW: Record<number, Address> = {
  5042002: INFERENCE_ESCROW_ARC_TESTNET as Address
}

export const INFERENCE_ESCROW_ABI = parseAbi([
  'function payProvider(uint256 amount)',
  'function creditOf(address agent) view returns (uint256)',
  'function provider() view returns (address)'
])

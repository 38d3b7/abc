import { defineChain } from 'viem'

export const arcTestnet = defineChain({
  id: 5_042_002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.io'] } }
})

/** Arc gas floor: 20 gwei maxFee, 1 gwei priority (below-floor txs sit forever). */
export const GAS_FLOOR = {
  maxFeePerGas: 20_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n
} as const

function required (name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`missing env var ${name}`)
  return v
}

export const config = {
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:55432/abc',
  /** API key for owner/operator auth (X-ABC-Key header). */
  apiKey: process.env.ABC_API_KEY || 'dev-key',
  /** Ed25519 secret (hex, 32-byte seed) for quote + rationale signing. */
  quoteSecret: process.env.ABC_QUOTE_SECRET || '',
  signer: (process.env.ABC_SIGNER || 'local') as 'circle' | 'local' | 'agent_stack',
  circle: {
    apiKey: process.env.CIRCLE_API_KEY || '',
    entitySecret: process.env.CIRCLE_ENTITY_SECRET || '',
    walletSetId: process.env.CIRCLE_WALLET_SET_ID || ''
  },
  /** Dev-only local key. Refused outside NODE_ENV != production AND explicit allow. */
  localKey: process.env.ABC_LOCAL_KEY || '',
  /** Keeper EOA (gas-only) for permissionless claimProtocol sweeps. */
  keeperKey: process.env.ABC_KEEPER_KEY || '',
  aiGatewayKey: process.env.AI_GATEWAY_API_KEY || '',
  agentModel: process.env.ABC_AGENT_MODEL || 'anthropic/claude-sonnet-4.5',
  /** Extra gateway ids exposed in the console model picker (comma-separated). */
  agentModels: (process.env.ABC_AGENT_MODELS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  /** Inference rail (PRODUCT.md third lock). Buyer: the agent's dedicated
   *  inference EOA key, funded by capped draws from its InferenceEscrow
   *  credit. Seller: the executor's charge endpoint, paid to the keeper EOA
   *  unless ABC_INFERENCE_SELLER_ADDRESS overrides. Both sides unset = free
   *  local dev (no charging). */
  inferenceKey: process.env.ABC_INFERENCE_KEY || '',
  inferencePriceUsdc6: BigInt(process.env.ABC_INFERENCE_PRICE_USDC6 || '100'), // $0.0001/call
  inferenceChargeBaseUrl: process.env.ABC_INFERENCE_CHARGE_URL || 'http://localhost:8787',
  inferenceSellerAddress: process.env.ABC_INFERENCE_SELLER_ADDRESS || '',
  gatewayFacilitatorUrl: process.env.GATEWAY_FACILITATOR_URL || 'https://gateway-api-testnet.circle.com',
  /** Showcase app write API. Unset = local dev (push is a no-op). */
  appsPushUrl: process.env.ABC_APPS_PUSH_URL || '',
  appsPushKey: process.env.ABC_APPS_PUSH_KEY || '',
  isProduction: process.env.NODE_ENV === 'production',
  requireEnv: required
} as const

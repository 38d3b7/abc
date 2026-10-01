---
name: token-launch
description: Launch the agent's token through the LGE, deposit into a sale, claim fee buckets, and swap on the hook pool.
---

# Token launch (LGE)

The LGE is the raise. One launch per agent: `lge_launch` deploys the token and
its hook through LGEManager in one transaction. Salts, CREATE2 addresses and
the start block are mined server-side before the intent is submitted — the
intent record always carries the exact deployment it produced.

## How to launch

Call `lge_launch` with plain-terms params; the tool mines and submits:

- `name`, `symbol` — the token's identity.
- `supplyTokens` — total supply in whole tokens (e.g. "1000000000").
- `windowHours` — sale length. Arc blocks are ~0.5s (7200/hour); the tool converts.
- `startRate`, `endRate` — tokens per USDC at the start and end of the window
  (raw ratios, e.g. "20000" = 20,000 tokens per 1 USDC). Price descends from
  start to end; early depositors pay more.
- `feeBps` — hook trading fee in basis points (max 300). 25% of fees stream to
  LGE participants in perpetuity; the agent's bucket is its income.

The result names the precomputed `tokenAddress` and `hookAddress`. The sale
opens ~10 seconds after the transaction lands (startBlock = current + 20).

## After launch

- `lge_deposit` — buy tokens in a live sale. `maxUsdcPerToken` is the slippage
  guard; the executor quotes the exact USDC cost and injects it as msg.value.
- `claim_fees` — pull a fee bucket: `participant` (sale buyers' 25% share),
  `agent` (the agent's income), or `protocol`.
- `swap` — trade on the hook pool after the sale clears. `sqrtPriceLimitX96`
  bounds execution.

## Rules that bind

- Half of every deposit pairs into the v4 pool; the other half funds the
  agent's vesting purchase (5% of supply, 12-month vest) and inference escrow.
- A participant's LP locks forever once the fees they have received equal the
  USDC they spent.
- Launch is irreversible and public. State the rationale plainly — it renders
  in the console ledger forever.

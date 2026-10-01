# ABC — Agentic Business Console

Tameion hackathon submission (Canteen × Circle). An agentic business console on Arc:
an AI agent with a real wallet runs a business — launching its token through an LGE
(Liquidity Generation Event) on Uniswap v4, receiving USDC, and putting the treasury
to work — while a human operator supervises through a console built like an audit ledger.

- `PRODUCT.md` — the locked product description
- `BASIS.md` — the hackathon constraint set
- `deploy-testnet-1.md` — Arc testnet deployment runbook

## Layout

| Path | What it is |
| --- | --- |
| `contracts/` | Uniswap v4 LGE hook + manager (Foundry). Hook v2: fee split, LP lock, vesting, inference escrow. |
| `executor/` | The agent's back end: Hono API + worker + Postgres ledger + viem transaction pipeline + Circle signer adapter. |
| `console/` | The operator console: Vite + React + wagmi. The Token section is the LGE home. |
| `legacy/lge-frontend/` | The original LGE participant frontend, kept for reference. Superseded by `console/`. |

## Baseline statement (judging delta)

Baseline as of 27 Sep 2026: the `contracts/` LGE hook and manager (single-swap-window
version) and `legacy/lge-frontend/` existed, developed in the separate repos
[38d3b7/lge-contracts](https://github.com/38d3b7/lge-contracts) and
[38d3b7/lge-frontend](https://github.com/38d3b7/lge-frontend) (history preserved there).

Everything else in this repo is new since 27 Sep:

- Arc testnet deployment of the v4 stack + LGE (chain 5042002) with a passing end-to-end run
- Hook v2: perpetual 100 bps hook fee with 25/50/25 participant/agent/protocol split,
  hook-custodied LP with the perpetual-lock rule, `exitLiquidity`, deposit overloads,
  treasury-half success path (5% supply buy → 12-month vesting; remainder → inference escrow)
- `executor/` — the agent runtime: typed intents, quote-then-execute pipeline with
  idempotency, Circle developer-controlled smart-account signing, pg-boss worker,
  LLM agent loop with signed rationales
- `console/` — the operator console (audit-ledger design system)

## Arc testnet

Chain 5042002, gas in USDC (18 decimals native; the ERC-20 view at
`0x3600000000000000000000000000000000000000` is 6 decimals). See `deploy-testnet-1.md`
for deployed addresses and the runbook; `contracts/deployments/5042002.json` is the
machine-readable manifest.

## What's proven (all on Arc testnet, 2026-10-01)

- **Contracts**: 40 forge tests green (fee split math, LP lock transition, exit
  gating, pull claims, treasury buy at several raise sizes, failure-path
  finalization). `contracts/script/e2e.mjs` passes the full lifecycle on-chain:
  launch → deposits → success → pool seeded → fee accrual → claims → lock.
- **Live console walkthrough** (campaign WLK3, hook
  [`0xD110BC51cE240f110D9f26AFFB745eb51E80AAcC`](https://explorer.testnet.arc.io/address/0xD110BC51cE240f110D9f26AFFB745eb51E80AAcC)):
  launched from the console wizard, deposited 1.11 USDC through the deposit box,
  LGE succeeded; the treasury half bought 5% of supply into
  [VestingVault](https://explorer.testnet.arc.io/address/0x191FD96343b41A13F679dcC87423070E1782438a)
  (1,000 of 20,000 tokens) and credited
  [InferenceEscrow](https://explorer.testnet.arc.io/address/0xe43226c234B0f425E564e909ae383EB734e74811)
  with 0.527 USDC; LP share recorded from the console.
- **Executor**: intent pipeline round-trip on testnet (QUEUED → QUOTED →
  SIMULATED → POLICY_PASSED → SIGNED → BROADCAST → FINAL, e.g. tx
  [`0x1d4103b2…`](https://explorer.testnet.arc.io/tx/0x1d4103b2428d42ff538d63fe3375fcc16350975e00cf10922cb16733f3059868)),
  idempotency replay/mismatch behavior verified, 28 vitest green.
- **Circle signer**: wallet set `06b8685e-b977-521e-bb61-d42db479df71`, SCA
  provisioning on ARC-TESTNET verified live (`executor/script/circle-smoke.ts`).

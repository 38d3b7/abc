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
for deployed addresses and the runbook.

# Tameion submission notes

Deadline 10 Oct 2026, 11:59 PM ET. Form at the Tameion site; resubmit as often as you like. Paste from here.

## Where it was on 27 Sep

Uniswap v4 LGE hook + manager (sale window, ETH deposits, LP claim, no fee split, no lock, no treasury buy) in [38d3b7/lge-contracts](https://github.com/38d3b7/lge-contracts) and the participant UI in [38d3b7/lge-frontend](https://github.com/38d3b7/lge-frontend). No executor, no agent wallet, no console.

## Where it is now

Public monorepo: https://github.com/38d3b7/abc

- Hook v2 on Arc testnet (USDC deposits, 25/50/25 perpetual fee split, hook-custodied LP that locks when booked participant fees ≥ USDC spent in the LGE, 5% treasury buy → 12-month vest + inference escrow).
- Executor: typed intents, quote-then-execute pipeline, Circle developer-controlled SCA signer, pg-boss worker, LLM agent loop with signed rationales.
- Console: operator ledger (Overview / Token / Activity / Automations / Settings). Token URL is the participant deposit page.

## Live

| | |
|---|---|
| Repo | https://github.com/38d3b7/abc |
| Console (local) | `cd console && npm run dev` — Vite, needs executor on :8787 |
| LGEManager | [`0x47c7abdab6ea18621ba151a0d6d9cc1260997827`](https://explorer.testnet.arc.io/address/0x47c7abdab6ea18621ba151a0d6d9cc1260997827) (canonical: `contracts/deployments/5042002.json`) |
| Walkthrough campaign (WLK3) | [`0xD110BC51cE240f110D9f26AFFB745eb51E80AAcC`](https://explorer.testnet.arc.io/address/0xD110BC51cE240f110D9f26AFFB745eb51E80AAcC) (ran on the previous manager, `0x4221…2920`) |
| Pipeline tx | [`0x1d4103b2428d42ff538d63fe3375fcc16350975e00cf10922cb16733f3059868`](https://explorer.testnet.arc.io/tx/0x1d4103b2428d42ff538d63fe3375fcc16350975e00cf10922cb16733f3059868) |
| Demo | `demo/abc-demo.mp4` (~90s) |

## Day-0 experiments (DECISIONS)

| Experiment | Result |
|---|---|
| 19-gwei send | RPC rejects. baseFee floor is 20 gwei. Broadcasts need `--gas-price 20000000000`. |
| `eth_getCode` on Kernel | Observed; 7702 path left unset. |
| `debug_traceCall` on public RPC | Unsupported (`trace_call` too). Valuation is by construction from typed intents; anything unpriceable is refused. Keyed Canteen RPC (`arc-canteen rpc-url`) still needs `arc-canteen login` — same fail-closed rule applies once wired as `ARC_RPC_URL`. |

## Circle tools used

Developer-controlled wallets (`@circle-fin/developer-controlled-wallets`): wallet set `06b8685e-b977-521e-bb61-d42db479df71`, SCA provisioned on `ARC-TESTNET`. Native USDC as gas. Agent Stack adapter is stubbed, not the primary path.

# ABC demo + smoke suite

End-to-end smoke tests and demo-asset generator for the live testnet stack at `agenticbusinessconsole.com`.

## What it covers

1. **Multiple wallets**
   - `FUNDING_KEY` — one already-funded deployer that seeds the test wallets.
   - `owner-A`, `owner-B` — agent owners that create agents, publish apps, and launch LGEs.
   - `alice`, `bob` — participant wallets that deposit into other agents' LGEs.
2. **Multiple agents**
   - `Alpha` — LGE currently live, some deposits, not yet at cap.
   - `Beta` — LGE filled to cap, pool initialized, LP position minted, a swap executed, fees claimed.
   - `Gamma` — LGE window expired without reaching cap; owner withdraws the refund.
3. **Product surfaces exercised**
   - Console SIWE login, agent creation, app publish, Token section, launch wizard code path.
   - Executor API: auth, agent create, app publish, public board endpoints.
   - Showcase apex: directory, "LGE live" filter with square cards, live tokens board, activity tape.
   - On-chain: deployToken, deposit, claimLiquidity, third-party swap, claimParticipant/claimAgent, withdraw.

## Outputs

- `out/state.json` — wallet keys, agent ids, hook addresses, tx hashes.
- `out/screens/*.png` — apex directory, live-filter cards, agent site, console token page.
- `out/demo.webm` — optional full walkthrough recording (when `RECORD=1`).

## Run

```bash
# 1. Fund the deployer from the Circle Arc faucet:
#    https://faucet.circle.com  (Arc testnet)
#    The deployer just needs a few USDC; a full seed is < 1 USDC gas + deposits.

# 2. Set the one required secret
cp .env.example .env
# edit .env: FUNDING_KEY=0x...

# 3. Seed the chain + executor + showcase
cd demo-suite
npm run seed

# 4. Capture screenshots / short recording
npm run verify

# Or both
npm run demo
```

## Environment

| Var | Purpose |
|---|---|
| `FUNDING_KEY` | Private key with native USDC on Arc testnet. |
| `ARC_RPC_URL` | Optional; defaults to `https://rpc.testnet.arc.io`. |
| `EXECUTOR_URL` | Optional; defaults to `https://api.agenticbusinessconsole.com`. |
| `APEX_URL` | Optional; defaults to `https://agenticbusinessconsole.com`. |
| `CONSOLE_URL` | Optional; defaults to `https://app.agenticbusinessconsole.com`. |
| `RECORD` | Set `1` to record a WebM walkthrough (requires system Chrome). |

## Safety

- All keys generated or read here are throwaway testnet keys.
- Never commit `.env`.
- The suite waits for blocks/pools to settle; a full run takes ~5–15 min depending on window lengths.

## Extending

Add more scenarios in `phases/`. Each phase receives the shared `state` object and the `ctx` (viem clients + API helpers) and is expected to be idempotent where possible (check `state` before re-running).

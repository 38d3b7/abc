# Contracts vs. ideal business logic: gaps (second review)

- **Compared:** the smart contracts on branch `review/contracts-arc-port` (working tree, including all uncommitted review fixes) against `business-logic.md`.
- **Scope:** on-chain rules only. Wallets, the intent pipeline, the ledger, the showcase and the console are off-chain and not covered.
- **Tests:** `forge test` — 60 passed, 0 failed (`LGEHookTest` 59, `LGEManagerTest` 1).
- **Date:** 2026-10-03.

**Summary:** the sale, the 50/50 split, success and failure, the treasury order, the 12-month lock, the fee split, the LP lock and the exit gate now all follow the document. Six gaps from the first review are closed. Two serious gaps remain, both about who controls the agent: the agent chooses its own operator, and there is no on-chain spending policy. The rest are launch-parameter and edge-case differences.

## Open gaps

### 1. The agent chooses its own operator

`src/LGEManager.sol:113` (`deployToken`), `src/hooks/LGEHook.sol:738` (`setAgent`)

- **Document (§9):** the operator, not the agent, rotates the agent's beneficiary address.
- **Code:** only the agent can launch (`msg.sender == tokenAdmin`), and the launch config includes `operator`. So the agent picks its operator. It can name itself, or a second address it controls, and then rotate the vesting grant, the inference credit and future fees wherever it likes. Nothing ties the operator to the human who created the agent.
- **Needs:** an operator the agent doesn't choose, for example set by a protocol-controlled agent registry, or a launch authorised by the operator's own signature. This is the same identity anchor as gap 3.

### 2. No on-chain spending policy for the agent

- **Document:** per-transaction limits, daily caps, allowlists and confirmation thresholds "live in contracts", and the operator can "pause the agent" and "update policy limits".
- **Code:** no contract in `contracts/` holds the agent's wallet policy or a pause switch. The only on-chain limits are on the inference escrow (`gasCap` per call, `gasBudget` lifetime). If policy is meant to live in a smart account or wallet module outside this repo, this gap belongs there.

### 3. "One agent, one token" holds per address only

`src/LGEManager.sol:113`, `:136` (`statusOf`)

- **Document (§9):** a successful launch is final: one agent, one token.
- **Code:** enforced per launching address. A fresh key, or a rotation to a fresh address followed by a launch from it, is a new identity to the contract.
- **Needs:** a protocol-level agent registry (slug-based or otherwise). This is a product decision.

### 4. Launch parameters are mostly unvalidated

`src/LGEManager.sol:113`

- **Document (§2):** the agent proposes the parameters and the operator confirms them.
- **Code:** only the fee (≤ 3%, in the hook constructor) and the vesting cliff (≥ 365 days) are checked.
  - A start price above the end price deploys, and every deposit then reverts.
  - A start block in the past and a zero-length window deploy without complaint.
  - A zero exit threshold deploys and silently means "exits never open", a rule the document doesn't have (`src/hooks/LGEHook.sol:658`).

### 5. Deposits are accepted before the window opens

`src/hooks/LGEHook.sol:351-353`

- **Document (§3):** supporters deposit during the window; the sale starts at the chosen block.
- **Code:** `_deposit` checks only the end of the window. Deposits before `startBlock` are accepted at the starting price.

### 6. The pool doesn't open exactly at the clearing rate

`src/hooks/LGEHook.sol:427-429`

- **Document (§4):** price = total supply ÷ pool-half USDC.
- **Code:** two integer truncations (the division, then an integer square root).
  - At the scripts' ratios the error is negligible; at small ratios it is large.
  - Tokens that don't fit the position stay in the hook.
  - If the ratio is below 1, the final deposit reverts and the sale can't succeed.

### 7. Operator vs. agent: who starts a retry

`src/LGEManager.sol:117`

- **Document:** §9 says the operator can "start a new token launch if the previous one failed"; §2 says "the agent deploys the token and the hook".
- **Code:** only the agent can launch. This matches §2. If §9 means the operator sends the transaction, it conflicts with the code; if it means the operator instructs the agent, there is no gap. Worth clarifying in the document.

## Smaller divergences

- **"Anyone can trade" (§6):** exact-output sells and partial fills revert (`src/hooks/LGEHook.sol:903`), so some routers can't use the pool.
- **"25% to participants, in perpetuity" (§6):** if every participant exits, their share goes to the protocol (`src/hooks/LGEHook.sol:948`). The document doesn't cover that case.
- **Protocol claims (§6):** `claimProtocol` needs at least 25 USDC accrued (`src/hooks/LGEHook.sol:760`) and pays through a splits table. Neither is in the document, though neither contradicts it.
- **Agent fees (§6 versus Key rules):** the agent's 50% fee share is paid as raw USDC via `claimAgent`. That's consistent with §6; if "the agent gets no free USDC" was meant to cover fees too, the document contradicts itself.
- **Gas allowance (§5):** the agent can still take up to `gasBudget` of its inference credit as raw USDC for gas. The budget is small by design and can only be lowered after it is first set, but its first value is whatever the escrow owner chooses (`src/InferenceEscrow.sol:129`).
- **Vesting duration (§5):** the vault counts duration from the grant start, not from the cliff. With a 365-day cliff, a 365-day duration unlocks everything at month 12, and a longer one releases the elapsed share at the cliff, then the rest linearly. Both satisfy "locked for 12 months"; the document doesn't say what happens after.

## Closed since the first review

| # (first review) | Gap | Fix | Tests |
|---|---|---|---|
| 1 | Agent could drain its inference credit as raw USDC | Lifetime `gasBudget` per hook, lowerable only | `test_fundGasLoopStopsAtBudget`, `test_fundGasDisabledUntilBudgetSet`, `test_gasBudgetCanOnlyBeLowered` |
| 2 | Operator couldn't rotate the beneficiary | Per-launch `operator`; rotation moves the vest, credit follows the hook's agent, old agent paid its fees | `test_rotationMovesVestCreditAndPaysOldAgentFees`, `test_gasBudgetSurvivesRotation`, `test_setAgentGuards`, `test_rotationBeforeSuccess`, `test_foreignLaunchCannotTakeAgentCredit` |
| 3 | "One agent, one token" not enforced | Agent launches for itself; status derived from the latest hook | `test_launchStatusLifecycle`, `test_launchWhileActiveReverts`, `test_secondLaunchAfterSuccessReverts`, `test_retryAfterFailureIsOneTransaction`, `test_launchForOtherAgentReverts`, `test_rotationDoesNotUnlockSecondLaunch` |
| 5 | 12-month lock not guaranteed | `vestingCliff ≥ 365 days` at launch; scripts updated | `test_launchRequiresTwelveMonthCliff`, `test_vestingSchedule` |
| 6 | Vesting bypass on a retried treasury buy | Only the token's hook can create or move grants | `test_vaultOnlyTokenHook` |

Also fixed during the security review: reentrancy in `claimPendingNative`, reentrancy in `_deposit`, and the raise sized from the contract balance (`test_claimPendingNativeReentrancyPaysOnce`, `test_depositReentrancyCannotOvershootCap`, `test_finalizeIgnoresParkedCreditsAndDonations`).

## Where the contracts match

- Native 18-decimal USDC deposits, priced by block on a Dutch curve.
- Both deposit variants, with and without buyer protection.
- The 50/50 split of each deposit.
- All-or-nothing sale with full refunds of both halves on failure.
- One hook-held full-range position and a 0% LP fee.
- Treasury order: 5% buy into a vesting grant locked for at least 12 months and claimable only by the agent, then the remainder to the inference escrow.
- Inference credit spendable only on the provider, plus a capped gas allowance.
- The fee on the USDC leg, split 25/50/25 and pull-based, with participants weighted by their liquidity-half deposit.
- The cohort lock (participant fees booked ≥ total raised), the 30-day volume exit gate, and exit paying accrued fees while forfeiting future ones.
- Operator rotation of the agent, moving the vest and spending rights.
- One successful launch per agent address, with one-transaction retries after a failure.

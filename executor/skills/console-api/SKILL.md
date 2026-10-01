---
name: console-api
description: The executor API and intent surface the agent operates through — routes, idempotency, intent types, and the pipeline states its actions move through.
---

# Console API

The agent acts by raising typed intents. Every intent moves through the pipeline states: QUEUED, QUOTED, SIMULATED, POLICY_PASSED, SIGNED, BROADCAST, then FINAL, or a terminal DROPPED / REVERTED / REJECTED with the reason recorded. An intent above the confirmation threshold waits in AWAITING_CONFIRMATION until the operator confirms it in the console.

Intent types: get_balances (read-only report), transfer (to, amountWei, note), swap (hook, token, side, amount, limits), lge_quote (hook), lge_deposit (hook, amountOfTokens, maxUsdcPerToken, deadline), claim_fees (hook, which of participant/agent/protocol), fund_gas (escrow, amount), create_automation (kind cron/price/fee_accrued, spec, intent).

Every intent carries the agent's one-sentence rationale, Ed25519-signed by the executor. If a tool reports DROPPED with a policy or valuation reason, do not retry the same call — report the refusal and the rule that applied.

The operator reads the same records the agent produces: the Chat section shows instructions and replies, Activity shows the intent ledger, Skills shows what is installed. The agent never claims an action succeeded before its intent reaches FINAL.

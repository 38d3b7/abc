---
name: treasury-ops
description: Move USDC, fund the inference escrow's gas lane, draw inference credit down to the inference key, and schedule standing automations.
---

# Treasury operations

The agent's wallet holds native USDC (18 decimals). Every movement goes
through the pipeline: priced from typed params, simulated, policy-checked,
signed, broadcast. Value above the confirmation threshold pauses for operator
approval — state the rationale well and it clears faster.

## Intents

- `transfer` — send native USDC to an address. `amountWei` is the 18-decimal
  wei string. `note` renders in the ledger. Sends to address(0) revert.
- `fund_gas` — move USDC from the wallet into the inference escrow's gas
  lane so x402-paid calls can settle. `escrow` is the InferenceEscrow
  address from context.
- `draw_inference` — draw the agent's InferenceEscrow credit down to the
  protocol-set inference provider (the key that pays for model calls over
  x402). `amountWei` is the 18-decimal draw. The escrow address comes from
  the chain map, never from you. Draw what the next stretch of inference
  needs — the draw is capped by the agent's remaining credit.
- `create_automation` — a standing rule the worker evaluates: `cron`
  (interval schedule), `price` (hook price crosses a bound), or
  `fee_accrued` (a fee bucket passes a threshold). The automation raises its
  wrapped intent when the condition holds; the same pipeline applies.

## Judgment

- Keep the gas lane funded before scheduling automations that spend.
- Draw inference credit before the balance runs dry, not after — a failed
  charge means the turn does not run.
- Never transfer to an address you cannot name from context. Inventing an
  address is the one unforgivable treasury error.

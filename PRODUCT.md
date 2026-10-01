# ABC

Locked 1 Oct 2026. This file is what we are building. `BASIS.md` is the hackathon constraint set and stays separate. `lge-contracts/CONTEXT.md` describes the hook as it is today.

## What we are building

An agentic business console (ABC). The shape is learned from the Bankr and Clawpump reverse engineering already done for this workspace. LGE is the token launch mechanism.

## The raise

LGE sells the token. Deposits are USDC.

Each deposit still splits in half. One half is paired into the Uniswap v4 pool, and buyers claim that LP. The other half is the amount the current hook calls the project treasury: the half that used to be ETH, and that is not the LP half. At a successful close, that half is spent in this order:

1. Buy 5% of the token supply for the launching agent and lock it in a vesting contract for 12 months. The agent, via its wallet, is who can claim the vested tokens.
2. The balance credits that agent's inference account.

The auction, the all-or-nothing clear, and the full refund on failure stay.

## Fees and LP

Trading fees on the token split three ways: 25% to the participants of its LGE, in perpetuity; 50% to the agent; 25% to the protocol.

Fees are USDC on Arc, so a participant's receipts compare directly to the USDC they deposited. No price conversion. Sum the USDC paid to LGE participants from their 25% share. When that sum equals the total USDC those participants spent in the LGE, they are whole, and their LP locks forever.

Before that test passes, if trading-fee volume drops under a threshold, which is not set yet, an LP can retrieve the position and do what they want with it.

## The agent

Each agent has a real wallet, the same kind of wallet other ABCs give an agent.

In the first phase of a launch, while the agent is looking for supporters of its LGE, the agent creates an app on a subdomain of our site. That app showcases the idea.

## Unset

These are not decided. Leave them unset until a later lock names them:

- Which inference provider the account pays, and what unit a credit is
- Wallet custody, and which Circle wallet type
- Subdomain naming, hosting, and what the phase-1 app is allowed to do

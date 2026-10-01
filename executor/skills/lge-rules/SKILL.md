---
name: lge-rules
description: The ABC raise mechanics — deposit split, vesting, fee split, and the LP lock rule — so the agent can explain and operate its own LGE.
---

# LGE rules

The LGE (Liquidity Generation Event) is how the agent raises USDC. Deposits are USDC.

- Each deposit splits in half. One half pairs into the Uniswap v4 pool; buyers can claim that LP. The other half is the agent's treasury side.
- Of that treasury half, at a successful close: the contract buys 5% of the token supply and locks it in a vesting contract for the agent (12-month vest, claimable only by the agent's wallet), and the balance funds the agent's inference account.
- Trading fees on the token split 25% to LGE participants, 50% to the agent, 25% to the protocol. Participant fees are paid in USDC in perpetuity.
- The LP lock rule: once the USDC a participant has received from fees equals the total USDC they deposited, their LP position locks forever. Before that point, withdrawal terms follow the campaign contract.
- The sale is all-or-nothing: if the supply does not fully sell, the sale fails and depositors are refunded; a failed sale funds nothing.
- The agent's inference account pays the model provider per call; its policy does not allow free transfers out.

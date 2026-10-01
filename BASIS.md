# Tameion basis

Derived 30 Sep 2026 from the kickoff (Alusha, Canteen) and the published brief at [tameion.thecanteenapp.com](https://tameion.thecanteenapp.com/). Speech-to-text names are corrected to the site: **Tameion** (ταμεῖον), vestiarion, chartoularios, Lepton, Omi.

This file is the constraint set for the build. It is not a product spec.

## Event

| | |
|---|---|
| Name | Tameion Agents Hackathon · Canteen × Circle |
| Series | Third agent-and-payments event, after Agora and Lepton |
| Window | 27 Sep – 10 Oct 2026, online, invite-only |
| Deadline | 10 Oct 2026, 11:59 PM ET. Resubmit as often as you like |
| Settlement | Arc, Circle’s stablecoin L1. USDC is gas. Finality under 500 ms. Fees about $0.01, paid in USDC |
| Prize | $40k cash or equivalent. 1st $10k (1). 2nd $7.5k (1). 3rd $5k × 3. Standout cohort $7.5k split across 10–12 teams (~$650–$750), unranked |
| What outlasts the pool | Follow-on funding, grants, and partnership across Canteen, Circle, and Arc. The two weeks are how they meet teams they intend to back after the event |

Hosts: **Canteen** organises (research and technology firm at AI, payments, and markets). **Circle** is the platform (issuer of USDC and EURC). **Arc** is the settlement layer. Kickoff host is Alusha (“helping hackers” at Canteen; Claw community ambassador), streaming from Belgrade. Any LLM is allowed.

Friends of Canteen named on the kickoff: a test mint for extra Arc testnet tokens when the faucet is short, and **Omi** (spoken “Aomi” / “OMI labs”), an execution harness for onchain finance, with a session on building onchain agents safely and office hours immediately after. The site lists that harness under “friends of Canteen” without a URL in the page text.

## The problem the judges are buying

A business’s money is not one balance. Cash sits in several accounts and earns nothing. Invoices are owed out and in. Contractors wait on milestones. Subscriptions renew whether anyone opened the tool. Compliance hangs over every counterparty. For a global business that splits across countries, currencies, rails, and time zones.

None of those decisions is hard alone. There are thousands of them, and they depend on each other. A person reading a spreadsheet still makes them. Software can now hold and move the money, which is the work an agent is for, settled on Arc.

## What “good” means

From the FAQ, in this order:

1. It runs on Arc. Payments actually flow in USDC, testnet or mainnet, on the Circle Agent Stack.
2. The builder intends to keep going after 10 Oct. A demo abandoned the day after the deadline is not the target.
3. A real business is already using it, on a problem they have. A freelancer with three invoices, a two-person agency paying contractors abroad, a studio with unused SaaS seats, your own company, or an open-source project that has never been able to take money in. A synthetic dataset does not count. If nobody’s money is on the other side of the decision, the agent is not being tested.

Existing projects may be submitted. Judges score the delta during Tameion, on product and on traction equally. State where the product and the user count were on 27 Sep, and where both are at submission.

Mainnet is not required. Real USDC on mainnet counts more than testnet USDC. Testnet usage still counts if it is genuine.

Agent authority sits between two failures. Asking permission for every payment is a form with extra steps. Moving the whole treasury on the model’s judgment is something nobody will run. The limit has to live somewhere the agent cannot talk past: a contract that enforces the budget, a threshold a human signs above, and a complete record produced afterwards. Delegated authority spends freely and is reviewed after the fact.

## Judging

Weightings are recommendations. Judges have the final say. The site says the best projects tend to break the rules. There is no live demo day. Judging is asynchronous off the form, the repo, and the live URL.

| Weight | Criterion | What it means |
|---|---|---|
| 30% | Agentic sophistication | The agent chooses and can explain why. A cron job with a language model bolted on loses to an agent that decides when to pay. |
| 30% | Traction | Real businesses, payments flowing in USDC, volume you can point to. Bought X followers do not count. “The build will speak for itself” is the failure mode they called out. |
| 20% | Circle tool usage | Useful use of Wallets, Paymaster, App Kit, CCTP, Gateway, USYC, contracts, USDC, EURC. A strong project uses a couple, not all of them. |
| 20% | Innovation | New territory. A polished re-run of a sample app loses. |

Traction practice from the kickoff, not a scoring rubric: define a small ideal customer, talk to them weekly, and read *The Mom Test* before those conversations. Paul Graham’s [What I've Learned from Users](https://www.paulgraham.com/users.html) is the other assigned read: if you can say what you learned from users in the last few days, the project is pointed the right way. Two weeks is the whole window. First users can be yourself, a freelancer who invoices, or an agency with subscriptions nobody opens.

## Requests for builders

RFBs are prompts in the style of YC’s Requests for Startups. They are not tracks. No favoured RFB. A build that cuts across several is closer to a real finance function. Surprises are in scope.

### RFB 1 — Intelligent business treasury

Cash spread across accounts and chains, earning nothing while it waits.

The agent forecasts cash flow and runway, allocates across accounts and entities, decides when to deploy cash and when to preserve it, moves idle funds into USYC and redeems when cash is needed, warns on budgets by department or project, and times large expenditures.

Builders ship: a multichain treasury with one balance view, forecasting with runway alerts, USYC yield on the reserve, budget and departmental allocation.

Example on the site: TreasuryAI — cash across accounts, runway, burn-rate change, operating vs reserve, yield on the reserve.

Metrics: businesses using it, funds under management, forecast accuracy, treasury operations automated per week.

Start here: [circlefin/arc-fintech](https://github.com/circlefin/arc-fintech).

### RFB 2 — AP/AR automation

Invoices still read by hand and paid whenever someone gets to them. Tedious, error-prone, and an invitation to fraud.

The agent reads invoices, emails, and contracts to work out what is owed, chooses early-pay discount vs preserving cash, prioritises collections from how each customer has behaved, catches duplicates and probable fraud, screens a vendor wallet before paying, and matches payments to invoices.

Builders ship: ingestion from email, PDF, or API; payment-timing; address screening in the payment path; collections follow-ups timed to the customer.

Example: PayablesAI — reads invoices from email, checks the contract, screens the address, pays on the right day, chases receivables on its own schedule.

Metrics: invoices processed, payment volume, days payable and days receivable outstanding before and after, duplicate invoices caught.

### RFB 3 — Contractor and vendor network

Dozens of vendors, no written memory of which were any good.

The agent schedules payment against milestones, scores reputation from delivery and quality rather than testimonials, screens at onboarding before the first payment, negotiates from market rates, discovers and matches vendors to a need, and sets credit limits from payment history.

Builders ship: onboarding with screening, milestone escrow and release, reputation ranking, discovery and matching.

Example: VendorAI — screens each wallet, releases milestones once work is verified, scores from what happened, suggests the next vendor from the pattern.

Metrics: contractors and vendors managed, payment volume, on-time payment rate, vendor satisfaction.

Start here: [circlefin/arc-escrow](https://github.com/circlefin/arc-escrow).

### RFB 4 — Autonomous business operator

Revenue comes in, bills come due, and a person still sits between every dollar.

The agent receives and holds USDC, watches cash against obligations, decides when to pay a vendor or buy a service, moves funds between operating, reserve, and yield, stays inside budgets and approval limits, and writes down why. It escalates only when a policy threshold is hit.

Demonstrate at least one workflow end to end: receive revenue, assess liquidity, purchase a service or pay an obligation, record the decision and the transaction, escalate only on a policy threshold.

Examples: OperatorAI (revenue in, 30-day obligations vs cash on hand, pays what clears policy, buys API credits before they run out, surplus to reserve, logs the reason, pings a human only above the approval limit). PolicyWallet (per-category budgets and per-transaction limits in the contract, so authority cannot be talked past).

Metrics: businesses operated, USDC received and paid out, obligations settled on time with no human touch, decisions made vs escalated, and how often the human agreed with the escalations.

Start here: [circlefin/arc-x402-circle-wallets](https://github.com/circlefin/arc-x402-circle-wallets).

### RFB 5 — Compliance intelligence

Screening today is a yes-or-no check, run once at the moment of payment. The need is continuous monitoring.

The agent scales limits to risk instead of a single allow-or-block, decides when enhanced due diligence is warranted (PEP, high-risk industry), decides how often to rescreen, distinguishes indirect exposure that matters (your vendor’s vendor) from exposure that does not, and prices payment terms to the risk profile.

Builders ship: continuous counterparty monitoring, risk-tiered limits, indirect-exposure view across the vendor network, audit-ready reports.

Examples: ComplianceAI (alerts on a changed risk profile, adjusts credit limits, writes a report a regulator would accept). RiskTier (low gets full access, medium gets reduced limits, high requires a human). ExposureMap (second-degree sanctions exposure, surfaced before it is your problem).

Metrics: addresses monitored, alerts generated and resolved, risk events caught before the transaction, compliance reports generated.

## Ledger constraint

Read before the agent posts its first entry: [Agents and Ledgers in 2026](https://thecanteenapp.com/analysis/2026/09/12/agents-and-ledgers.html) (12 Sep 2026). Canteen read the source of nine open-source accounting systems. The kickoff called this the highest-leverage read of the event. Build on one of them, or know why you are not.

Double entry checks that debits equal credits. These six errors all pass that check:

| Error | What it is |
|---|---|
| Omission | A transaction nobody recorded |
| Commission | Right amount, wrong account of the same kind (wrong vendor) |
| Principle | Right amount, wrong kind of account (asset booked as an expense) |
| Original entry | Wrong amount on both sides |
| Compensating | Two mistakes that cancel |
| Complete reversal | Debit and credit swapped |

An agent adds three more that still balance: naming the recipient instead of the sender, recording a payment that never arrived, and retrying after a timeout so the same invoice is paid twice. It can also read `6.000000` as `6.00`, and a ledger that “repairs” the gap hides it.

Controls that catch these live outside the trial balance: reconciliation against an independent record, three-way match of invoice to order to receipt, change control on the vendor’s payment details, and a period cutoff.

On a shared chain, payer and payee read the same record. Reconciling your ledger against Arc proves you did what you recorded. It is not an independent witness, and it does not catch a wrong payee. The chain confirming the transfer is not the three-way match.

The nine systems, and where a model is allowed to write:

| System | What a transaction is | Where a model can write | The catch |
|---|---|---|---|
| Odoo | The invoice is the journal entry. Unbalanced moves refused. Posted entries hash-linked | Community MCP outside Odoo. Direct create, write, and delete are blocked | Document and entry are one object. Vendor bank changes are logged |
| ERPNext | GL entries are a side effect of a submitted voucher. Cancellation writes mirror entries | `frappe/mcp` runs inside the framework’s own validation | Three-way match exists and defaults to off. Imbalances up to half a unit are booked silently to Round Off |
| GnuCash | Value in the transaction currency and amount in the account commodity | None in the codebase | An imbalance posts to a visible Imbalance account |
| beancount | Text, validated on load. A Balance directive asserts a balance with a declared tolerance | `smart_importer` predicts accounts. The next assertion catches a wrong guess | Precision is a property of the claim, not of the column |
| Firefly III | One negative and one positive. No chart of accounts. A rule can delete a journal | Refused. The FAQ calls it impossible to do reliably | Calls itself double entry and lets a rule delete an entry |
| Invoice Ninja | A running balance per client. One payment can apply across many invoices | None in the codebase | Marked a €0.10 subscription paid with no payment, from one integer cast |
| Kill Bill | A committed invoice cannot be changed. Corrections are new typed adjustments | None in the codebase | Immutability by construction |
| SolidInvoice | The invoice table is the books. A state machine governs transitions | The most complete write path here. Payments and transitions are MCP tools | Can record a payment that never happened and has no way to find out |
| Ghostfolio | Buy and sell activities, stored as floats | One write tool, through the same service as the UI, with a dry run | The only write path that returns an idempotency signal (`IS_DUPLICATE`) |

Two shapes matter. Where the document is the entry (Odoo, ERPNext), the system can ask which document an entry is for, and match and change-control have a place in the schema. Where the ledger is a running balance beside the invoice, those checks have nowhere to attach, and a write tool adds risk with nothing to catch it.

Design decisions the blog ends on. These are the build rules:

1. Start from a ledger where the entry points at a document.
2. Turn on controls that already exist. Compare an entry to an order, a receipt, and the last account paid, not to the other side of the same entry.
3. Put a witness in front of every write path. A bank feed turns a phantom payment into something that does not reconcile. A chain proves consistency, not independence. Neither catches a wrong payee, so the document-side checks still have to exist.
4. Make repair loud, or make it refuse. GnuCash’s Imbalance account and beancount’s tolerance show the disagreement. ERPNext’s half-unit allowance hides it in a normal expense account. Do not post six-decimal settlement into a ledger that rounds the residual away.
5. Route agent writes through the code the UI already uses, so the agent inherits validation, permissions, and lifecycle. Return an idempotency signal per row. Support a dry run.
6. Keep the model’s output as an input, never as the release condition. The published Arc escrow sample releases funds on a model confidence string and never reads the `releaseTimestamp` it stores. The prompt tells the model it may disregard requirements that are not visual. Copy the Paperless-ngx pattern instead: the model’s correspondent is a suggestion a person confirms. The contract may still guarantee funds move only to the payee, only once, and only up to the balance. That is not a check that the work was done.

## Stack

Use what the product needs. The site’s framing: Mint to issue, Gateway and USYC to hold, App Kit Send and CCTP to pay. Nobody has shipped one agent that runs all three for a company.

| Primitive | What it is for |
|---|---|
| Circle Agent Stack | Give an agent its own wallet, let it pay, keep it inside guardrails. [developers.circle.com/agent-stack](https://developers.circle.com/agent-stack) |
| Wallets | One treasury wallet, smaller wallets per team, one per contractor. All of them trackable |
| Paymaster | Someone else pays the fee, in USDC. Gasless internal transfers and vendor payments. The vendor never holds a gas token |
| CCTP | Burn-and-mint of real USDC onto the chain the contractor wants. No wrapped asset |
| Gateway | One USDC balance across chains, spendable immediately. The precondition for a forecast |
| USYC | Tokenized money-market fund. Idle USDC earns. Redeem when the forecast says cash is needed. The hard part is timing, not the yield |
| Contracts | Budget rules, approval thresholds, milestone escrow, subscription logic. An MD file is not a control |
| USDC and EURC | Both native on Arc. A euro invoice is paid in euros |
| Onchain FX | Convert between stable currencies as money crosses markets. Sample: [circlefin/arc-stablecoin-fx](https://github.com/circlefin/arc-stablecoin-fx) |
| App Kit | One typed API for Send, Bridge, Swap, and Unified Balance. All-in-one SDK or individual kits. [docs.arc.network](https://docs.arc.network) |

Other sample apps, to fork rather than rebuild: [arc-nanopayments](https://github.com/circlefin/arc-nanopayments), [arc-multichain-wallet](https://github.com/circlefin/arc-multichain-wallet), [arc-p2p-payments](https://github.com/circlefin/arc-p2p-payments), [arc-commerce](https://github.com/circlefin/arc-commerce), [arc-ecommerce-payments](https://github.com/circlefin/arc-ecommerce-payments) (authorize, capture, void, refund in USDC or EURC), [arc-defi-lend-borrow](https://github.com/circlefin/arc-defi-lend-borrow) (lend and borrow USDC against cirBTC).

## Prior art the site pairs with the RFBs

Each is an old control, and the hack is the agent-shaped version. The open-source tools named on the site stop short of money that moves.

| | Old control | Hack | Ties to |
|---|---|---|---|
| 1 | Athenian euthyna: the official could not leave until the accounts were set straight | A signed append-only record of every decision: the balance seen, the forecast run, the rule applied, the payment sent, so a reviewer replays the reasoning | RFB 1, RFB 5. beancount, Firefly III |
| 2 | Parable of the Talents: idle silver buried in the ground | Move reserves into USYC and redeem early enough that payroll clears and late enough that the reserve earned | RFB 1 |
| 3 | Symbolon: an object broken in two, real only when the halves fit | Signed digital halves for purchase order, receipt, and invoice. Release the moment they match | RFB 2. invoice2data, paperless-ngx, OCA account-invoicing |
| 4 | Horoi: a stone in the field naming the debt and the creditor, readable from the road | Publish the claim, not the counterparty’s private books, so a credit limit is set against what is owed across creditors, not what each lender is shown | RFB 2, RFB 3. OCA credit-control models dunning and cannot see past its own instance |
| 5 | Misthos: Athens paid the day’s wage the day it was worked | Pay per verified milestone or per day. Forty payments a month cost about forty cents | RFB 3. arc-escrow, Kimai, Frappe HR |
| 6 | Agoranomoi: the seller’s cup checked against the public measure | Meter consumption independently of the vendor’s invoice. Cancel seats nobody opens. Flag two teams paying for the same capability | RFB 4. Snipe-IT, Lago, OpenMeter |
| 7 | Megarian Decree: a static exclusion list, stale the moment it was carved | Continuous rescreening, one hop out to the vendor’s vendor. Medium risk gets a lower limit, not a refusal | RFB 5. OpenSanctions yente, nomenklatura |
| 8 | Vestiarion: the wardrobe that grew into minting, stores, and paying the army | One agent that issues, holds, and pays | RFB 1 |

Item 4 is the credit hook in the official brief: a lien you can read, that nobody can quietly amend, so a limit is priced off the whole of what is owed. Item 5 is the float hook: net-30 exists because payments used to be expensive, and a contractor waiting thirty days is lending the business money at zero interest.

## Operating requirements

Submission form: https://forms.gle/BBWrdfuircrKiG2i6

Required: public GitHub repo, and a recorded demo under 3 minutes (Loom, YouTube, or Vimeo). A live URL is optional and strongly encouraged. Judges click around without you in the room. The form asks how many businesses are onboarded, how much value the agent moved, and what problems you are solving for them.

Register on Luma if not already: https://luma.com/ivroypr5. Passphrase for priority access, as published on the site: `DIRECTx42490`. GitHub handle and Discord handle are how submissions are collated.

Discords:

- Canteen. Kickoff message: https://discord.gg/bDaEfsSqc8. Site currently: https://discord.gg/rsVfYutFZg. Say who you are and what you are building.
- Arc builders: https://discord.com/invite/buildonarc. Mention Canteen + Tameion in onboarding. If rejected, ping `@kdrohan` in the Canteen Discord.
- Slide deck and the recorded Arc 101 session are posted in the Canteen Discord. Fireside chats are peers who already have users.

CLI. The binary is `arc-canteen`. Kickoff and site install line:

```bash
uv tool install git+https://github.com/the-canteen-dev/ARC-cli
```

The repo README also documents `uv tool install arc-canteen`. Docs: https://arc-node.thecanteenapp.com. After `arc-canteen login`, use the authenticated RPC (`arc-canteen rpc-url`, or `$RPC` via `arc-canteen shell-init`). The public endpoint in the Arc docs does not attribute traffic, and attribution is how they track progress across the two weeks. Rotate with `arc-canteen rotate-rpc-key`. `arc-canteen wallet` creates a testnet wallet funded with $5 USDC on first run.

Progress log, which judges read:

```bash
arc-canteen update traction
arc-canteen update product
```

`arc-canteen context` dumps Arc and Circle docs plus sample apps as agent context. `arc-canteen context sync` clones that bundle.

Circle CLI:

```bash
npm install -g @circle-fin/cli
```

Node.js v20.18.2 or newer. Agent wallets, x402-compatible payments, and crosschain USDC from the command line. Docs: https://developers.circle.com/agent-stack/circle-cli.

## Sources

- Kickoff transcript, 30 Sep 2026, Alusha (Canteen), Belgrade.
- https://tameion.thecanteenapp.com/
- https://thecanteenapp.com/analysis/2026/09/12/agents-and-ledgers.html
- https://github.com/the-canteen-dev/ARC-cli (README: command names and the authenticated RPC)

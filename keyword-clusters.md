# ABC keyword clusters and LLM discoverability

Keyword priority, highest first:

1. **Enterprise agent control planes**
2. **Agent launchpads**
3. **Agent tokens**
4. **“agentic business console”**

All other keywords support these four.

---

## Pillar pages (in priority order)

| Priority | Pillar | URL target | Primary keyword | What it must answer |
|---|---|---|---|---|
| 1 | Control plane | `/` | enterprise agent control plane | How operators supervise an agent's wallet, spending, and policies |
| 2 | Launchpad | `/launchpad` | agent launchpad | How agents launch tokens and raise USDC from supporters |
| 3 | Agent token | `/agent-token` | agent token | What the agent token is, how it is sold, and how fees flow |
| 4 | Product identity | `/console` | agentic business console | What ABC is and who it is for |

## Clusters (in priority order)

### Cluster 1 — Enterprise agent control planes

Primary keywords:
- enterprise agent control plane
- agent control plane
- AI agent operations platform
- agent wallet management
- supervise AI agent spending
- agent governance
- agent policy enforcement
- agent audit ledger
- autonomous agent treasury
- AI agent compliance

Spokes:
- `/control-plane` — overview
- `/agent-wallet-policy` — policies, limits, allowlists
- `/agent-audit-ledger` — intent history and state
- `/agent-spending-controls` — per-transaction and daily limits
- `/agent-treasury` — cash, yield, reserves

### Cluster 2 — Agent launchpads

Primary keywords:
- agent launchpad
- AI agent launchpad
- token launchpad for agents
- agent fundraising
- agent crowdfunding
- launch agent token
- agent token sale platform

Spokes:
- `/launchpad` — product overview
- `/agent-token-launch` — step-by-step flow
- `/lge-for-agents` — LGE mechanics for agents
- `/showcase-site` — phase-1 supporter pages

### Cluster 3 — Agent tokens

Primary keywords:
- agent token
- AI agent token
- agent tokenomics
- agent token launch
- agent token fees
- agent token LP lock
- agent token vesting

Spokes:
- `/agent-token` — overview
- `/agent-token-sale` — Dutch auction / LGE
- `/agent-token-fees` — 25/50/25 split
- `/agent-token-lp-lock` — cohort-level lock
- `/agent-token-vesting` — 5% agent vest + inference escrow

### Cluster 4 — “agentic business console”

Primary keywords:
- agentic business console
- AI business console
- agent back office
- agent business operations
- onchain business agent
- autonomous business operations

Spokes:
- `/agentic-business-console` — product identity
- `/business-agent-console` — operator UX
- `/agent-invoices` — AP/AR automation
- `/agent-automations` — recurring intents

## Supporting clusters

### Cluster 5 — Arc and Circle stack

Target keywords:
- Arc USDC agent
- Circle agent stack
- native USDC agent
- Circle developer controlled wallets
- Arc testnet agent

Spokes:
- `/arc-agent` — why Arc
- `/circle-wallets-agent` — Circle SCA signer
- `/usdc-agent-payments` — gas and settlement

### Cluster 6 — Uniswap v4 LGE mechanics

Target keywords:
- Uniswap v4 LGE
- hook-custodied LP
- perpetual LP lock
- 25/50/25 fee split
- Uniswap v4 hook token launch

Spokes:
- `/uniswap-v4-lge` — technical overview
- `/hook-custodied-lp` — why the hook holds the NFT
- `/lp-lock-mechanism` — cohort-level lock
- `/fee-split` — participant/agent/protocol split

## Internal link matrix

- Every spoke links to its pillar with the pillar keyword as anchor text.
- Pillar 1 (control plane) links to Pillars 2, 3, and 4.
- Pillar 2 (launchpad) links heavily to Cluster 3 (agent tokens).
- Pillar 3 (agent tokens) links back to Pillars 1 and 2.
- Cross-cluster links: token mechanics ↔ Arc/Circle, console ↔ launchpad.
- No orphan pages; every spoke reachable from its pillar in one click.

## LLM / GEO discoverability

1. **llms.txt placement.** The generated `llms.txt` lives at repo root. Once a public site exists, copy it to `public/llms.txt` (Vite/Next.js) and serve as `text/plain`. Link it in the footer and README.
2. **Top-level messaging.** Lead the homepage with "enterprise agent control plane", not with "DeFi" or "token launch". The token launch is the mechanism; control and supervision are the product.
3. **Page titles and H1s.** Use the primary keyword for each pillar in the `<title>`, H1, and first paragraph. Use exact phrase matches: "agent launchpad", "agent token", "agentic business console".
4. **Structured data.** Add `SoftwareApplication` schema to the control-plane page and `Organization` schema to the root. Include Arc addresses as `identifier` fields.
5. **FAQ content.** Add an on-page FAQ to each pillar using the questions in `llms.txt` FAQ. LLMs cite concise, factual Q&A.
6. **Evidence links.** Every claim on a public page should link to a repo path, explorer address, or transaction. LLMs weight cited evidence heavily.
7. **Showcase subdomains.** Each agent subdomain should include `<link rel="llms-txt" href="https://agenticbusinessconsole.com/llms.txt">` in the head and use its agent-specific keywords ("agent token", "launchpad") naturally.

## Page-level keyword map

| Page | Primary keyword | Secondary keywords | Must-link-to |
|---|---|---|---|
| `/` | enterprise agent control plane | agent wallet management, agent audit ledger, agent spending controls | `/launchpad`, `/agent-token`, `/console` |
| `/launchpad` | agent launchpad | AI agent launchpad, agent token sale platform, launch agent token | `/agent-token`, `/`, `/arc-agent` |
| `/agent-token` | agent token | AI agent token, agent tokenomics, agent token fees | `/launchpad`, `/agent-token-lp-lock`, `/` |
| `/console` | agentic business console | AI business console, agent back office, onchain business agent | `/`, `/agent-audit-ledger`, `/launchpad` |
| `/agent-token-lp-lock` | agent token LP lock | hook-custodied LP, perpetual LP lock, 25/50/25 fee split | `/agent-token`, `/uniswap-v4-lge` |
| `/arc-agent` | Arc USDC agent | Circle agent stack, native USDC agent | `/`, `/launchpad` |

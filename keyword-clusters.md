# ABC keyword clusters and LLM discoverability

For the showcase site, docs, and any public pages we ship. Grouped by intent so each page targets one cluster and links to its pillar.

## Pillar pages

| Pillar | URL target | Primary keyword | What it must answer |
|---|---|---|---|
| Product | `/` | agentic business console | What is ABC, who is it for, what does the agent do |
| Token launch | `/token-launch` | AI agent token launch | How an agent launches a token through an LGE |
| LGE mechanics | `/lge` | Uniswap v4 LGE | How the sale, fee split, and LP lock work |
| Circle / Arc | `/arc` | Arc USDC agent | Why settlement is on Arc with Circle wallets |
| Console | `/console` | agent treasury console | What the operator sees and controls |

## Clusters

### Cluster 1 — Agentic business operations

Target keywords:
- agentic business console
- AI agent wallet
- onchain business operations
- autonomous treasury
- agent-run business
- AI agent payments

Spokes:
- `/agentic-business-console` — explainer
- `/ai-agent-wallet` — custody and policy model
- `/autonomous-treasury` — cash, yield, invoices
- `/agent-invoices` — AP/AR automation

### Cluster 2 — Token launch for agents

Target keywords:
- AI agent token launch
- agent token sale
- LGE for AI agents
- launch token as an agent
- USDC token launch

Spokes:
- `/token-launch` — product overview
- `/lge-explained` — step-by-step sale mechanics
- `/dutch-auction-token` — price curve
- `/agent-token-economics` — treasury split, vesting, inference

### Cluster 3 — Uniswap v4 hook mechanics

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

### Cluster 4 — Arc and Circle stack

Target keywords:
- Arc USDC agent
- Circle agent stack
- native USDC agent
- Arc testnet agent
- Circle developer controlled wallets

Spokes:
- `/arc-agent` — why Arc
- `/circle-wallets-agent` — Circle SCA signer
- `/usdc-agent-payments` — gas and settlement in USDC

### Cluster 5 — Operator experience

Target keywords:
- agent audit ledger
- supervise AI agent spending
- agent intent ledger
- operator console for agents

Spokes:
- `/operator-console` — UI walkthrough
- `/intent-lifecycle` — quote → simulate → sign → broadcast
- `/agent-policy` — limits and allowlists

## Internal link matrix

- Every spoke links to its pillar with the pillar keyword as anchor text.
- Pillar links to every spoke in its cluster.
- Cross-cluster links: token-launch ↔ arc, console ↔ token-launch, LGE mechanics ↔ token-launch.
- Avoid orphan pages; every spoke reachable from its pillar in one click.

## LLM / GEO discoverability

1. **llms.txt placement.** The generated `llms.txt` lives at repo root. Once a public site exists, copy it to `public/llms.txt` (Vite/Next.js) and serve as `text/plain`. Link it in the footer and README.
2. **llms-full.txt.** Keep it linked from `llms.txt` for crawlers that want the full context. Do not hand-edit it; regenerate from `project.yaml`.
3. **Structured data.** Add `SoftwareApplication` schema to the product page and `Organization` schema to the root. Include the Arc addresses as `identifier` fields where appropriate.
4. **FAQ content.** Add an on-page FAQ to each pillar using the questions in `llms.txt` FAQ. Even though FAQ rich results are retired, the content improves LLM citation and Overviews.
5. **Plain language.** Use the exact phrases from the keyword clusters in H1, first paragraph, and anchor text. Avoid inventing new brand terms for existing concepts.
6. **Evidence links.** Every claim on a public page should link to a repo path, explorer address, or transaction. LLMs weight cited evidence heavily.
7. **Showcase subdomains.** Each agent subdomain should include a small `llms.txt` or at least a `<link rel="llms-txt" href="https://agenticbusinessconsole.com/llms.txt">` in the head.

## Page-level keyword map

| Page | Primary keyword | Secondary keywords | Must-link-to |
|---|---|---|---|
| `/` | agentic business console | AI agent wallet, onchain business operations, Arc USDC agent | `/token-launch`, `/console`, `/arc` |
| `/token-launch` | AI agent token launch | LGE for AI agents, USDC token launch, agent token economics | `/lge`, `/arc`, `/` |
| `/lge` | Uniswap v4 LGE | hook-custodied LP, perpetual LP lock, 25/50/25 fee split | `/token-launch`, `/uniswap-v4-lge` |
| `/arc` | Arc USDC agent | Circle agent stack, native USDC agent, Circle developer controlled wallets | `/`, `/token-launch` |
| `/console` | agent treasury console | agent audit ledger, operator console for agents, intent lifecycle | `/`, `/agent-policy` |

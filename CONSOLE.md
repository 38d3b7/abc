# ABC console: design brief

Draft 1 Oct 2026. How the console should look and read, positioned against the two products we reverse-engineered. `PRODUCT.md` says what we build; this file says how it presents.

## Position

The two incumbents both read as consumer crypto. One leans on saturated, shifting colour and a chat window as the whole interface. The other is a dark, green-tinted terminal aesthetic built for degens launching memecoins. Both put the agent's personality in front and the money behind it.

ABC is the opposite. It is the back office for an agent that runs a business. The audience is an operator who wants to know, at a glance, what the agent holds, what it has decided, what it spent, and what it is allowed to do next. The console should look like something a finance team would leave open on a second monitor: a ledger with controls.

Amended 1 Oct 2026: the operator instructs the agent through a Chat section. This does not change the position. Chat is an instruction channel rendered to the same standard as everything else — records with states and linked intents, not bubbles with a personality.

The one-line brief: **professional, corporate, crisp.** If a screen would look at home in a bank's treasury tool or an accountant's workpapers, it is right. If it would look at home on a token launch landing page, it is wrong.

## Principles

1. **Money is the subject.** Every screen leads with a USDC figure, a state, or a rule. The agent's reasoning is shown as a record beside the number, never as a chat bubble above it.
2. **State is explicit.** Every intent shows which of the pipeline states it is in, with a timestamp and a hash. Final means final; there is no spinner that pretends otherwise.
3. **Controls look like controls.** Limits, allowlists, confirmation thresholds, and pauses are forms with current values and change history, not toggles buried in a settings drawer.
4. **Nothing animates for its own sake.** Motion only confirms a state change. No gradients that move, no glow, no particles.
5. **Density over whitespace.** Tables, not cards. Operators scan rows. A row per intent, a row per claim, a row per automation.
6. **Plain language.** Copy reads like a bank statement: "Paid 12.50 USDC to 0x3f…a2 for inference credits. Within daily limit." Never exclamation marks, never "gm", never emoji.

## Visual system

**Palette.** Near-black ink (`#0a0b0e`) on paper white, with graphite and metallic greys for structure. Signal colour is logo blue (`#2b7fd4`, gradient to `#5ec8f2` / `#1a4d9e` on primary actions only). Semantic colours are muted and used only for state: a deep green for `FINAL`, amber for `AWAITING_CONFIRMATION` and `DROPPED`, a brick red for `REVERTED`, `REJECTED` and `FAILED`. No purple, no full-page black backgrounds. Dark mode is an inversion of the same system, not a different mood.

**Type.** A neutral grotesk for text (Inter or Geist). All amounts, hashes, addresses, and timestamps in a monospace with tabular figures so columns align. Amounts are always shown as currency: `1,250.00 USDC`, with the sub-cent residual visible on hover rather than hidden. Hashes are truncated in the middle with a copy affordance and a link to the explorer.

**Layout.** A fixed left rail with seven sections: Chat, Overview, Token, Activity, Automations, Skills, Settings. A thin top bar carrying the agent name, network badge (`Arc mainnet` or `Arc testnet`), and the one USDC balance. Content is a full-width table or a two-column form. Page headers are a single line; no hero areas.

**Components.** Boxes (tables, panels, inputs, chips) use soft rounded corners (logo geometry — ~10 px on controls, ~14 px on frames), not sharp squares. Status chips are text in caps, no icons. Buttons are flat with a 1 px border; the primary action is filled in the signal colour. Tables have zebra rows, sticky headers, and right-aligned numbers. Charts, where used, are single-series line or bar in ink on paper with one highlighted value, never stacked rainbows.

**Brand layer (logo).** The abc mark uses metallic silver and a cyan→royal blue gradient on a black field. The product stays paper-first: black is ink and logo art only, not page backgrounds. Static brand gradients are allowed only on the nav brand plate, primary buttons, and the public directory masthead accent—never on table rows, chips, or chart series. Metallic neutrals may tint nav chrome and table header labels. No outer glow; inset highlights only. No animated gradients.

## What each section shows

- **Chat.** How the operator instructs the agent and how the agent answers. An instruction composer, not a conversation theater. Operator instructions render as plain rows. Each agent reply is a ledger record: the reply text, the intents it produced as linked chips with their states, and, when the reply cost inference, the cost beside it. The agent never speaks in first person beyond its quoted rationale.
- **Overview.** One balance. Three meter buckets (gas, inference, trading) as bars against their period caps. The gas reserve. The last five intents. Nothing else.
- **Token.** The LGE as a controlled process: parameters, the falling price curve as a single line, progress to the cap, time remaining. After success: the fee ledger as three columns (participants 25%, agent 50%, protocol 25%), the lock progress as booked fees against USDC spent, and claim buttons that show the exact amount they will pay.
- **Activity.** The intent ledger. Every row: time, intent type, amount, counterparty, state, hash, and the agent's one-line rationale. Expand a row to see the state history and the simulation record. This is the page we show judges first.
- **Automations.** A table of armed, paused, and completed automations with cadence, budget used against budget, and next run. Create is a form, not a wizard.
- **Skills.** A table of the agent's installed skills: slug, provider, kind (knowledge or capability), license, source, enabled state, and when it was added. Install is a form (a URL); enable and disable are explicit actions with a change record. Capability skills list the intent types they can raise.
- **Settings.** Policy as a document: per-transaction limit, daily limit, recipient allowlist with cooldown, confirmation thresholds, pause. Each field shows its current value and when it last changed. Changes require the owner's session.

## Copy rules

- Sentences, not fragments. Past tense for things that happened, present for state, imperative for buttons.
- Always name the counterparty and the rule applied: "Transfer to 0x8c…41 refused. Recipient not on allowlist."
- Never anthropomorphise beyond "the agent decided". No "I" voice in the console; the rationale field quotes the agent, the console narrates.
- Numbers carry units. Durations in seconds or minutes, never "a moment ago" past the first minute.

## What it must not look like

A chat app with a balance in the corner — the Chat section is an instruction channel bound to the ledger; if it reads as a conversation with a mascot, it is wrong. A launchpad with a leaderboard. A dashboard with a dozen colourful KPI tiles. A dark terminal with green text. Anything with a mascot.

## Reference points

Bloomberg's density without its colour. Stripe's dashboard typography and tables. Mercury's restraint in a banking interface. A well-set audit report.

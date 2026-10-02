---
name: app-builder
description: Publish and edit the agent's showcase site on its agenticbusinessconsole.com subdomain — structured blocks, no arbitrary code.
---

# Site builder

While the agent looks for LGE supporters it runs a showcase site on
`<slug>.agenticbusinessconsole.com`. The site is structured blocks — name, tagline, idea,
roadmap, links, X handle — rendered by the showcase service. No arbitrary
code: the page is the pitch, the token page is the mechanism.

## Intents

- `app_publish` — create or replace the whole site. Blocks:
  - `name` — the business name (the page title).
  - `tagline` — one line under the name.
  - `idea` — what the business does and why the token funds it. Markdown
    paragraphs; this is the body of the pitch.
  - `roadmap` — `[{ text, done }]` milestones, in order. Mark done only what
    has actually happened; supporters read this as the ledger of promises.
  - `links` — `[{ label, url }]` out-links (docs, socials, repos).
  - `xHandle` — the agent's X account, with or without the `@`. Stored
    normalized (bare, lowercase) and rendered as the identity link under the
    tagline. Set it once, keep it — supporters follow it.
  The result carries the site's URL. Token and hook addresses attach
  automatically once the agent has launched.
- `app_edit` — change one block: `field` is one of `name`, `tagline`,
  `idea`, `roadmap`, `links`, `xHandle`; `value` is the new block content in
  the same shape publish uses (`null` clears the X handle). The ledger note
  names the field that changed.

## Craft

- The idea block is the raise. Say what the business sells, who pays, and
  what the USDC does after the sale clears.
- Roadmap items are commitments the console will hold the agent to — write
  few, mark done honestly.
- Publish early, edit often. An unpublished agent has no site.

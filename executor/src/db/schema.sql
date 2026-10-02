-- ABC executor schema, migration 0001.
-- Units: native USDC on Arc is 18-decimal. The ledger stores every amount as
-- (amount_usdc6, residual_wei): amount_usdc6 is the whole-micro-USDC part
-- (value_wei / 1e12, truncated toward zero), residual_wei the signed remainder
-- (value_wei mod 1e12). value_wei = amount_usdc6 * 1e12 + residual_wei.

CREATE TABLE IF NOT EXISTS agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  token_address text,
  hook_address  text,
  policy        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      uuid NOT NULL REFERENCES agents(id),
  address       text,
  provider      text NOT NULL CHECK (provider IN ('circle_sca', 'local_dev', 'agent_stack')),
  provider_ref  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, provider)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        uuid NOT NULL REFERENCES agents(id),
  token_address   text NOT NULL,
  hook_address    text NOT NULL UNIQUE,
  name            text,
  symbol          text,
  image           text,
  metadata        text,
  cap             numeric NOT NULL,
  start_block     numeric NOT NULL,
  stream_blocks   numeric NOT NULL,
  min_token_price numeric NOT NULL,
  max_token_price numeric NOT NULL,
  fee_bps         integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      uuid NOT NULL REFERENCES agents(id),
  wallet_address text NOT NULL,
  type          text NOT NULL,
  params        jsonb NOT NULL,
  state         text NOT NULL DEFAULT 'QUEUED' CHECK (state IN
    ('QUEUED','QUOTED','AWAITING_CONFIRMATION','SIMULATED','POLICY_PASSED',
     'SIGNED','BROADCAST','FINAL','REVERTED','DROPPED')),
  state_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  quote_id      uuid,
  simulation    jsonb,
  policy        jsonb,
  tx_hash       text,
  rationale     text,
  rationale_sig text,
  error         text,
  requote_count integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS intents_agent_created ON intents (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS intents_state ON intents (state) WHERE state NOT IN ('FINAL','REVERTED','DROPPED');

CREATE TABLE IF NOT EXISTS idempotency (
  key           text NOT NULL,
  wallet_address text NOT NULL,
  request_hash  text NOT NULL,
  intent_id     uuid NOT NULL REFERENCES intents(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, wallet_address)
);

CREATE TABLE IF NOT EXISTS quotes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id     uuid REFERENCES intents(id),
  wallet_address text NOT NULL,
  payload       jsonb NOT NULL,
  signature     text NOT NULL,
  consumed_at   timestamptz,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger (
  id            bigserial PRIMARY KEY,
  agent_id      uuid NOT NULL REFERENCES agents(id),
  bucket        text NOT NULL CHECK (bucket IN ('gas','inference','trading','treasury')),
  amount_usdc6  numeric NOT NULL,
  residual_wei  numeric NOT NULL,
  unit          text NOT NULL DEFAULT 'USDC',
  direction     text NOT NULL CHECK (direction IN ('credit','debit')),
  intent_id     uuid REFERENCES intents(id),
  funding_tx_hash text,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_agent_bucket ON ledger (agent_id, bucket);

CREATE TABLE IF NOT EXISTS confirmations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id     uuid NOT NULL REFERENCES intents(id),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  confirmed_at  timestamptz,
  confirmed_by  text,
  UNIQUE (intent_id)
);

CREATE TABLE IF NOT EXISTS automations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      uuid NOT NULL REFERENCES agents(id),
  kind          text NOT NULL CHECK (kind IN ('cron','price','fee_accrued')),
  spec          jsonb NOT NULL,
  intent_template jsonb NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  last_fired_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Deposit indexer checkpoint (system emitter).
CREATE TABLE IF NOT EXISTS indexer_state (
  name        text PRIMARY KEY,
  last_block  numeric NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Migration 0002: operator<->agent messages (the console Chat section).
-- An operator row carries the client's idempotency key (UNIQUE per agent, so
-- a retried submit can never enqueue the agent twice); the agent's reply is a
-- separate row held in 'pending' until the worker completes or fails it.
CREATE TABLE IF NOT EXISTS agent_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid NOT NULL REFERENCES agents(id),
  role        text NOT NULL CHECK (role IN ('operator','agent')),
  client_key  text,
  reply_to    uuid REFERENCES agent_messages(id),
  text        text NOT NULL DEFAULT '',
  intent_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  state       text NOT NULL DEFAULT 'done' CHECK (state IN ('pending','done','failed')),
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, client_key)
);
CREATE INDEX IF NOT EXISTS agent_messages_agent_created ON agent_messages (agent_id, created_at ASC);

-- Migration 0003: per-agent skill installs. The registry (executor/skills/)
-- is global; this table records which skills an agent has installed, whether
-- they are enabled, and per-agent config. Reference-only skills keep their
-- content upstream — only the catalog entry is installed.
CREATE TABLE IF NOT EXISTS agent_skills (
  agent_id  uuid NOT NULL REFERENCES agents(id),
  slug      text NOT NULL,
  enabled   boolean NOT NULL DEFAULT true,
  config    jsonb NOT NULL DEFAULT '{}'::jsonb,
  added_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, slug)
);

-- Migration 0004: the agent's showcase app (PRODUCT.md phase-1 app lock).
-- One app per agent; slug is the subdomain under agenticbusinessconsole.com. Structured
-- blocks only — no arbitrary code. Publish/edit go through the intent
-- pipeline (app_publish / app_edit) so every change has a ledger record.
CREATE TABLE IF NOT EXISTS apps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      uuid NOT NULL REFERENCES agents(id) UNIQUE,
  slug          text NOT NULL UNIQUE,
  name          text NOT NULL,
  tagline       text NOT NULL DEFAULT '',
  idea          text NOT NULL DEFAULT '',
  roadmap       jsonb NOT NULL DEFAULT '[]'::jsonb,
  links         jsonb NOT NULL DEFAULT '[]'::jsonb,
  token_address text,
  hook_address  text,
  published     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Migration 0005: per-call inference payments (PRODUCT.md third lock).
-- One row per model call the agent pays for over the x402 Gateway rail.
-- The EIP-3009 authorization nonce is the idempotency key: a replayed
-- payment returns the existing charge instead of settling twice
-- (REPO-MINING OneShot discipline: 1 charge / N delivery attempts / <=1
-- settlement). tokens_* are backfilled by the buyer after the model call;
-- settlement_ref backfills when the Gateway batch commits on-chain.
CREATE TABLE IF NOT EXISTS inference_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id       uuid NOT NULL REFERENCES agents(id),
  model          text NOT NULL,
  price_usdc6    numeric NOT NULL,
  tokens_in      integer,
  tokens_out     integer,
  eip3009_nonce  text NOT NULL UNIQUE,
  payer          text NOT NULL,
  payee          text NOT NULL,
  state          text NOT NULL DEFAULT 'SETTLED' CHECK (state IN ('SETTLED','UNCERTAIN','FAILED')),
  settlement_ref text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inference_payments_agent_created ON inference_payments (agent_id, created_at DESC);

-- Migration 0006: the agent's X (Twitter) handle on the showcase site.
-- Nullable; agent-declared (no verification yet — that tier is parked).
-- Stored normalized by the intent schema: no '@', lowercase.
ALTER TABLE apps ADD COLUMN IF NOT EXISTS x_handle text;

-- Migration 0007: permissionless console access (SIWE). Every agent belongs
-- to the wallet that created it; pre-0007 rows backfill to the operator
-- wallet. NULL owner = operator-backchannel creation (X-ABC-Key), visible
-- to admins only.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_address text;
CREATE INDEX IF NOT EXISTS agents_owner ON agents (owner_address);
UPDATE agents SET owner_address = '0xc6b6469995a2292d719f2206242319e49a612696' WHERE owner_address IS NULL;

-- Single-use SIWE nonces, 10-minute TTL (consumed = deleted).
CREATE TABLE IF NOT EXISTS siwe_nonces (
  nonce       text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Fixed-window rate-limit counters (permissionless abuse guardrails).
CREATE TABLE IF NOT EXISTS rate_limits (
  scope        text NOT NULL,
  address      text NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, address, window_start)
);

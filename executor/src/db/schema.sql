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

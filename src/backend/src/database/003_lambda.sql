ALTER TABLE agent_runs ADD COLUMN delivery_generation integer NOT NULL DEFAULT 1;
CREATE TABLE agent_outbox (
  run_id text NOT NULL REFERENCES agent_runs(id),
  generation integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  PRIMARY KEY(run_id,generation)
);
CREATE INDEX pending_agent_outbox ON agent_outbox(created_at) WHERE sent_at IS NULL;
-- Preserve queued jobs created before this migration.
INSERT INTO agent_outbox(run_id,generation) SELECT id,delivery_generation FROM agent_runs WHERE status='QUEUED';
CREATE TABLE auth_rate_limits (
  key_hash text PRIMARY KEY,
  attempts integer NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE staff (
  id text PRIMARY KEY, staff_number text UNIQUE NOT NULL, role text NOT NULL
    CHECK(role IN ('nurse','clinician','doctor','clerk','admin')),
  pin_hash text NOT NULL, profile jsonb NOT NULL
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY, staff_id text NOT NULL REFERENCES staff(id),
  expires_at timestamptz NOT NULL, locked boolean NOT NULL DEFAULT false
);
CREATE TABLE departments (
  id text PRIMARY KEY, data jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE visits (
  id text PRIMARY KEY, name text NOT NULL, age integer NOT NULL CHECK(age BETWEEN 0 AND 130),
  gender text NOT NULL, complaint text NOT NULL, arrival_at timestamptz NOT NULL DEFAULT now(),
  registered_by text NOT NULL REFERENCES staff(id), observation_version integer NOT NULL DEFAULT 1,
  assessment_version integer NOT NULL DEFAULT 0, approved_priority text
    CHECK(approved_priority IN ('RED','ORANGE','YELLOW','GREEN')),
  assessment_status text NOT NULL DEFAULT 'AWAITING_ASSESSMENT',
  department_id text REFERENCES departments(id), assigned_department text NOT NULL DEFAULT 'Triage Holding',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE observations (
  id text PRIMARY KEY, visit_id text NOT NULL REFERENCES visits(id), version integer NOT NULL,
  vitals jsonb NOT NULL, recorded_by text NOT NULL REFERENCES staff(id),
  recorded_at timestamptz NOT NULL DEFAULT now(), UNIQUE(visit_id,version)
);
CREATE TABLE agent_runs (
  id text PRIMARY KEY, visit_id text NOT NULL REFERENCES visits(id), observation_version integer NOT NULL,
  status text NOT NULL CHECK(status IN ('QUEUED','RUNNING','WAITING_FOR_REVIEW','REVIEW_REQUIRED','FAILED','SUPERSEDED','DECIDED')),
  provider text NOT NULL DEFAULT 'bedrock', model text NOT NULL, steps integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0, lease_until timestamptz, error text,
  created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  UNIQUE(visit_id, observation_version)
);
CREATE TABLE proposals (
  id text PRIMARY KEY, run_id text UNIQUE NOT NULL REFERENCES agent_runs(id),
  visit_id text NOT NULL REFERENCES visits(id), observation_version integer NOT NULL,
  data jsonb NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','STALE','DECIDED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tool_traces (
  id text PRIMARY KEY, run_id text NOT NULL REFERENCES agent_runs(id), step integer NOT NULL,
  tool text NOT NULL, inputs jsonb NOT NULL, outputs jsonb NOT NULL,
  duration_ms integer NOT NULL, timestamp timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE decisions (
  id text PRIMARY KEY, proposal_id text UNIQUE NOT NULL REFERENCES proposals(id),
  visit_id text NOT NULL REFERENCES visits(id), staff_id text NOT NULL REFERENCES staff(id),
  decision text NOT NULL CHECK(decision IN ('APPROVED','REJECTED','OVERRIDDEN')),
  priority text CHECK(priority IN ('RED','ORANGE','YELLOW','GREEN')), reason text NOT NULL,
  data jsonb NOT NULL, timestamp timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE transfers (
  id text PRIMARY KEY, visit_id text NOT NULL REFERENCES visits(id),
  staff_id text NOT NULL REFERENCES staff(id), department_id text NOT NULL REFERENCES departments(id),
  data jsonb NOT NULL, timestamp timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_events (
  id text PRIMARY KEY, staff_id text REFERENCES staff(id), visit_id text REFERENCES visits(id),
  event_type text NOT NULL, details jsonb NOT NULL, timestamp timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE request_keys (
  staff_id text NOT NULL REFERENCES staff(id), operation text NOT NULL, key text NOT NULL,
  request_hash text NOT NULL, response jsonb NOT NULL, PRIMARY KEY(staff_id,operation,key)
);
CREATE INDEX agent_jobs ON agent_runs(status,created_at);
CREATE INDEX pending_proposals ON proposals(visit_id,status);
CREATE INDEX visit_observations ON observations(visit_id,version DESC);

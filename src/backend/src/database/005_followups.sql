CREATE TABLE followups (
  id text PRIMARY KEY, run_id text UNIQUE NOT NULL REFERENCES agent_runs(id),
  visit_id text NOT NULL REFERENCES visits(id), observation_version integer NOT NULL,
  basis jsonb NOT NULL, protocol_checksum text NOT NULL,
  status text NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','OPEN','ACKNOWLEDGED','COMPLETED','CANCELLED','STALE')),
  version integer NOT NULL DEFAULT 1,
  owner_id text REFERENCES staff(id), due_at timestamptz,
  approved_by text REFERENCES staff(id), approved_at timestamptz, acknowledged_at timestamptz,
  completed_by text REFERENCES staff(id), completed_at timestamptz,
  completion_observation_id text REFERENCES observations(id),
  reason text, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(visit_id,observation_version) REFERENCES observations(visit_id,version),
  CHECK(status NOT IN ('OPEN','ACKNOWLEDGED','COMPLETED') OR (owner_id IS NOT NULL AND due_at IS NOT NULL AND approved_by IS NOT NULL)),
  CHECK(status<>'COMPLETED' OR (completed_by IS NOT NULL AND completed_at IS NOT NULL AND completion_observation_id IS NOT NULL))
);
CREATE INDEX followups_due ON followups(status,due_at);
CREATE FUNCTION guard_followup_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source text; completion observations%ROWTYPE;
BEGIN
  SELECT data_source INTO source FROM visits WHERE id=NEW.visit_id;
  IF source IS DISTINCT FROM 'synthetic' THEN RAISE EXCEPTION 'Follow-ups require synthetic workflow visits'; END IF;
  IF NOT EXISTS(SELECT 1 FROM agent_runs WHERE id=NEW.run_id AND visit_id=NEW.visit_id AND observation_version=NEW.observation_version)
    THEN RAISE EXCEPTION 'Follow-up must match its bound agent run'; END IF;
  IF TG_OP='INSERT' AND NEW.status<>'PROPOSED' THEN RAISE EXCEPTION 'Follow-ups must start as proposals'; END IF;
  IF TG_OP='UPDATE' AND (NEW.visit_id,NEW.run_id,NEW.observation_version,NEW.basis,NEW.protocol_checksum)
    IS DISTINCT FROM (OLD.visit_id,OLD.run_id,OLD.observation_version,OLD.basis,OLD.protocol_checksum)
    THEN RAISE EXCEPTION 'Follow-up evidence is immutable'; END IF;
  IF NEW.status='COMPLETED' THEN
    SELECT * INTO completion FROM observations WHERE id=NEW.completion_observation_id;
    IF completion.visit_id IS DISTINCT FROM NEW.visit_id OR completion.version<=NEW.observation_version
      OR NEW.completed_by IS DISTINCT FROM NEW.owner_id THEN RAISE EXCEPTION 'Completion requires newer observations and the assigned owner'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER followup_evidence BEFORE INSERT OR UPDATE ON followups FOR EACH ROW EXECUTE FUNCTION guard_followup_evidence();

-- Queue tie-breaking (docs/QUEUE_ORDERING.md).
-- registration_seq: server-assigned, unique and increasing, so patients who are clinically tied
-- are ordered by who was registered first rather than by a random visit ID.
CREATE SEQUENCE visit_registration_seq;
ALTER TABLE visits ADD COLUMN registration_seq bigint;
WITH ordered AS (SELECT id,row_number() OVER (ORDER BY arrival_at,id) n FROM visits)
  UPDATE visits v SET registration_seq=ordered.n FROM ordered WHERE ordered.id=v.id;
SELECT setval('visit_registration_seq',coalesce((SELECT max(registration_seq) FROM visits),0)+1,false);
ALTER TABLE visits ALTER COLUMN registration_seq SET DEFAULT nextval('visit_registration_seq');
ALTER TABLE visits ALTER COLUMN registration_seq SET NOT NULL;
ALTER TABLE visits ADD CONSTRAINT visits_registration_seq_unique UNIQUE(registration_seq);
ALTER SEQUENCE visit_registration_seq OWNED BY visits.registration_seq;

-- A clinician's "see first" decision between clinically tied patients. Append-only; a decision
-- applies only while the visit's observations and assessment are unchanged.
CREATE TABLE queue_precedence (
  id text PRIMARY KEY,
  visit_id text NOT NULL REFERENCES visits(id),
  observation_version integer NOT NULL,
  assessment_version integer NOT NULL,
  staff_id text NOT NULL REFERENCES staff(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX queue_precedence_visit ON queue_precedence(visit_id,created_at DESC);
CREATE TRIGGER immutable_queue_precedence BEFORE UPDATE OR DELETE ON queue_precedence
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

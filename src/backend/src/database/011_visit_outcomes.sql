-- Visit outcomes and time seen by a clinician (docs/OUTCOME_METRICS.md).
-- Dispositions follow those recorded in the Kenyatta National Hospital SATS evaluation
-- (Wangara et al., Int J Emerg Med 2019), plus transfer to another facility.
ALTER TABLE visits ADD COLUMN seen_at timestamptz;
ALTER TABLE visits ADD COLUMN seen_by text REFERENCES staff(id);
ALTER TABLE visits ADD COLUMN closed_at timestamptz;
ALTER TABLE visits ADD CONSTRAINT research_not_seen_or_closed
  CHECK(data_source='synthetic' OR (seen_at IS NULL AND closed_at IS NULL));
ALTER TABLE visits ADD CONSTRAINT seen_by_with_seen_at CHECK((seen_at IS NULL)=(seen_by IS NULL));

-- Seen and closed times are written once.
CREATE FUNCTION guard_visit_milestones() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.seen_at IS NOT NULL AND (NEW.seen_at,NEW.seen_by) IS DISTINCT FROM (OLD.seen_at,OLD.seen_by) THEN
    RAISE EXCEPTION 'The time a patient was first seen cannot be changed';
  END IF;
  IF OLD.closed_at IS NOT NULL AND NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
    RAISE EXCEPTION 'A closed visit cannot be reopened';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER visit_milestones BEFORE UPDATE ON visits FOR EACH ROW EXECUTE FUNCTION guard_visit_milestones();

CREATE TABLE visit_outcomes (
  visit_id text PRIMARY KEY REFERENCES visits(id),
  disposition text NOT NULL CHECK(disposition IN ('ADMITTED','DISCHARGED','DIED','LEFT_WITHOUT_BEING_SEEN',
    'LEFT_AGAINST_MEDICAL_ADVICE','TRANSFERRED_OUT')),
  -- Approved SATS priority when the outcome was recorded (null if never approved).
  priority_at_disposition text CHECK(priority_at_disposition IN ('RED','ORANGE','YELLOW','GREEN')),
  note text,
  recorded_by text NOT NULL REFERENCES staff(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX visit_outcomes_recorded ON visit_outcomes(recorded_at);
CREATE TRIGGER immutable_visit_outcomes BEFORE UPDATE OR DELETE ON visit_outcomes
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE INDEX visits_open ON visits(arrival_at) WHERE closed_at IS NULL;

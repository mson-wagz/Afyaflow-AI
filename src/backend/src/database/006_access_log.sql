-- Read access to patient records (HIPAA Security Rule audit controls; Kenya DPA accountability).
-- One row per staff member, screen and set of records; repeated polling of the same view is
-- recorded once per window by the application (see audit/access-log.ts).
CREATE TABLE access_log (
  id text PRIMARY KEY,
  staff_id text NOT NULL REFERENCES staff(id),
  route text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}',
  patient_ids text[] NOT NULL,
  record_count integer NOT NULL,
  subject_hash text NOT NULL,
  accessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX access_log_dedupe ON access_log(staff_id, subject_hash, accessed_at DESC);
CREATE INDEX access_log_patients ON access_log USING gin(patient_ids);
CREATE INDEX access_log_recent ON access_log(accessed_at DESC);
CREATE TRIGGER immutable_access_log BEFORE UPDATE OR DELETE ON access_log
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

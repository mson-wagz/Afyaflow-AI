-- AI reports drafted by the report agent for people to review (docs/AI_REPORTS.md):
-- shift handover notes and quality reviews of mis-triaged cases. Drafts change no clinical data.
CREATE TABLE agent_reports (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK(kind IN ('HANDOVER','QUALITY_REVIEW')),
  status text NOT NULL DEFAULT 'RUNNING' CHECK(status IN ('RUNNING','READY','FAILED','ACKNOWLEDGED')),
  requested_by text NOT NULL REFERENCES staff(id),
  provider text NOT NULL,
  model text NOT NULL,
  content text,
  patient_ids text[] NOT NULL DEFAULT '{}',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  acknowledged_by text REFERENCES staff(id),
  acknowledged_at timestamptz,
  acknowledgement_note text,
  CHECK(status<>'ACKNOWLEDGED' OR (acknowledged_by IS NOT NULL AND acknowledged_at IS NOT NULL))
);
CREATE INDEX agent_reports_latest ON agent_reports(kind,created_at DESC);

-- Once drafted, a report's text cannot be changed; only its acknowledgement is added.
CREATE FUNCTION guard_agent_report() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.content IS NOT NULL AND NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'A drafted report cannot be edited';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER agent_report_guard BEFORE UPDATE ON agent_reports FOR EACH ROW EXECUTE FUNCTION guard_agent_report();
CREATE TRIGGER immutable_agent_reports BEFORE DELETE ON agent_reports FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

-- Every model call and tool call of a report run (same shape as tool_traces).
CREATE TABLE report_traces (
  id text PRIMARY KEY,
  report_id text NOT NULL REFERENCES agent_reports(id),
  step integer NOT NULL,
  tool text NOT NULL,
  inputs jsonb NOT NULL,
  outputs jsonb NOT NULL,
  duration_ms integer NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_traces_report ON report_traces(report_id,step);
CREATE TRIGGER immutable_report_traces BEFORE UPDATE OR DELETE ON report_traces
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

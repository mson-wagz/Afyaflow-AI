CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Observation and audit history are append-only';
END;
$$;
CREATE TRIGGER immutable_observations BEFORE UPDATE OR DELETE ON observations
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_decisions BEFORE UPDATE OR DELETE ON decisions
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_transfers BEFORE UPDATE OR DELETE ON transfers
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

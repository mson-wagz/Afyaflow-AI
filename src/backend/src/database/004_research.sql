ALTER TABLE visits ADD COLUMN data_source text NOT NULL DEFAULT 'synthetic'
  CHECK(data_source IN ('synthetic','mimic-iv-ed-demo'));
ALTER TABLE visits ADD COLUMN source_data jsonb NOT NULL DEFAULT '{}';
ALTER TABLE visits ALTER COLUMN age DROP NOT NULL;
ALTER TABLE visits ADD CONSTRAINT synthetic_age_required CHECK(data_source <> 'synthetic' OR age IS NOT NULL);
ALTER TABLE visits ADD CONSTRAINT research_not_clinical CHECK(data_source = 'synthetic' OR
  (approved_priority IS NULL AND department_id IS NULL));
CREATE INDEX visits_data_source ON visits(data_source);

-- Imported source evidence cannot be edited or promoted into the clinical queue.
CREATE FUNCTION protect_research_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.data_source = 'mimic-iv-ed-demo' AND
    (NEW.id,NEW.name,NEW.age,NEW.gender,NEW.complaint,NEW.arrival_at,NEW.registered_by,
     NEW.observation_version,NEW.data_source,NEW.source_data,NEW.assigned_department)
    IS DISTINCT FROM
    (OLD.id,OLD.name,OLD.age,OLD.gender,OLD.complaint,OLD.arrival_at,OLD.registered_by,
     OLD.observation_version,OLD.data_source,OLD.source_data,OLD.assigned_department) THEN
    RAISE EXCEPTION 'Historical research source records are read-only';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_research_source BEFORE UPDATE ON visits
  FOR EACH ROW EXECUTE FUNCTION protect_research_source();

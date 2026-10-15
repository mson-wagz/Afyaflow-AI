CREATE TABLE visits (
  id SERIAL PRIMARY KEY,
  patient_id TEXT NOT NULL,
  arrival_at TIMESTAMP NOT NULL DEFAULT NOW(),
  assessment_status TEXT NOT NULL DEFAULT 'pending',
  approved_priority INT DEFAULT NULL
);
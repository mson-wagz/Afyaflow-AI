-- Server-side inactivity lock (HIPAA Security Rule 164.312(a)(2)(iii) automatic logoff).
-- Refreshed by authenticated requests; sessions idle longer than SESSION_IDLE_MINUTES are locked.
ALTER TABLE sessions ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();

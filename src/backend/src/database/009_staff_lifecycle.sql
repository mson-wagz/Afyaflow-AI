-- Staff account lifecycle (HIPAA 164.308(a)(3)(ii)(C) termination procedures).
-- Deactivated staff cannot sign in; their sessions are ended when they are deactivated.
ALTER TABLE staff ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE staff ADD COLUMN deactivated_at timestamptz;

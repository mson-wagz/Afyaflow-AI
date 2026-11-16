-- SMS escalation to the on-call clinician (docs/INTEGRATION_MAP.md).
-- One alert per visit and kind; the message never contains a patient name.
CREATE TABLE sms_escalations (
  id text PRIMARY KEY,
  visit_id text NOT NULL REFERENCES visits(id),
  kind text NOT NULL CHECK(kind IN ('LEVEL1_UNSEEN')),
  recipient_masked text NOT NULL,
  message text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SENT','FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  provider_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE(visit_id,kind)
);
CREATE INDEX sms_escalations_status ON sms_escalations(status,created_at);

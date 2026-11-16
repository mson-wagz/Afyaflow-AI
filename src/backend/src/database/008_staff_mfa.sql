-- Multi-factor authentication for administrator accounts (HIPAA 164.312(d)).
-- mfa_secret is the base32 TOTP secret; mfa_last_step prevents reuse of a code.
ALTER TABLE staff ADD COLUMN mfa_secret text;
ALTER TABLE staff ADD COLUMN mfa_enrolled_at timestamptz;
ALTER TABLE staff ADD COLUMN mfa_last_step bigint;

# Data retention and disposal

**Status:** draft. The technical behaviour below is implemented. Clinical retention
periods must be set by the facility and its data protection officer under Kenyan law
before real patient data is held; they are marked *to be decided*.

## Where data lives and for how long

| Data | Location | Current retention | Disposal |
| --- | --- | --- | --- |
| Visits, observations, proposals, decisions, transfers, follow-ups | PostgreSQL on the encrypted EC2 disk | Indefinite. Observations, decisions and transfers are append-only. | *To be decided*: clinical record retention period and archival process |
| Audit events and the read-access log | PostgreSQL | Indefinite; append-only | *To be decided*: must be at least as long as the records they cover |
| Staff accounts | PostgreSQL | While employed; deactivated accounts are kept for audit attribution | *To be decided* |
| Sessions | PostgreSQL | Up to 8 hours; locked after 15 minutes idle; deleted at sign-out | Automatic |
| Sign-in throttling counters | PostgreSQL | 1-15 minutes | Expired rows are deleted automatically |
| Local pre-migration database dumps | EC2 disk (`/opt/afyaflow/backups`) | 7 days | Deleted by each release |
| Off-host database backups | S3 bucket, eu-west-1 | 35 days; replaced versions 7 days | S3 lifecycle expiry |
| Registration drafts and offline-queued registrations | Staff member's browser (`localStorage`) | Until that staff member signs out or switches user | Deleted at sign-out (unsynced items only after confirmation) |
| API responses | Browser | Not cached (`Cache-Control: no-store`) | Not stored |
| Voice recordings | Browser memory only | Not stored; transcribed locally and discarded | Not uploaded |
| AI assessment inputs and outputs | Amazon Bedrock, eu-west-1 | Processed per request; Bedrock does not store prompts or use them for training unless model invocation logging is turned on in the account (it is not) | Not retained by the provider |
| Agent tool traces | PostgreSQL | Indefinite, linked to the assessment | Same as clinical records |
| Historical research cases (MIMIC-IV-ED Demo) | PostgreSQL | While the research feature is used | Delete with the research import |

## Decisions needed before real patient data

1. The retention period for clinical records and their audit trail, and how records
   are archived or deleted at the end of it (including from backups).
2. How a data subject's access or correction requests are handled, given that
   clinical history is append-only (corrections are new versions, not edits).
3. Whether 35 days of off-host backups meets the facility's recovery requirements.

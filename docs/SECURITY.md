# Security and privacy safeguards

This document records how AfyaFlow AI protects patient data, where each safeguard is
implemented, and what remains before the system may hold real patient information.

> **Current data status.** The deployed system holds only synthetic records and the
> de-identified, openly licensed MIMIC-IV-ED Demo dataset. It holds no real patient
> information. The safeguards below are required before that changes.

## Which rules apply

- **Kenya:** the Data Protection Act 2019 (health data is *sensitive personal data*),
  the Data Protection (General) Regulations 2021, and the Digital Health Act 2023 are
  the primary obligations for a Kenyan facility.
- **HIPAA** (US) applies only to US covered entities and their business associates.
  Its Security Rule is used here as a recognised checklist for technical safeguards;
  most of its requirements overlap with the Kenyan obligations.

Software alone cannot make an organisation compliant. Both regimes also require
policies, risk analysis, training, contracts and incident handling (see
[Outstanding work](#outstanding-work)).

## Technical safeguards in place

| Safeguard | HIPAA reference | Implementation |
| --- | --- | --- |
| Unique user identification | 164.312(a)(2)(i) | Every staff member signs in with their own ID and PIN; server sessions record the staff ID on every action. `src/backend/src/auth/auth.ts` |
| Role-based access | 164.312(a)(1) | The database role is authoritative; clinical actions require a clinical role; the AI agent has no approval tool. |
| Automatic logoff | 164.312(a)(2)(iii) | The browser locks after 1-30 minutes of inactivity; the server locks any session with no request for `SESSION_IDLE_MINUTES` (default 15); sessions expire after 8 hours. |
| Sign-in protection | 164.312(d) | Six-digit PINs (none published; production seeds are unusable until an operator issues PINs); per-address and per-account throttling; PINs stored as salted scrypt hashes; session tokens stored only as SHA-256 hashes. `src/backend/src/auth/` |
| Multi-factor authentication | 164.312(d) | Administrators also enter a single-use authenticator-app code (RFC 6238 TOTP), enrolled out of band by the system operator. `src/backend/src/auth/totp.ts` |
| Account lifecycle | 164.308(a)(3)(ii)(C), (a)(5)(ii)(D) | Administrators deactivate and reactivate accounts, reset PINs and end sessions, each with an audited reason; the last administrator cannot be removed. `src/backend/src/admin/staff-accounts.ts` |
| Backup and recovery | 164.308(a)(7)(ii)(A), (D) | Daily encrypted, versioned off-host backups to S3 (35 days) with a restore test command; local pre-migration dumps. `deploy/ec2/backup.sh` |
| Emergency access and downtime | 164.312(a)(2)(ii), 164.308(a)(7) | Documented paper downtime procedure and access-recovery paths. [Emergency access](compliance/EMERGENCY_ACCESS.md) |
| Audit of changes | 164.312(b) | Every write records an audit event in the same transaction. |
| Audit of access | 164.312(b) | Every view of patient records is logged (staff, route, patient IDs, time) in `access_log`; data is withheld if access cannot be logged; administrators review via `GET /api/audit/access`. `src/backend/src/audit/access-log.ts` |
| Integrity | 164.312(c)(1) | Database triggers make observations, decisions, transfers, audit events and the access log append-only; version checks reject stale writes. |
| Encryption in transit | 164.312(e)(1) | HTTPS via Caddy; HSTS; `Secure`, `HttpOnly`, `SameSite=Strict` session cookie; AWS service calls over TLS. |
| Encryption at rest (server) | 164.312(a)(2)(iv) | Encrypted EBS volume holds the database and its backups. `deploy/ec2/template.yaml` |
| Browser data minimisation | 164.310(c), 164.312(a) | Drafts and offline registrations belong to the staff member who created them and are removed from the browser at sign-out. API responses are `no-store`. `src/frontend/src/offline/browserData.js` |
| Browser hardening | 164.312(e) | Framing denied, `nosniff`, referrer and permissions policies, Content-Security-Policy (report-only until verified). `src/backend/src/security-headers.ts` |
| No patient data in logs | 164.312(b) | Operational errors never log model or tool text; details remain in authenticated traces. |
| Local voice processing | Minimum necessary | Speech is transcribed in the browser; audio is never uploaded. |
| AI vendor | 164.314(a) | Staging inference uses Amazon Bedrock, a HIPAA-eligible service covered by the AWS BAA once accepted. |

## Data location

**Decision (16 November 2026): data is processed and stored in AWS `eu-west-1`
(Ireland).** The EC2 host, its database, the off-host backups and Amazon Bedrock all
run there. Bedrock does not store prompts or completions while model invocation
logging is off, which it is.

Before real patient data is used, this transfer of Kenyan health data outside Kenya
must be approved by the facility's data protection officer and documented: the lawful
basis, the safeguards relied on (AWS contractual and technical protections, encryption
in transit and at rest, access controls and logging), and how patients are informed.

**In-country option.** Setting `DATA_RESIDENCY=kenya` keeps processing in Kenya for a
deployment hosted there. The server refuses to start unless AI inference uses the local
model on the same host (`AI_PROVIDER=ollama`), so assessment inputs never leave the
server, and unless the operator declares the host country with `HOSTING_COUNTRY=KE`. The
software cannot verify a server's physical location: the declaration, and placing the
database and backups in Kenya too, are the operator's responsibility. `GET /api/health`
reports the policy, whether inference is local or hosted, and the declared country. The
current staging site is unrestricted (Ireland) and must not hold real patient data. See the
[Kenya regulatory checklist](compliance/KENYA_REGULATORY_CHECKLIST.md).

## Compliance records

- [Kenya regulatory checklist](compliance/KENYA_REGULATORY_CHECKLIST.md) (draft)

- [Incident record: repository compromise, October-November 2026](compliance/INCIDENT-2026-10-repository-compromise.md)
- [Risk register](compliance/RISK_REGISTER.md) (draft)
- [Data retention and disposal](compliance/DATA_RETENTION.md) (draft)
- [Emergency access and downtime procedure](compliance/EMERGENCY_ACCESS.md) (draft)

## Outstanding work

### Technical

1. **Off-host backup activation.** Run the one-time CloudFormation stack update that
   creates the backup bucket, then a restore test (`deploy/ec2/README.md`).
2. **Issue PINs and enrol administrator authenticators** on the deployed site after
   the six-digit PIN release (`deploy/ec2/README.md`, "Staff accounts and PINs").
3. **Content-Security-Policy enforcement.** Verify the deployed site reports no
   violations, then set `CSP_MODE=enforce`.
4. **Repository protection.** Add a ruleset blocking force pushes and requiring
   reviewed pull requests on all branches (see the incident record).

### Organisational

- Accept the AWS Business Associate Addendum (AWS Artifact) and use only
  HIPAA-eligible services for patient data.
- Register with the Office of the Data Protection Commissioner, complete a data
  protection impact assessment, and obtain DPO approval for the data location above.
- Complete the risk analysis from the draft register, and write security policies,
  workforce training and a sanctions policy; name a security officer.
- Close the open actions in the incident record.
- Set clinical retention periods and adopt the emergency access procedure.
- Define patient notice and consent.
- Complete clinical validation: the scoring protocol is an unvalidated synthetic
  fixture.

## Changing the safeguards

- Mark any new route that returns patient data with `@AccessLogged()`.
- Store any new browser-side patient data through `offline/browserData.js` so
  sign-out removes it.
- Keep patient data out of operational logs and error messages.
- Add new external sources to the Content-Security-Policy deliberately, never with
  wildcards for all hosts.

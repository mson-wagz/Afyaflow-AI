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
| Sign-in protection | 164.312(d) | Per-address and per-account throttling of PIN attempts; PINs stored as salted scrypt hashes; session tokens stored only as SHA-256 hashes. `src/backend/src/auth/rate-limit.ts` |
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

## Outstanding work

### Technical

1. **Stronger authentication.** PINs are four digits with no second factor, and the
   synthetic demo accounts (including administrator) have published PINs. Real data
   needs longer secrets or MFA, at least for administrators, and no published accounts.
2. **Backups and disaster recovery.** Database dumps are kept for 7 days on the same
   disk as the database and restores have not been tested. Copy encrypted backups off
   the host (for example to S3 with versioning) and test restoration.
3. **Data location.** Bedrock runs in `eu-west-1` (Ireland). Transferring Kenyan
   health data abroad requires a lawful basis and safeguards under the Data
   Protection Act; confirm with the facility and its data protection officer.
4. **Content-Security-Policy enforcement.** Verify the deployed site reports no
   violations, then set `CSP_MODE=enforce` (see `deploy/ec2/README.md`).
5. **Emergency access and staff lifecycle.** There is no documented break-glass
   procedure and no account deactivation or PIN reset workflow.

### Organisational

- Accept the AWS Business Associate Addendum (AWS Artifact) and use only
  HIPAA-eligible services for patient data.
- Register with the Office of the Data Protection Commissioner and complete a data
  protection impact assessment.
- Write a risk analysis, security policies, workforce training and a sanctions policy;
  name a security officer.
- Maintain an incident response procedure. The repository compromise of
  October-November 2026 (an automated process rewrote every branch to add a hidden
  payload; removed in PR #30) should be recorded as a security incident. It involved
  no patient data.
- Define patient notice and consent, and data retention and disposal periods.
- Complete clinical validation: the scoring protocol is an unvalidated synthetic
  fixture.

## Changing the safeguards

- Mark any new route that returns patient data with `@AccessLogged()`.
- Store any new browser-side patient data through `offline/browserData.js` so
  sign-out removes it.
- Keep patient data out of operational logs and error messages.
- Add new external sources to the Content-Security-Policy deliberately, never with
  wildcards for all hosts.

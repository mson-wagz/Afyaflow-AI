# Risk register

**Status:** draft starting point for the formal risk analysis (HIPAA 164.308(a)(1)(ii)(A);
Kenya Data Protection Act impact assessment). Likelihood and impact are
High / Medium / Low and must be reviewed by the security officer.

| # | Risk | Likelihood | Impact | Current controls | Remaining action |
| --- | --- | --- | --- | --- | --- |
| R1 | A contributor's computer or GitHub account is compromised and pushes malicious code (this happened: see the incident record) | High | High | Malware removed from `main`; pull requests reviewed | Ruleset blocking force pushes and requiring reviews; credential rotation; disable VS Code automatic tasks |
| R2 | Unauthorised sign-in by guessing a PIN | Low | High | Six-digit PINs, per-account and per-address throttling, administrator MFA, no published PINs | Consider MFA for all staff if devices allow |
| R3 | Unattended shared terminal exposes patient data | Medium | Medium | Browser lock after 1-30 minutes, server lock after 15 minutes idle, patient data cleared from the browser at sign-out | Staff training to lock and sign out |
| R4 | Leaver keeps access | Medium | High | Administrators deactivate accounts and end sessions | Joiner/leaver procedure with HR |
| R5 | Loss of the server or its disk | Low | High | Encrypted EBS; daily encrypted off-host backups with restore testing | Run the stack update that creates the bucket; monthly restore test |
| R6 | Inappropriate viewing of patient records by authorised staff | Medium | Medium | Read-access log reviewable by administrators | Periodic access review procedure |
| R7 | Patient data processed outside Kenya (Bedrock in Ireland) | Certain once real data is used | Medium | Transfer limited to assessment inputs; Bedrock does not retain prompts while model invocation logging is off; `DATA_RESIDENCY=kenya` enforces local inference for a Kenyan-hosted deployment | Host in Kenya with the residency setting, or DPO approval and documented safeguards before real data |
| R8 | AI proposes an unsafe priority | Medium | High | Deterministic scoring; the model cannot approve; clinician decision required; missing evidence forces review | Clinical validation of the scoring protocol |
| R9 | Third-party script or dependency compromise in the browser | Low | High | Pinned dependencies, lockfiles, CSP (report-only) | Enforce the CSP after verification |
| R10 | Cost abuse of the AI service | Medium | Low | Hourly per-staff and global assessment caps | Billing alerts |
| R11 | Secrets exposed (API keys) | Medium | Medium | Bedrock uses the instance role; no API keys on the host | Revoke the old OpenAI key |

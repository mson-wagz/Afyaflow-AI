# Kenya regulatory checklist (draft)

**Status:** working checklist for taking AfyaFlow from synthetic data to real patients at a
Kenyan facility such as Kenyatta National Hospital. It is not legal advice; confirm each
item with the facility's data protection officer and legal counsel, and check the current
gazetted regulations.

## Before any real patient data

| # | Obligation | Source | Owner | Status |
| --- | --- | --- | --- | --- |
| 1 | Register the data controller (the facility) and any data processor (the operator of AfyaFlow) with the Office of the Data Protection Commissioner (ODPC) | Data Protection Act 2019 | Facility DPO; operator | Not started |
| 2 | Carry out a data protection impact assessment (health data is sensitive personal data; triage is high-risk processing) | Data Protection Act 2019 | Facility DPO with the project | Not started |
| 3 | Decide where data is processed. Either host in Kenya with `DATA_RESIDENCY=kenya` (local inference, declared Kenyan host), or obtain DPO approval and document safeguards for any transfer outside Kenya (see [SECURITY.md](../SECURITY.md)) | Data Protection Act 2019 | Facility DPO; operator | Staging is in Ireland with synthetic data only |
| 4 | Register as a health data controller or processor with the Digital Health Agency, and notify the Agency within seven days of registration | Digital Health Act 2023 | Facility; operator | Not started |
| 5 | Submit AfyaFlow for certification as a digital health solution, as required for onboarding | Digital Health Act 2023 | Operator | Not started |
| 6 | Agree how AfyaFlow exchanges data with the facility's certified hospital information system, and with SHA systems where relevant, under the Digital Health data exchange rules | Digital Health Act 2023 and its regulations | Facility ICT; operator | FHIR export available ([INTEROPERABILITY.md](../INTEROPERABILITY.md)); no live integration |
| 7 | Clinical sign-off of the triage protocol by the KNH triage committee | Facility governance | KNH triage committee | Review pack ready ([SATS_CLINICAL_REVIEW.md](../SATS_CLINICAL_REVIEW.md)) |
| 8 | Patient information notice: what is collected, why, who sees it, how long it is kept, and patients' rights | Data Protection Act 2019 | Facility | Not started |
| 9 | Data processing agreement between the facility and the operator | Data Protection Act 2019 | Facility; operator | Not started |
| 10 | Staff training: triage with AfyaFlow, shared-terminal sign-out, incident reporting | Facility governance | Facility | Not started |

## Already in place in the software

- Role-based access, administrator multi-factor authentication, server-side idle lock.
- Append-only audit of decisions, outcomes and record access; access is withheld if it cannot be logged.
- Retention and disposal plan ([DATA_RETENTION.md](DATA_RETENTION.md)), incident record and risk register.
- `DATA_RESIDENCY=kenya` enforcement of local inference (item 3).
- Clinician decision required for every priority; the AI cannot approve.

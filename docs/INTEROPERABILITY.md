# Interoperability

AfyaFlow is designed to sit **beside** a facility's certified hospital information system
(HIS), not to replace it. Kenyan hospitals already run an HIS for daily operations and, for
SHA claims, a certified HIS that meets Digital Health Agency requirements. Staff will not
adopt a triage tool that makes them type each patient twice, so AfyaFlow exports what it
records in a standard format.

## FHIR R4 export of a visit

`GET /api/visits/:id/fhir` returns a FHIR R4 `Bundle` of type `collection`
(`Content-Type: application/fhir+json`) for one workflow visit, open or closed.

| Resource | Content |
| --- | --- |
| `Patient` | Name, administrative gender, AfyaFlow visit identifier |
| `Encounter` | Class `EMER`; status `in-progress` or `finished`; arrival and closing times; presenting complaint; department; discharge disposition |
| `Observation` (vital signs) | Latest recorded set, LOINC-coded with UCUM units: heart rate `8867-4`, respiratory rate `9279-1`, systolic BP `8480-6`, diastolic BP `8462-4`, body temperature `8310-5`, SpO2 `59408-5`; age `30525-0` |
| `Observation` | AVPU and mobility (text) |
| `Observation` | SATS TEWS (only when the protocol can score the patient), marked with the protocol version and "not clinically validated" |
| `Observation` | Clinician-approved SATS level (`RED`…`GREEN`, with level number and category) |

Discharge dispositions use the FHIR `discharge-disposition` codes where one matches exactly
(discharged → `home`, died → `exp`, left against medical advice → `aadvice`, transferred →
`other-hcf`); *admitted* and *left without being seen* are sent as text. AfyaFlow-specific
concepts use code systems under `https://afyaflow.online/fhir/`. All references resolve to
entries inside the bundle (`urn:uuid` full URLs).

**Access:** nurses, clinicians, doctors and administrators; clerks are refused. Each export is
a patient-record read and is written to the access log. Records are tagged `synthetic`
while the system holds synthetic data only.

## Not yet integrated

- **No live connection** to KNH's HIS, the SHA claims system or the national client registry
  exists. Connecting requires agreement with the facility's ICT team, credentials for those
  systems, and compliance with the Digital Health data exchange rules
  ([Kenya regulatory checklist](compliance/KENYA_REGULATORY_CHECKLIST.md), item 6).
- **No national or SHA identifiers** are captured. Linking a visit to a person across systems
  needs a decision on which identifier to use and a data protection assessment, because it
  adds sensitive personal data.
- **Import into AfyaFlow** (for example, pulling a patient registered in the HIS) is not
  implemented.

The likely first integration is an integration engine at the facility that subscribes to
closed visits and posts this bundle to the HIS, so triage and outcome data reach the
patient's main record without re-entry.

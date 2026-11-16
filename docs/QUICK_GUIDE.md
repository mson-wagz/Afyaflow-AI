# AfyaFlow quick guide: what's new

A short, plain-language guide to the latest changes. It is written for the people who use
AfyaFlow at the triage desk and in the A&E, and for the supervisors and IT staff who support
them. For full detail, follow the links at the end of each section.

> **Important:** AfyaFlow is still a prototype. It holds synthetic (made-up) patients only,
> and its triage scoring has not yet been signed off by clinicians. Do not enter real patients.

## Who can do what

| Task | Nurse | Clinician / Doctor | Clerk | Admin |
| --- | :-: | :-: | :-: | :-: |
| See the queue | ✓ | ✓ | ✓ | ✓ |
| Mark a patient as seen | ✓ | ✓ | | |
| Record how a visit ended | ✓ | ✓ | Only "left without being seen" | |
| Choose who is seen first when patients are tied | ✓ | ✓ | | |
| Open the **Operations** dashboard | ✓ | ✓ | | ✓ |
| Export a visit for the hospital system (FHIR) | ✓ | ✓ | | ✓ |

## 1. Seeing a patient and closing a visit

Open **Hospital Queue**. Each patient has a **Seen & Outcome** column.

1. When you start seeing a patient, press **Mark seen**. AfyaFlow records the time and your
   name. You only do this once per visit.
2. When the visit ends, press **Record outcome**.
3. Choose what happened: **Admitted**, **Discharged**, **Died in A&E**, **Left against
   medical advice**, **Transferred to another facility** or **Left without being seen**.
4. Add a short note if useful (for example, the ward), then press **Close visit**.

The patient leaves the queue, their bed is freed and any open rechecks are cancelled.
**Closing cannot be undone**, so check the outcome before you press the button.

Front-desk staff: if a patient leaves before a clinician sees them, open **Record outcome**
and choose **Left without being seen**.

More: [Outcome metrics](OUTCOME_METRICS.md)

## 2. Who goes first in the queue

The queue always puts the most urgent level first: Level 1 (Red, Emergency), then Level 2
(Orange), Level 3 (Yellow) and Level 4 (Green). Each patient's badge now shows the level
number.

When patients are on the **same level**:

- **Level 1:** the sickest patient (highest early warning score) goes first. A patient who
  cannot be scored, such as a young child or someone with missing observations, goes first,
  because nothing shows they are less ill. Then whoever arrived first.
- **Levels 2 to 4:** whoever arrived first goes first. Patients who arrived in the same
  minute are ordered by early warning score.

Under the order number you will see a short reason, for example *"Same level as above:
arrived later"*.

### When patients are completely tied

If patients have the same level, the same score and arrived in the same minute, they are
**tied**, and each shows a badge such as **Tied 1 of 2**.

- If you have a clinical reason to see one first (for example, an airway concern), press
  **See first** on that patient and type the reason. That patient moves to the top of the
  tied group only. Your choice is recorded, and it ends automatically when that patient's
  observations change.
- If nobody chooses, the patient who was registered first is seen first.
- If **Level 1** patients are tied, a red alert appears. They all need immediate care, so
  call for more clinicians rather than waiting.

More: [Queue ordering](QUEUE_ORDERING.md)

## 3. The Operations dashboard

Open **Operations** and choose **Today**, **7 days** or **30 days**. It refreshes every
minute and shows numbers only, never patient names.

| Section | What it tells you |
| --- | --- |
| Top tiles | Open visits, patients waiting for the AI or a clinician, overdue rechecks, and patients **past their target and not yet seen** (highlighted when above zero) |
| Priority mix and beds | Open patients by level, and occupied beds per department |
| Arrivals | Patients arriving per hour or per day (press **Show table** for exact numbers) |
| Time to triage | How long patients wait for the AI proposal and the clinician decision |
| Outcomes | **Over-triage** and **under-triage** next to KNH's published figures (62.3% and 7.8%), length of stay, and patients who left without being seen |
| Seen against SATS target | For each level, how many patients were seen within the target time (Orange 10 min, Yellow 60 min, Green 4 hours) |

**Reading the triage figures:**
- *Over-triage*: patients given a more urgent level (Red, Orange or Yellow) who were then
  sent home. Lower is better, as long as under-triage does not rise.
- *Under-triage*: patients given Green who were then admitted or died. This is the safety
  measure; it should stay low.

Small numbers swing percentages a lot, so always look at the counts shown with them.

## 4. Patients aged 13 to 17

KNH sends everyone over 12 to the adult A&E, so AfyaFlow now scores patients from age 13.
Children aged 12 and under are not scored. They are flagged for the paediatric emergency
pathway and need a manual decision.

More: [SATS clinical review pack](SATS_CLINICAL_REVIEW.md)

## 5. Practice accounts

There are now two accounts for each role, so you can practise handovers between colleagues.
On a local practice server the PINs are listed in `src/shared/contracts/auth.js`. On the
staging site your administrator gives you your PIN; it is never published. Administrators
also sign in with a code from an authenticator app.

## For supervisors and IT

| Topic | What to know | Details |
| --- | --- | --- |
| Keeping data in Kenya | Set `DATA_RESIDENCY=kenya` and `HOSTING_COUNTRY=KE` on a server hosted in Kenya. The server then refuses to start unless the AI model runs on the same machine. `/api/health` shows the setting. | [Security](SECURITY.md) |
| Sending visits to the hospital system | `GET /api/visits/<visit ID>/fhir` returns the visit in the standard FHIR R4 format. Each export is logged. | [Interoperability](INTEROPERABILITY.md) |
| Steps before real patients | Data Protection Commissioner registration, impact assessment, Digital Health Agency registration and certification, clinical sign-off and more. | [Kenya regulatory checklist](compliance/KENYA_REGULATORY_CHECKLIST.md) |
| Proving it works | A draft before-and-after pilot at KNH, measured against KNH's own published results. | [Pilot protocol](PILOT_PROTOCOL.md) |
| Issuing PINs | Run the `staff-admin` tool on the server. | [EC2 deployment guide](../deploy/ec2/README.md) |

## If something goes wrong

- **"Request origin is not allowed"** when signing in: the server's `APP_ORIGIN` setting does
  not include the address in your browser. Ask IT to add it.
- **"Invalid staff identifier or PIN"**: check the PIN is six digits. If you still cannot sign
  in, ask an administrator to reset your PIN.
- **A button is missing:** your role may not allow that action (see the table at the top).
- **The system is down:** continue on paper with the standard SATS forms and enter the
  records afterwards ([Emergency access](compliance/EMERGENCY_ACCESS.md)).

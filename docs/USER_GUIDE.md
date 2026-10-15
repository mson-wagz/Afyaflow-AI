# AfyaFlow application user guide

This guide describes the connected PostgreSQL prototype with configurable OpenAI/Bedrock inference. **Historical Research Cases** contains de-identified MIMIC-IV-ED Demo records. Registration, clinical workflow examples, capacity and staffing remain synthetic demonstrations. The scoring fixture is not clinically validated. Do not enter identifiable real patient information into this public demo. For installation, see the [README](../README.md) and [backend setup](../src/backend/README.md); for hosting, see [EC2 deployment](../deploy/ec2/README.md).

## Historical research cases

After signing in, the connected app opens **Historical Research Cases**. You can return to it from the navigation at any time. Browser-only mode does not load this dataset.

The source is [MIMIC-IV-ED Demo v2.2 on PhysioNet](https://physionet.org/content/mimic-iv-ed-demo/2.2/): de-identified historical emergency-department records from Beth Israel Deaconess Medical Center, Boston, USA. The imported ED files contain **222 encounters from 64 distinct source patients**. Repeated encounters are separate cases. This is a small selected research sample, not a live hospital feed or evidence of suitability for Kenyan clinical care.

1. Search by case ID or complaint and select a historical encounter.
2. Inspect the source complaint, recorded gender, shifted arrival reference, and normalized observations. “Historical case …” is a display alias, not a patient name.
3. Read **Recorded source ESI** as the historical nurse-assigned 1–5 label (1 highest urgency). It is not an AfyaFlow colour priority. It may be missing and is not supplied to the AI as an answer.
4. Temperature is converted from the source's documented Fahrenheit unit to Celsius. Open **Original source rows** to see the unchanged values. Check any **Source data quality warnings**; unsupported values are left out of normalized observations, not silently corrected.
5. Age, AVPU, and mobility are unavailable in the imported tables and remain missing. Do not fill them by guessing from the complaint or arrival transport. Source dates are shifted for privacy and are not current arrival/waiting times. There is no exact triage observation timestamp.
6. With a nurse/clinician account, click **Request AI research review**. This explicitly sends the available complaint and normalized evidence to the configured AI provider and may incur API charges. Importing or browsing cases makes no inference calls. The source ESI label, raw rows, outcomes and source identifiers are excluded from model evidence.
7. Follow the run status. The same four MCP tools retrieve observations, read the demonstration protocol, score evidence, and save a research proposal. With missing age/AVPU, the expected outcome is **REVIEW_REQUIRED**, with no score or assigned priority. Inspect the summary, missing evidence and **Research model and MCP trace**. A failed run can be retried; a saved review is reused.

Historical cases are read-only and kept out of the hospital queue, clinical approval list, deterioration workflow and department routing. They cannot be approved, overridden, edited, escalated or transferred, including through direct API requests. To practice those actions, use the separate synthetic registration workflow described below.

Open **About the data and its limitations** for attribution. **Download adapted dataset (JSON)** exports only the research data and provenance under ODbL 1.0, without staff, sessions, secrets or AI traces. The [data-source documentation](DATA_SOURCES.md) explains the exact source files, transformations, missing fields, licence and citations. Using historical clinical data does not establish clinical validation, and requesting a review does not train or fine-tune the AI.

## 1. Sign in

Open the supplied application URL, or `http://localhost:5173` locally. Enter a staff identifier and four-digit PIN, then sign in.

Synthetic development accounts:

- `STAFF-101` / `1234`: Jane, nurse.
- `STAFF-102` / `2345`: Kamau, clinician.
- `STAFF-103` / `3456`: Faith, clerk.
- `STAFF-104` / `4567`: Samuel, administrator.

These are public demo credentials, not production accounts. Quick-select staff cards are demonstration conveniences.

Nurses and clinicians can record measurements, request assessments, approve/reject/override proposals, reassess patients, and authorise transfers. Clerks can register demographics and complaints and view queues; they cannot record clinical measurements or commit clinical decisions. Administrators can inspect broader audit history but cannot register visits or approve clinical decisions.

The server checks your signed-in role. Opening a restricted screen does not grant its permissions; controls may be disabled or requests rejected.

## 2. Register a patient and validate measurements

1. Open **Patient Registration**.
2. Enter the synthetic patient's name, age, gender, and presenting complaint.
3. With a clinical account, enter recorded blood pressure, heart rate, respiratory rate, temperature, and oxygen saturation using the displayed units.
4. Select recorded consciousness and mobility values. Leave unavailable observations unrecorded rather than estimating them. Clerks should leave clinical fields unrecorded.
5. Click **Validate Measurements**.

Feedback appears above the buttons:

- **Measurement checks passed:** measurements are present and within supported input ranges. This does not mean they are clinically normal.
- **Measurements are incomplete:** the message identifies unrecorded values requiring review.
- **Please correct the measurements:** fix the listed range errors before submission.

Editing the form clears the previous result. This button checks measurements; submission separately checks demographics and the complaint. Validation does not save a visit.

Click **Confirm & Register Visit** and wait for **Patient Registration Confirmed by Server**. Note the visit ID. Registration queues an assessment and shares the visit with the other workflows. It can remain in the queue without an approved priority while assessment or evidence is pending.

Use **Register Next Patient** for another intake. Repeated submission has retry protection; avoid creating a new intake just because a request is slow.

## 3. Follow the agent assessment

Open **Triage & Prioritisation**. In **Agent Assessment & Observation Capture**, select the intended visit and inspect its status.

Registration already queues an assessment. **Request Agent Assessment** requests the current observation version or retries a failed run; it does not approve priority. **View Run Trace** shows recorded model and MCP activity.

Run states:

- **QUEUED:** waiting for a worker.
- **RUNNING:** gathering/scoring evidence.
- **WAITING_FOR_REVIEW:** a proposal awaits a staff decision.
- **REVIEW_REQUIRED:** incomplete evidence or manual review is needed.
- **FAILED:** execution did not complete; review the error and choose retry or manual assessment.
- **SUPERSEDED:** newer observations replaced this assessment.
- **DECIDED:** a staff decision was recorded.

The Lambda design dispatches every minute, so a new run can take about a minute to start at light load. Local development uses polling. Longer delays can indicate provider, network, queue, or database problems.

## 4. Approve, reject, or override

Review the patient's name, complaint, observation version, measurements, missing-evidence notices, protocol, proposed priority, and tool trace. A proposal is not an approved queue priority.

With an authorised clinical account:

- **Approve Proposed Priority:** records the proposed priority through a separate server decision.
- **Reject Proposal:** enter a reason of at least five characters and confirm. Rejection leaves the patient visible for reassessment without approving priority.
- **Clinical Override Priority:** select the intended priority, enter a justification of at least five characters, and click **Confirm Override**.

Successful overrides show **Priority override successful**, identifying the patient and saved priority. Permission errors appear inside the open dialog with a polite explanation that approval access is required. Check the patient and observation version displayed in the dialog.

For stale-evidence errors, close the dialog and review the latest observations/proposal before deciding again. A failed request is not a saved decision. Clinical decisions require connectivity and an active, unlocked session.

## 5. Update observations or record a manual assessment

Select a patient in the agent panel and click **Record New Observations**. Update the recorded values, then **Save Observation Version**. The server saves a new snapshot, invalidates older pending proposals, and queues another assessment.

If the agent is unavailable, an authorised clinician can open **Manual assessment when the agent is unavailable**, select a manually assessed priority, enter a reason, and click **Record Manual Clinical Decision**. Wait for confirmation. This records a human decision and still requires connectivity.

## 6. Check the queue

Open **Hospital Queue** to inspect visits, waiting times, approved priorities, assessment status, and departments. Use the department filter and refresh controls.

Pending proposals do not silently replace approved priorities. Queue priority changes come from saved staff decisions. Workload/capacity recommendations use synthetic data, not actual staffing or bed measurements.

**Showing Stale Queue Snapshot** means a refresh failed and older information is retained. Check the last-confirmed time and restore connectivity before treating it as current shared state. **Simulate Polling Outage** is a demo control; end it with **Restore Network**.

## 7. Review deterioration

Open **Deterioration Review** after new observation versions are recorded. Compare baseline and latest measurements, timestamps, and differences.

An authorised clinician can reassess/escalate a case or open **Dismiss Deterioration Alert**, provide a justification, and click **Confirm Dismissal**. Check confirmation or errors. Version checks can reject a decision if observations change during review.

The app compares entered observations; it does not continuously monitor patients or collect device readings.

## 8. Route a patient

Open **Department Routing** after the patient has an approved priority. Review the proposed department, rationale, and synthetic capacity snapshot.

With a clinical account, click **Authorise & Commit Transfer to [department]**. Wait for **Department Transfer Confirmed by Server**, then check the assigned department in the queue.

If assessment or department versions changed, refresh and review the latest recommendation. A recommendation or congestion warning is not a committed transfer or an automatic message to another staff member.

## 9. Handle offline drafts

An already-loaded app can save an intake locally while disconnected. **Offline Draft Saved** means it remains on this browser/device and is not confirmed in the shared queue.

Open **Offline Sync & Outbox**:

- **Pending Reconnect Sync:** waiting to send.
- **Sync Failed:** retained for retry; inspect the error.
- **Confirmed Server State:** accepted by the server.

Restore connectivity and the correct staff session. Reconnect triggers replay; **Retry / Flush Sync Outbox** retries manually. Verify the confirmation and resulting visit before treating it as shared.

**Clear Confirmed Records** removes confirmed local outbox entries; it does not delete patient records from PostgreSQL. Failed/pending entries remain. Avoid clearing browser storage with drafts pending, and use the same staff account for capture and replay, particularly when measurements are included.

Clinical decisions, observation updates, manual assessments, and transfers cannot be queued for later clinical commitment. Simulation controls are for demonstration. Offline capture does not guarantee that the app can initially load or reload without connectivity.

## 10. Lock, sign out, and inspect history

An incorrect unlock PIN keeps the terminal locked and shows an error asking
you to re-enter it. The PIN field clears and receives focus for another attempt.
Only a missing or expired session requires signing in again.

Use the header lock control before leaving a shared terminal. Unlock with your PIN. Sign out when finishing or handing over the device. Expired sessions require sign-in; the backend currently issues sessions lasting up to eight hours.

Open **Staff Access & Audit** for permitted events. Nurses and clerks see their own staff events; clinicians and administrators see broader history. **Authorised Clinical Decision & Audit History** in the triage screen records patient decisions and reasons. History is not editable through the app.

## Troubleshooting

- **Sign-in fails:** check identifier/PIN, backend connectivity, and whether demo accounts were seeded. Repeated attempts can trigger temporary throttling.
- **Validation passes but registration fails:** check demographic/complaint errors and role permissions. Measurement validation checks only that section.
- **No proposed priority:** inspect run status and missing evidence; ask the developer to check model access. Unsupported populations need staff review.
- **Override denied:** use an authorised clinical account or ask an authorised staff member to review.
- **Stale decision:** refresh and review the latest observation version.
- **Outbox replay fails:** restore an unlocked session and review validation/permission errors. Retain the item until confirmed.
- **Transfer unavailable:** confirm the patient has an approved assessment and a current recommendation.
- **“Saved in Demo” or “Simulated” labels:** browser-only mode is active; those records are local rather than shared PostgreSQL state.

Report the screen, synthetic visit ID, time, error text, and run ID. Do not include passwords, session cookies, or real patient information in issue reports or screenshots.

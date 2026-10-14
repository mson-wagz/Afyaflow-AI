# AfyaFlow application user guide

This guide describes the connected PostgreSQL/Bedrock prototype. Use synthetic patient records. The scoring fixture is not clinically validated, and capacity/staffing figures are simulated. For installation, see the [README](../README.md) and [backend setup](../src/backend/README.md); for hosting, see [Lambda deployment](../deploy/lambda/README.md).

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

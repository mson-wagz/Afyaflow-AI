# AfyaFlow application user guide

New to the recent changes? Read the short [quick guide](QUICK_GUIDE.md) first.

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

Open the supplied application URL, or `http://localhost:5173` locally. Enter a staff identifier and six-digit PIN, then sign in. The identifier can be your staff ID, staff number or full name; if another account shares your name, sign in with your staff ID or number.

**Administrators** also need an authenticator app on their phone. After a correct PIN the sign-in screen asks for the 6-digit **Authenticator code**; each code works once. The system operator sets up the app with you. If you lose the phone, ask the operator to remove and re-enrol it. Unlocking a locked terminal needs only your PIN.

Your PIN is issued to you privately by an administrator or the system operator; no PINs are published. Keep it to yourself and ask for a new one if you think someone else knows it. Developers running the app locally use the development accounts described in the [backend setup](../src/backend/README.md); those PINs do not work on any deployed site.

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

Pending proposals do not silently replace approved priorities. Queue priority changes come from saved staff decisions.

Patients are ordered by approved level: Level 1 (Emergency) first, then Levels 2, 3 and 4. When several patients share a level:

- **Level 1:** the patient with the highest early warning score (TEWS) comes first. A patient who cannot be scored (a child, or missing observations) comes before scored patients, because there is no evidence they are less severe. Then earliest arrival.
- **Levels 2–4:** earliest arrival first, because everyone on the level has the same time target. Patients who arrived at the same time are ordered by TEWS.
- Arrival times within the same minute count as the same time.
- **Patients tied on everything** (same level, score and arrival) are marked **Tied 1 of 2** and so on. Clinical staff can press **See first** on one of them and give a reason; it moves to the top of the tied group only, and the choice ends when that patient's observations change. Otherwise the patient registered first is seen first. If Level 1 patients are tied, a red alert asks you to call additional clinicians, because they all need immediate care.

Under the order number, **Same level as above** explains why a patient is below the one above them. The ordering never changes anyone's level; reassess the patient to do that. Details: [Queue ordering](QUEUE_ORDERING.md). Workload/capacity recommendations use synthetic data, not actual staffing or bed measurements.

**Showing Stale Queue Snapshot** means a refresh failed and older information is retained. Check the last-confirmed time and restore connectivity before treating it as current shared state. **Simulate Polling Outage** is a demo control; end it with **Restore Network**.

### Seeing patients and recording outcomes

When a clinician starts seeing a patient, press **Mark seen** on the queue. When the visit ends, press **Record outcome**, choose **Admitted**, **Discharged**, **Died in A&E**, **Left against medical advice** or **Transferred to another facility**, add an optional note, and press **Close visit**. Front-desk staff can record only **Left without being seen**, for patients who left before a clinician saw them.

Closing a visit removes the patient from the queue, frees their bed and cancels open rechecks. It cannot be undone. The **Operations** screen uses these records to show over- and under-triage against Kenyatta National Hospital's published SATS baseline, the share of patients seen within each SATS target, length of stay and the left-without-being-seen rate. Details: [Outcome metrics](OUTCOME_METRICS.md).

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

**Clear Confirmed Records** removes confirmed local outbox entries; it does not delete patient records from PostgreSQL. Failed/pending entries remain. Avoid clearing browser storage with drafts pending.

Offline registrations belong to the staff member who captured them. Only that person sees them in the outbox, and they sync only while that person is signed in, so a registration is never recorded under someone else's name. Sign back in with the same account to send them.

**Signing out removes your patient data from this device.** Your registration drafts and queued registrations are deleted from the browser when you sign out or switch user. If any of your registrations have not reached the server yet, the app tells you how many and asks before deleting them; cancel, reconnect and let them sync first. Locking the terminal or an expired session keeps your drafts (hidden until you sign in again) so work is not lost.

Clinical decisions, observation updates, manual assessments, and transfers cannot be queued for later clinical commitment. Simulation controls are for demonstration. Offline capture does not guarantee that the app can initially load or reload without connectivity.

## 10. Lock, sign out, and inspect history

An incorrect unlock PIN keeps the terminal locked and shows an error asking
you to re-enter it. The PIN field clears and receives focus for another attempt.
Only a missing or expired session requires signing in again.

Use the header lock control before leaving a shared terminal. Unlock with your PIN. Sign out when finishing or handing over the device; signing out (or **Switch Staff User** on the lock screen) ends your server session and removes your drafts and queued registrations from the browser, as described in section 9. Expired sessions require sign-in; the backend currently issues sessions lasting up to eight hours.

The terminal locks itself after the inactivity time chosen in your profile (1–30 minutes). Independently, the server locks any session that has made no request for 15 minutes, for example after a tab was closed or a device switched off without signing out. Either way, unlock with your PIN to continue; your drafts are kept.

Open **Staff Access & Audit** for permitted events. Nurses and clerks see their own staff events; clinicians and administrators see broader history. **Authorised Clinical Decision & Audit History** in the triage screen records patient decisions and reasons. History is not editable through the app.

Viewing patient records is also recorded: each screen that shows patient data logs who viewed which patients and when (repeated refreshes of the same view are recorded once every five minutes). Administrators can review this record-access history, for example to answer "who has viewed this patient?", through `GET /api/audit/access?patientId=<visit ID>`. If the system cannot record an access, it does not show the data and asks you to try again.

**Administrators: managing staff accounts.** Open **Staff Accounts** (shown only to administrators). Type a reason for the change first; it is required and recorded. Then, on a staff member's row:

- **Deactivate** when someone leaves or should no longer have access. They are signed out everywhere and cannot sign in; **Reactivate** restores access.
- **Reset PIN** when someone forgets their PIN or it may be known to others. The new PIN appears once at the top of the screen; give it to the person privately. Their other sessions end.
- **End sessions** when a device was lost or left signed in. The person keeps their PIN.

You cannot change your own account, and the last active administrator cannot be deactivated. Authenticator apps are set up by the system operator.

## 11. Watch operations

Nurses, clinicians, doctors and administrators can open **Operations** to see how the department is running. Choose **Today**, **7 days** or **30 days**; the screen refreshes every minute.

- **Live workload:** open visits, visits awaiting an AI assessment, proposals waiting for a clinician (with how long the oldest has waited), assessments that ended without a proposal and need manual triage, and overdue rechecks. Tiles needing attention are highlighted with ⚠.
- **Priority mix and beds:** open visits by approved priority, and occupied beds against capacity for each department.
- **Arrivals:** per hour today, or per day. Select **Show table** for exact numbers.
- **Time to triage:** the median and 90th-percentile time from arrival to the AI proposal and to the clinician decision, and from proposal to decision.
- **Decisions and AI runs:** how often clinicians approved, overrode or rejected AI proposals, and how assessments ended.

The screen shows counts and times only, never patient names. Acceptance means clinicians agreed with the proposal; it does not measure clinical accuracy. "Open visits" are those without a recorded outcome; outcome-based figures (over- and under-triage, time seen against target) appear once outcomes are recorded. Day boundaries use the facility time zone (`FACILITY_TIMEZONE`, default Africa/Nairobi).

## Troubleshooting

### Active reassessment and follow-ups

Open **Deterioration Review → Active Reassessment Copilot**. An agent assessment of a
synthetic visit creates a proposed follow-up when core evidence is incomplete/unsupported
or the existing synthetic change fixture flags recorded changes. It compares only recorded
snapshots; it does not monitor patients continuously. No flag does not establish stability.

1. Expand **Review source evidence** and inspect the observation versions, missing fields,
   change flags and agent summary. The scoring and change fixtures remain unvalidated.
2. Select a named clinical owner, choose a due date/time yourself, and enter a review reason.
   Select **Approve Follow-up**. The prototype accepts future times within 24 hours; this
   technical limit is not a recommended clinical recheck interval. The AI sets no interval.
3. The assigned owner selects **Acknowledge Ownership**. Only that owner can acknowledge
   or complete the task. Clinical staff can reassign it with a reason for shift handover;
   the new owner must acknowledge again. A task can be declined/cancelled with a reason.
4. Record a new observation version in **Triage & Prioritisation**, then return and refresh
   the board. Review the new measurements and enter a completion reason. Select
   **Complete with observation v…**. An acknowledgement alone cannot complete a recheck.
5. **View Follow-up History** shows the agent proposal, staff approval, owner actions and
   completion observation reference. Closed tasks remain available via **Show closed follow-ups**.

Proposals become stale when new observations are recorded before scheduling. Scheduled tasks
remain open until completed or cancelled, and overdue tasks are highlighted. The board polls
every 10 seconds while open; no SMS, background sensor coverage or external notification is
provided. Task actions do not change patient priority, route patients or reorder the queue.
Historical MIMIC cases cannot create follow-ups. Tasks and their audit survive app restarts.

### Missing-evidence assistant

In **Triage & Prioritisation**, select a visit in **Agent Assessment & Observation Capture**.
The checklist shows recorded, missing and unsupported core evidence for that exact observation
version. Each item cites the synthetic fixture ID, version and JSON rule location. Additional
observations remain explicitly unknown when absent. This checklist is a deterministic evidence
inventory; it does not diagnose or choose measurements.

Clinical staff can select **Record Missing Evidence**, enter measured values, and save a new
observation version. Existing recorded values are shown for review; empty fields are never
estimated. Saving invalidates old proposals and queues a fresh agent assessment. If another
staff member saves observations while the form is open, saving is disabled until you select
**Record New Observations** again to reload the latest snapshot. Clerks can read the checklist
but cannot record clinical observations. Missing or unsupported age requires manual review.

### Competition edition

The competition edition uses fictional records and a model running on the same computer.
It starts in Patient Registration and does not show Historical Research Cases.
The research website retains its separately labelled MIMIC library. Do not enter real
patient information in the competition edition. A model outage leaves a case for staff
review; it never switches to a hosted provider. Both editions require a staff decision
before an agent proposal can change the approved queue. See [competition setup](COMPETITION.md).

The scoring rules remain an unvalidated synthetic demonstration fixture. A local model
does not make the scores clinically validated.

- **Sign-in fails:** check identifier/PIN, backend connectivity, and whether demo accounts were seeded. Repeated attempts can trigger temporary throttling: 20 attempts per minute from one network address, and 10 incorrect PINs per account within 15 minutes. Incorrect unlock PINs count toward the same account limit. A successful sign-in or unlock clears the account count; otherwise wait 15 minutes.
- **Validation passes but registration fails:** check demographic/complaint errors and role permissions. Measurement validation checks only that section.
- **No proposed priority:** inspect run status and missing evidence; ask the developer to check model access. Unsupported populations need staff review.
- **"Hourly AI assessment limit has been reached":** each deployment caps new and retried AI assessments per staff account (default 20 per hour) and overall (default 100 per hour). Registration and observations are still saved and the visit shows as requiring review. Request the assessment again later, or make a reasoned manual decision.
- **Override denied:** use an authorised clinical account or ask an authorised staff member to review.
- **Stale decision:** refresh and review the latest observation version.
- **Outbox replay fails:** restore an unlocked session and review validation/permission errors. Retain the item until confirmed.
- **Transfer unavailable:** confirm the patient has an approved assessment and a current recommendation.
- **“Saved in Demo” or “Simulated” labels:** browser-only mode is active; those records are local rather than shared PostgreSQL state.

Report the screen, synthetic visit ID, time, error text, and run ID. Do not include passwords, session cookies, or real patient information in issue reports or screenshots.

# Visit outcomes and outcome metrics

AfyaFlow records when a clinician first sees a patient and how each visit ends. These two
facts turn the operations dashboard from activity counts into measures of triage quality
that Kenyatta National Hospital (KNH) has already published a baseline for.

## Recording

| Action | Who | Effect |
| --- | --- | --- |
| **Mark seen** (`POST /api/visits/:id/seen`) | Nurse, clinician, doctor | Records the first time a clinician saw the patient. Once per visit. |
| **Record outcome** (`POST /api/visits/:id/outcome`) | Clinical staff: any outcome. Clerks: *left without being seen* only | Closes the visit (below). Cannot be undone. |

Outcomes are those recorded in the KNH SATS evaluation (Wangara et al., *Int J Emerg Med*
2019;12:5): **Admitted**, **Discharged**, **Died in A&E**, **Left without being seen** and
**Left against medical advice**, plus **Transferred to another facility**. *Left without
being seen* is refused once a patient has been marked seen.

Closing a visit, in one transaction:

- stores the outcome with the patient's **approved SATS priority at that moment** (append-only);
- removes the visit from the queue, triage, deterioration and routing lists;
- releases the patient's department bed;
- cancels open follow-ups, marks pending AI proposals stale and supersedes unfinished assessments;
- writes a `VISIT_CLOSED` audit event.

A closed visit refuses new observations, decisions, transfers and other changes
(`409 VISIT_CLOSED`). The database prevents reopening a visit or changing the seen time.

## Metrics (operations dashboard and `GET /api/operations/summary`)

| Metric | Definition |
| --- | --- |
| **Over-triage** | Discharged patients whose approved priority was RED, ORANGE or YELLOW ÷ all discharged patients |
| **Under-triage** | Admitted or died patients whose approved priority was GREEN ÷ all admitted or died patients |
| **Left without being seen** | *Left without being seen* ÷ all closed visits |
| **Length of stay** | Median and 90th percentile of arrival → outcome |
| **Seen within target** | Per SATS level, the share first seen within the target (ORANGE 10 min, YELLOW 60 min, GREEN 240 min). RED is "immediate", so only its median time to be seen is shown |
| **Past target, not yet seen** | Open, approved patients not yet seen whose waiting time already exceeds their level's target (live) |

Over- and under-triage follow the formulas of the KNH study, using the priority at the time
of the outcome. Visits closed without an approved priority count in the denominators only,
as in the study. The KNH post-SATS baseline (all ages: over-triage 62.3%, under-triage 7.8%)
is shown beside the figures for comparison. It describes KNH's own 2015 data, not AfyaFlow.

## Interpreting the figures

- Over- and under-triage measure agreement between the triage level and the eventual
  outcome. They are the measures KNH used to evaluate SATS, not a full measure of clinical
  appropriateness: a discharged ORANGE patient may have been correctly urgent.
- Small numbers move percentages sharply. Read the counts shown with each percentage.
- Until real patients are used, every figure describes synthetic data only.

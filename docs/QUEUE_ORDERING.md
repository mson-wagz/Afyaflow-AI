# Queue ordering and tie-breaking

**Version:** `queue-order-v2` (`src/shared/contracts/queue-runtime.js`). The backend and the
browser use the same function, so every screen shows the same order.

## Priority levels

The queue uses the approved South African Triage Scale (SATS) level set by a clinician.
The AI only proposes; a proposal never moves a patient in the queue.

| Level | Colour | Category | Target |
| --- | --- | --- | --- |
| 1 | RED | Emergency (resuscitation / immediate) | Immediately |
| 2 | ORANGE | Very urgent | 10 minutes |
| 3 | YELLOW | Urgent | 60 minutes |
| 4 | GREEN | Routine | 240 minutes |
| 5 | BLUE | Deceased | — |
| — | — | Awaiting clinician approval | Kept below approved patients, in arrival order |

## Rules for patients on the same level

Each patient gets one ordering key, compared field by field:

| Level | 1st | 2nd | 3rd | Last |
| --- | --- | --- | --- | --- |
| 1 (RED) | Severity: higher TEWS first; unscored first | Earlier arrival | — | Visit ID |
| 2–4 | Earlier arrival (earliest deadline) | Severity, as for Level 1 | — | Visit ID |
| 5, awaiting approval | Earlier arrival | — | — | Visit ID |

**Severity** is the Triage Early Warning Score (TEWS) of the patient's latest recorded
observations, calculated by the same deterministic scorer as the assessment tool. It is
never produced by the AI model. A patient the protocol cannot score (under 18, age
unknown, or observations incomplete) is **unscored** and goes ahead of scored patients on
the same level: there is no recorded evidence that they are less severe, and they need a
clinician's attention to complete the assessment.

**Why Level 1 uses severity first.** The Level 1 target is "immediately", so every Level 1
patient is already at their target and waiting time cannot separate them. When several
patients all need immediate care, the patient with the most abnormal physiology is seen
first. TEWS is the physiological score that SATS itself uses to assign levels.

**Why Levels 2–4 use arrival first.** Every patient on a level has the same target, so the
deadline (arrival + target) is earliest for whoever arrived first. Serving the earliest
deadline first is Jackson's rule (1955), which provably minimises the longest time any
patient exceeds their target on that level. It also prevents starvation: a patient cannot
be passed indefinitely by later arrivals. Severity decides only when arrival times are equal.

**The visit ID** is unique, so it decides any remaining tie in the same way on every device.

## Why there are no deadlocks

1. Each patient's key is computed from that patient alone (level, severity, arrival time and
   visit ID), never from a pairwise judgement, so comparisons are consistent: if A is above B
   and B is above C, A is above C.
2. Every key field is totally ordered, with a fixed position for missing values: unknown
   severity first, unknown or invalid arrival time last in its level. Visit IDs compare by
   character code, independent of browser language.
3. The last field (the visit ID) is unique, so two different patients never compare as
   equal.

Lexicographic comparison of such keys is a **strict total order**. Sorting by it therefore
has exactly one result, whatever order the records arrive in. The tests check this by
sorting 200 shuffled copies of a queue built with deliberate ties, and by checking
antisymmetry and transitivity for every pair and triple
(`src/frontend/src/features/queue/ordering.test.js`). Each entry in `GET /api/queue` carries
`queueOrder` (rank, level, severity, version). When it shares a level with the entry above,
it also carries `tieBreak`: the rule that placed it lower, which the queue screen shows.

Two clinicians acting on the same patient at once are handled separately. Decisions,
observations and transfers lock the visit row and check its version, so a conflicting
second change is refused with `409` rather than applied twice.

## Limits

- The scorer is the project's synthetic fixture, not a validated SATS implementation. It
  scores adults only. The ordering rules must be reviewed by a qualified clinician before
  clinical use.
- The order is advice for the next patient to see. Clinicians can change a patient's level
  through reassessment (manual escalation) at any time; the tie-break never changes a level.
- Severity uses the latest observations. A patient whose condition changes should have new
  observations recorded, which also triggers reassessment.

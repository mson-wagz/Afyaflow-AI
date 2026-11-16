# Queue ordering and tie-breaking

**Version:** `queue-order-v3` (`src/shared/contracts/queue-runtime.js`). The backend and the
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

Each patient gets one ordering key, compared field by field. The first three fields are the
**clinical criteria**; the rest only separate patients who are equal on all of them.

| Level | Clinical criteria | If clinically tied |
| --- | --- | --- |
| 1 (RED) | Severity (higher TEWS first; unscored first), then arrival minute | Clinician's "see first" choice, then registration order |
| 2–4 | Arrival minute (earliest deadline), then severity | Clinician's "see first" choice, then registration order |
| 5, awaiting approval | Arrival minute | Registration order |

The visit ID is a final guard that is never reached in practice (see below).

**Severity** is the Triage Early Warning Score (TEWS) of the patient's latest recorded
observations, calculated by the same deterministic scorer as the assessment tool. It is
never produced by the AI model. A patient the protocol cannot score (12 or under, age
unknown, or observations incomplete) is **unscored** and goes ahead of scored patients on
the same level: there is no recorded evidence that they are less severe, and they need a
clinician's attention to complete the assessment.

**Arrival minute.** Arrival times are entered to the minute, so arrivals within the same
minute count as simultaneous; a few seconds' difference never decides.

**Why Level 1 uses severity first.** The Level 1 target is "immediately", so every Level 1
patient is already at their target and waiting time cannot separate them. When several
patients all need immediate care, the patient with the most abnormal physiology is seen
first. TEWS is the physiological score that SATS itself uses to assign levels.

**Why Levels 2–4 use arrival first.** Every patient on a level has the same target, so the
deadline (arrival + target) is earliest for whoever arrived first. Serving the earliest
deadline first is Jackson's rule (1955), which provably minimises the longest time any
patient exceeds their target on that level. It also prevents starvation: a patient cannot
be passed indefinitely by later arrivals. Severity decides only when arrival minutes are
equal.

## Full clinical ties

Patients are **clinically tied** when they share the level, severity and arrival minute:
for example, two Level 1 patients with identical vital signs who arrived together. No
clinical rule can separate them, so:

1. **The tie is shown.** Each tied patient is marked "Tied *n* of *m*". When Level 1
   patients are tied, the queue shows an alert: they all need immediate care, so the
   response is to call additional clinicians and see them in parallel. The order only
   says who to start with.
2. **A clinician can decide.** Clinical staff can press **See first** on a tied patient
   and give a reason (for example a concern not captured by the score, such as airway
   compromise or pregnancy). That patient moves to the top of its tie group; if several are
   chosen, the most recent choice is first. The choice:
   - applies only within the tie group, so it can never move a patient above someone who is
     more severe, arrived earlier on a timed level, or is on a higher level;
   - lapses automatically when the patient's observations or assessment change;
   - is refused if the patient is not tied (`409 NOT_TIED`) or the screen is out of date
     (`409 VERSION_CONFLICT`), and is never available to clerks or administrators;
   - is stored append-only and audited (`QUEUE_PRECEDENCE_SET`, with the patients it was
     tied with).
3. **Otherwise, first registered is seen first.** Each visit gets a server-assigned
   registration number that is unique and increasing, so the default is "first registered,
   first seen". It replaces the random visit ID, which carries no meaning.

## Why there are no deadlocks

1. Each patient's key is computed from that patient alone (level, severity, arrival minute,
   current clinician choice, registration number, visit ID), never from a pairwise judgement,
   so comparisons are consistent: if A is above B and B is above C, A is above C.
2. Every key field is totally ordered, with a fixed position for missing values: unknown
   severity first, unknown or invalid arrival time last in its level, no clinician choice
   after any choice, missing registration number last. Visit IDs compare by character code,
   independent of browser language.
3. The registration number is unique (database constraint), and the visit ID behind it is
   unique too, so two different patients never compare as equal.

Lexicographic comparison of such keys is a **strict total order**. Sorting by it therefore
has exactly one result, whatever order the records arrive in. The tests check this by
sorting 200 shuffled copies of a queue built with deliberate ties (including equal
registration numbers and clinician choices), and by checking antisymmetry and transitivity
for every pair and triple (`src/frontend/src/features/queue/ordering.test.js`).

Each entry in `GET /api/queue` carries `queueOrder` (rank, level, severity, version),
`clinicalTie` (`{ size, position }` or null), `queuePrecedence` (the current clinician
choice or null) and, when it shares a level with the entry above, `tieBreak`: the rule that
placed it lower, which the queue screen shows.

Two clinicians acting on the same patient at once are handled separately. Decisions,
observations, transfers and "see first" choices lock the visit row and check its version,
so a conflicting second change is refused with `409` rather than applied twice.

## Limits

- The scorer is the project's synthetic fixture, not a validated SATS implementation. It
  scores patients aged 13 and over, the population KNH sends to the adult A&E. The ordering rules must be reviewed by a qualified clinician before
  clinical use.
- The order is advice for the next patient to see. Clinicians can change a patient's level
  through reassessment (manual escalation) at any time; the tie-break never changes a level.
- Severity uses the latest observations. A patient whose condition changes should have new
  observations recorded, which also triggers reassessment and ends any "see first" choice.

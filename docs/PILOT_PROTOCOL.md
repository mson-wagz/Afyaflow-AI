# Pilot evaluation protocol (draft)

**Purpose:** show, with Kenyan patients and KNH's own measures, whether triage supported by
AfyaFlow is at least as safe as current practice and reduces over-triage. **Status:** draft
for discussion with the KNH A&E leadership, the triage committee and the KNH–UoN Ethics and
Research Committee. Nothing in this document has been approved.

## Why this design

KNH evaluated its own move to the South African Triage Scale (SATS) with a pre/post chart
review of A&E visits, measuring over- and under-triage against outcomes (Wangara et al.,
*Int J Emerg Med* 2019;12:5). Repeating that design means the results can be read directly
against KNH's published baseline: after SATS, over-triage was 62.3% and under-triage 7.8%
(all ages). AfyaFlow computes both with the same formulas
([OUTCOME_METRICS.md](OUTCOME_METRICS.md)).

## Preconditions (none are met yet)

1. Clinical sign-off of the scoring protocol, including the gaps in
   [SATS_CLINICAL_REVIEW.md](SATS_CLINICAL_REVIEW.md).
2. In-country hosting with `DATA_RESIDENCY=kenya`, or an approved transfer, plus the other
   items in the [Kenya regulatory checklist](compliance/KENYA_REGULATORY_CHECKLIST.md).
3. Ethics approval and a decision on consent (for example, a waiver with a patient notice).
4. Staff trained, and named staff for technical and clinical escalation on every shift.

## Phases

| Phase | Duration | What happens | Effect on care |
| --- | --- | --- | --- |
| 0. Baseline | 4 weeks | Usual SATS triage. Research staff record arrival, triage level, time seen and outcome for sampled patients. | None |
| 1. Shadow | 4 weeks | Usual triage continues. Research staff enter the same observations into AfyaFlow; its proposals are recorded but **not shown** to triage nurses. | None |
| 2. Supported triage | 8 weeks, selected shifts | Triage nurses use AfyaFlow; every level is still a nurse or clinician decision. | Nurse decides, with the proposal visible |

**Sampling:** every sixth patient registered at triage on sampled shifts, as in the KNH
patient-flow study (Myers et al., *BMJ Open* 2017), across day, evening and night shifts and
weekdays and weekends. The 2019 KNH study reviewed about 1,200 visits per period; aim for a
similar number per arm.

**Population:** patients over 12 seen at the adult A&E. Children 12 and under, who go to
the Paediatric Emergency Unit, are excluded.

## Measures

**Primary**
- Over-triage: RED, ORANGE or YELLOW patients discharged ÷ all discharged.
- Under-triage (safety): GREEN patients admitted or died ÷ all admitted or died.

**Secondary**
- Share seen within the SATS target per level (ORANGE 10 min, YELLOW 60 min, GREEN 240 min);
  median time to be seen for RED.
- Length of stay (arrival to outcome) and the left-without-being-seen rate.
- In phases 1–2: agreement between the AfyaFlow proposal and the nurse's level, override
  rate, and over- and under-triage of the proposals themselves.
- Time taken to triage one patient, and staff-reported usability.

All are available from the operations dashboard and the audit trail without manual
calculation. Record each period's figures with the protocol version and software commit.

## Safety monitoring

- Weekly review by a named A&E clinician of every under-triaged patient (GREEN admitted or
  died) and every AfyaFlow proposal that was lower than the nurse's level.
- **Stop rule:** pause phase 2 if under-triage in any two consecutive weeks is above the
  phase 0 rate by a margin agreed in advance with the ethics committee, or after any serious
  incident linked to the tool, pending review.
- Downtime: the paper SATS form remains the fallback
  ([EMERGENCY_ACCESS.md](compliance/EMERGENCY_ACCESS.md)).

## Analysis

Compare phase 0 with phase 2 for the primary measures, with proportions and 95% confidence
intervals, and report phase 1 agreement separately. Report results by age band, shift and
SATS level. Report all results, including unfavourable ones. Pre-register the analysis plan
before phase 2 begins.

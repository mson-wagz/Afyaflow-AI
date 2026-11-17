# SATS clinical review pack

**For:** the Kenyatta National Hospital (KNH) triage committee or another qualified clinical
reviewer. **Status:** the scorer is a synthetic test fixture (`demo-v2`) and is **not
clinically validated**. It must not be used for real patients until the gaps below are
closed and signed off.

KNH has used the South African Triage Scale (SATS) since April 2015 (Wangara et al., *Int J
Emerg Med* 2019;12:5). AfyaFlow is designed around the same scale. This pack shows exactly
what the software does today so a reviewer can compare it with the official SATS adult chart.

## What the scorer does today

Source: `calculateSatsScore` in `src/shared/contracts/triage.js`. Required inputs: heart
rate, systolic blood pressure, respiratory rate, temperature and AVPU. If any is missing,
no score is produced and staff must triage manually.

| Parameter | Points as implemented |
| --- | --- |
| Heart rate (bpm) | <40 or >130: 3 · 111–130: 2 · 41–50 or 101–110: 1 · otherwise 0 |
| Systolic BP (mmHg) | <70: 3 · 71–80: 2 · 81–100: 1 · >200: 2 · otherwise 0 |
| Respiratory rate (/min) | <9 or >35: 3 · 30–35: 2 · 9–14 or 21–29: 1 · otherwise 0 |
| Temperature (°C) | <35.0: 2 · ≥38.5: 1 · otherwise 0 |
| AVPU | Pain or Unresponsive: 3 · Voice: 2 · Alert: 0 |
| Mobility | **Not scored** (recorded, but no points) |
| Trauma | **Not captured or scored** |

Total score to level: **≥7 RED**, **5–6 ORANGE**, **3–4 YELLOW**, **0–2 GREEN**.

**Population:** patients aged **13 and over**, matching KNH's routing of all patients over
12 to the adult A&E. Children 12 and under are not scored and are flagged for the
paediatric emergency pathway.

## Gaps against SATS that need clinical input

1. **TEWS point values.** The table above was written as a test fixture. Each band must be
   checked against the official SATS adult TEWS chart, and corrected where it differs.
   The current bands also have **holes**: a heart rate of exactly 40 and a systolic BP of
   exactly 70 score 0, as do values between bands such as a heart rate of 100.5. Physiology
   that should score points can therefore score none. The corrected chart must cover every
   value.
2. **Mobility and trauma.** SATS adult TEWS includes mobility (walking / with help /
   stretcher or immobile) and trauma. AfyaFlow records mobility but does not score it, and
   does not capture trauma.
3. **Clinical discriminators.** SATS places patients with emergency signs (RED) and very
   urgent or urgent discriminators (ORANGE / YELLOW) at that level regardless of TEWS.
   AfyaFlow has none of these yet. Until it does, the clinician's review is the only
   safeguard for such presentations. As an interim aid, the agent can flag **possible
   emergency signs** written in the complaint (`src/shared/contracts/danger-signs.js`: chest
   pain, difficulty breathing, seizure, reduced consciousness or collapse, heavy bleeding,
   severe burn, poisoning or overdose, pregnancy with bleeding or abdominal pain, severe pain).
   Each flag must quote the complaint word for word; flags never change the score, and the
   nurse confirms them and overrides with a reason if present. The list is a draft for review
   and is not the SATS discriminator list.
4. **Senior clinician discretion.** SATS allows a senior health professional to change the
   level. AfyaFlow supports this through override and reassessment, with a recorded reason.
5. **Adolescents (13–17).** Confirm that the adult chart is appropriate for all adolescents
   at KNH, or specify the exceptions.

## How changes will be made

The project will not transcribe point values or discriminator lists from memory. Each change
will come from the official SATS manual or KNH's local triage guideline, cite the page,
carry a new protocol version (so proposals made under the old version stay distinguishable)
and be covered by boundary tests. Sign-off by the reviewer should be recorded in this
document with the date and protocol version.

| Protocol version | Reviewed by | Date | Decision |
| --- | --- | --- | --- |
| demo-v2 | — | — | Not yet reviewed |

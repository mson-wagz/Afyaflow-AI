/**
 * @file outcomes.js
 * Browser-safe visit outcome contracts (docs/OUTCOME_METRICS.md).
 *
 * Dispositions follow those recorded in the Kenyatta National Hospital SATS evaluation
 * (Wangara et al., Int J Emerg Med 2019;12:5), plus transfer to another facility.
 */

export const DISPOSITIONS = {
  ADMITTED: { code: 'ADMITTED', label: 'Admitted' },
  DISCHARGED: { code: 'DISCHARGED', label: 'Discharged' },
  DIED: { code: 'DIED', label: 'Died in A&E' },
  LEFT_WITHOUT_BEING_SEEN: { code: 'LEFT_WITHOUT_BEING_SEEN', label: 'Left without being seen' },
  LEFT_AGAINST_MEDICAL_ADVICE: { code: 'LEFT_AGAINST_MEDICAL_ADVICE', label: 'Left against medical advice' },
  TRANSFERRED_OUT: { code: 'TRANSFERRED_OUT', label: 'Transferred to another facility' },
};

/** Front-desk staff may record only that a patient left before being seen; clinical staff record any outcome. */
export function dispositionsForRole(role) {
  if (['nurse', 'clinician', 'doctor'].includes(role)) return Object.keys(DISPOSITIONS);
  if (role === 'clerk') return ['LEFT_WITHOUT_BEING_SEEN'];
  return [];
}

/** SATS time-to-treatment targets in minutes (RED is "immediate", so it has no compliance window). */
export const SATS_TARGET_MINUTES = { RED: 0, ORANGE: 10, YELLOW: 60, GREEN: 240 };

/**
 * KNH baseline after SATS implementation (Wangara et al. 2019, all ages):
 * under-triage 7.8%, over-triage 62.3%. Shown on the dashboard for comparison only.
 */
export const KNH_SATS_BASELINE = { underTriagePercent: 7.8, overTriagePercent: 62.3, source: 'Wangara et al., Int J Emerg Med 2019;12:5' };

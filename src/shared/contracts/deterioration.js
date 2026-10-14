/**
 * @file deterioration.js
 * Browser-safe contracts and comparison logic for Deterioration Monitoring and Reassessment Review.
 * 
 * Follows specs/frontend/deterioration-monitoring/spec.md & specs/features/deterioration-monitoring/spec.md
 */

/**
 * Compares two timestamped observations for a patient to detect clinical deterioration.
 * Strict: WATCH-01 & WATCH-05. Requires valid inputs and cites both observation entries.
 * 
 * @param {object} baselineObs Previous baseline observation
 * @param {object} latestObs Newly recorded observation
 * @returns {{
 *   hasDeteriorated: boolean,
 *   triggers: string[],
 *   deltas: Record<string, { before: any, after: any, diff: string }>,
 *   ruleVersion: string,
 *   recommendedAction: string
 * }}
 */
export function compareObservationsForDeterioration(baselineObs, latestObs) {
  if (!baselineObs || !latestObs) {
    return {
      hasDeteriorated: false,
      triggers: [],
      deltas: {},
      ruleVersion: 'Deterioration-Rules-v2026.1',
      recommendedAction: 'Insufficient comparison baseline — record repeat observations.',
    };
  }

  const triggers = [];
  const deltas = {};

  // Heart Rate change >= 20 bpm or tachycardia onset
  if (baselineObs.heartRate && latestObs.heartRate) {
    const hrBefore = Number(baselineObs.heartRate);
    const hrAfter = Number(latestObs.heartRate);
    const diff = hrAfter - hrBefore;
    deltas.heartRate = { before: `${hrBefore} bpm`, after: `${hrAfter} bpm`, diff: `${diff > 0 ? '+' : ''}${diff} bpm` };
    if (Math.abs(diff) >= 20 || (hrBefore <= 100 && hrAfter > 115)) {
      triggers.push(`Heart Rate significant escalation: ${diff > 0 ? '+' : ''}${diff} bpm`);
    }
  }

  // Respiratory Rate change >= 6 /min
  if (baselineObs.respiratoryRate && latestObs.respiratoryRate) {
    const rrBefore = Number(baselineObs.respiratoryRate);
    const rrAfter = Number(latestObs.respiratoryRate);
    const diff = rrAfter - rrBefore;
    deltas.respiratoryRate = { before: `${rrBefore} /min`, after: `${rrAfter} /min`, diff: `${diff > 0 ? '+' : ''}${diff} /min` };
    if (Math.abs(diff) >= 6 || (rrBefore <= 20 && rrAfter >= 24)) {
      triggers.push(`Respiratory Rate tachypnoea elevation: ${diff > 0 ? '+' : ''}${diff} /min`);
    }
  }

  // Systolic BP drop >= 20 mmHg
  if (baselineObs.systolicBp && latestObs.systolicBp) {
    const sbpBefore = Number(baselineObs.systolicBp);
    const sbpAfter = Number(latestObs.systolicBp);
    const diff = sbpAfter - sbpBefore;
    deltas.systolicBp = { before: `${sbpBefore} mmHg`, after: `${sbpAfter} mmHg`, diff: `${diff > 0 ? '+' : ''}${diff} mmHg` };
    if (diff <= -20 || sbpAfter < 90) {
      triggers.push(`Systolic BP significant drop / Hypotension: ${diff} mmHg`);
    }
  }

  // SpO2 drop < 93%
  if (baselineObs.spO2 && latestObs.spO2) {
    const satBefore = Number(baselineObs.spO2);
    const satAfter = Number(latestObs.spO2);
    const diff = satAfter - satBefore;
    deltas.spO2 = { before: `${satBefore}%`, after: `${satAfter}%`, diff: `${diff > 0 ? '+' : ''}${diff}%` };
    if (satAfter < 93 && satBefore >= 93) {
      triggers.push(`Oxygen Saturation desaturation below 93% (Current: ${satAfter}%)`);
    }
  }

  // Neurological AVPU change
  if (baselineObs.avpu && latestObs.avpu && baselineObs.avpu !== latestObs.avpu) {
    deltas.avpu = { before: baselineObs.avpu, after: latestObs.avpu, diff: 'Status altered' };
    if (latestObs.avpu !== 'Alert') {
      triggers.push(`Consciousness deterioration: Altered from ${baselineObs.avpu} to ${latestObs.avpu}`);
    }
  }

  const hasDeteriorated = triggers.length > 0;

  return {
    hasDeteriorated,
    triggers,
    deltas,
    ruleVersion: 'Deterioration-Rules-v2026.1',
    recommendedAction: hasDeteriorated
      ? 'Urgent clinical reassessment proposed: Vital signs indicate physiological deterioration.'
      : 'Observations stable across recorded intervals.',
  };
}

/**
 * Calculates observation age and staleness status
 * @param {string} timestampIso
 * @returns {{ ageMinutes: number, ageFormatted: string, isStale: boolean, warningText: string }}
 */
export function calculateObservationAge(timestampIso) {
  if (!timestampIso) {
    return { ageMinutes: 999, ageFormatted: 'Unknown', isStale: true, warningText: 'No vitals recorded' };
  }
  const recorded = new Date(timestampIso).getTime();
  const diffMins = Math.max(0, Math.floor((Date.now() - recorded) / (60 * 1000)));

  const isStale = diffMins >= 60;
  const ageFormatted = diffMins < 60 ? `${diffMins}m ago` : `${Math.floor(diffMins / 60)}h ${diffMins % 60}m ago`;

  return {
    ageMinutes: diffMins,
    ageFormatted,
    isStale,
    warningText: isStale ? 'Observation Stale (Repeat vitals recommended)' : 'Fresh observation',
  };
}

/**
 * @file triage.js
 * Browser-safe contracts and deterministic scoring logic for SATS Triage & Clinical Decision Review.
 * 
 * Follows specs/frontend/patient-prioritisation/spec.md & specs/features/patient-prioritisation/spec.md
 */

export const TRIAGE_PRIORITY = {
  RED: {
    code: 'RED',
    label: 'Resuscitation / Immediate',
    color: '#dc2626',
    bgColor: '#fee2e2',
    targetMinutes: 0,
    description: 'Immediate resuscitation required',
  },
  ORANGE: {
    code: 'ORANGE',
    label: 'Very Urgent',
    color: '#c2410c',
    bgColor: '#ffedd5',
    targetMinutes: 10,
    description: 'Assessment within 10 minutes',
  },
  YELLOW: {
    code: 'YELLOW',
    label: 'Urgent',
    color: '#a16207',
    bgColor: '#fef9c3',
    targetMinutes: 60,
    description: 'Assessment within 60 minutes',
  },
  GREEN: {
    code: 'GREEN',
    label: 'Routine',
    color: '#15803d',
    bgColor: '#dcfce7',
    targetMinutes: 240,
    description: 'Assessment within 240 minutes',
  },
  BLUE: {
    code: 'BLUE',
    label: 'Deceased',
    color: '#475569',
    bgColor: '#f1f5f9',
    targetMinutes: 0,
    description: 'Certified deceased',
  },
};

export const CLINICAL_DECISION_TYPES = {
  APPROVE: 'APPROVED',
  REJECT: 'REJECTED',
  OVERRIDE: 'OVERRIDDEN',
};

export const PROTOCOL_METADATA = {
  name: 'AfyaFlow synthetic adult scoring fixture',
  version: 'demo-v1',
  population: 'Synthetic adults aged 18 and above',
  authority: 'Project test fixture; not an approved clinical protocol',
  clinicalValidated: false,
  deterministicScoringEngine: 'synthetic-demo-v1',
};

/**
 * Deterministic SATS / TEWS scoring logic.
 * Calculates score from vital signs and applies physiological discriminators.
 * Strict: Never invents missing values; flags incomplete evidence.
 * 
 * @param {object} obs Observation vitals
 * @returns {{
 *   score: number | null,
 *   priority: object,
 *   ruleTriggered: string,
 *   isSufficientEvidence: boolean,
 *   missingEvidence: string[],
 *   citations: object[]
 * }}
 */
export function calculateSatsScore(obs = {}) {
  const missingEvidence = [];
  let score = 0;
  const citations = [];

  // Check required core parameters
  if (obs.heartRate === undefined || obs.heartRate === '') {
    missingEvidence.push('Heart Rate');
  } else {
    const hr = Number(obs.heartRate);
    citations.push({ param: 'Heart Rate', value: `${hr} bpm`, rule: 'HR vital check' });
    if (hr < 40 || hr > 130) score += 3;
    else if (hr >= 111 && hr <= 130) score += 2;
    else if ((hr >= 41 && hr <= 50) || (hr >= 101 && hr <= 110)) score += 1;
  }

  if (obs.systolicBp === undefined || obs.systolicBp === '') {
    missingEvidence.push('Systolic Blood Pressure');
  } else {
    const sbp = Number(obs.systolicBp);
    citations.push({ param: 'Systolic BP', value: `${sbp} mmHg`, rule: 'SBP vital check' });
    if (sbp < 70) score += 3;
    else if (sbp >= 71 && sbp <= 80) score += 2;
    else if (sbp >= 81 && sbp <= 100) score += 1;
    else if (sbp > 200) score += 2;
  }

  if (obs.respiratoryRate === undefined || obs.respiratoryRate === '') {
    missingEvidence.push('Respiratory Rate');
  } else {
    const rr = Number(obs.respiratoryRate);
    citations.push({ param: 'Respiratory Rate', value: `${rr} /min`, rule: 'RR vital check' });
    if (rr < 9 || rr > 35) score += 3;
    else if (rr >= 30 && rr <= 35) score += 2;
    else if ((rr >= 9 && rr <= 14) || (rr >= 21 && rr <= 29)) score += 1;
  }

  if (obs.temperature === undefined || obs.temperature === '') {
    missingEvidence.push('Temperature');
  } else {
    const temp = Number(obs.temperature);
    citations.push({ param: 'Temperature', value: `${temp} °C`, rule: 'Temp vital check' });
    if (temp < 35.0) score += 2;
    else if (temp >= 38.5) score += 1;
  }

  if (obs.avpu) {
    citations.push({ param: 'Neurological (AVPU)', value: obs.avpu, rule: 'AVPU discriminator' });
    if (obs.avpu === 'Unresponsive' || obs.avpu === 'Pain') score += 3;
    else if (obs.avpu === 'Voice') score += 2;
  }

  // If core evidence is missing, flag insufficient evidence
  if (missingEvidence.length > 0) {
    return {
      score: null,
      priority: null,
      ruleTriggered: 'Insufficient vital observations for automated protocol calculation',
      isSufficientEvidence: false,
      missingEvidence,
      citations,
    };
  }

  // SATS priority threshold matching
  let priority = TRIAGE_PRIORITY.GREEN;
  let ruleTriggered = 'TEWS Score 0-2 (Routine care)';

  if (score >= 7) {
    priority = TRIAGE_PRIORITY.RED;
    ruleTriggered = `TEWS Score ${score} >= 7 (Resuscitation threshold)`;
  } else if (score >= 5) {
    priority = TRIAGE_PRIORITY.ORANGE;
    ruleTriggered = `TEWS Score ${score} (5-6) (Very Urgent threshold)`;
  } else if (score >= 3) {
    priority = TRIAGE_PRIORITY.YELLOW;
    ruleTriggered = `TEWS Score ${score} (3-4) (Urgent threshold)`;
  }

  return {
    score,
    priority,
    ruleTriggered,
    isSufficientEvidence: true,
    missingEvidence: [],
    citations,
  };
}

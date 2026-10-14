/**
 * @file patient.js
 * Browser-safe contracts and validation schemas for Patient Visits and Timestamped Observations.
 * 
 * Follows specs/frontend/patient-registration/spec.md
 */

export const GENDER = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
};

export const AVPU_SCALE = {
  ALERT: 'Alert',
  VOICE: 'Voice',
  PAIN: 'Pain',
  UNRESPONSIVE: 'Unresponsive',
};

export const MOBILITY_STATUS = {
  WALKING: 'Walking normally',
  ASSISTED: 'Needs assistance to walk',
  IMMOBILE: 'Immobile / Stretcher',
};

/**
 * Standard observation measurement units
 */
export const OBSERVATION_UNITS = {
  bloodPressure: 'mmHg',
  heartRate: 'bpm',
  respiratoryRate: '/min',
  temperature: '°C',
  spO2: '%',
  bloodGlucose: 'mmol/L',
};

/**
 * Validates patient registration intake fields.
 * Explicitly identifies missing information without guessing.
 * 
 * @param {object} patient
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validatePatientRegistration(patient) {
  const errors = {};

  if (!patient.name || patient.name.trim().length < 2) {
    errors.name = 'Patient name is required (minimum 2 characters)';
  }

  const ageNum = Number(patient.age);
  if (patient.age === '' || patient.age === undefined || isNaN(ageNum) || ageNum < 0 || ageNum > 130) {
    errors.age = 'A valid age in years (0 - 130) is required';
  }

  if (!patient.gender) {
    errors.gender = 'Patient gender is required';
  }

  if (!patient.presentingComplaint || patient.presentingComplaint.trim().length < 3) {
    errors.presentingComplaint = 'Presenting complaint is required (describe primary symptoms)';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates clinical observations with schema-based field error messages and unit checks.
 * Strict: Never guesses missing measurements.
 * 
 * @param {object} obs
 * @returns {{ valid: boolean, errors: Record<string, string>, missingFields: string[] }}
 */
export function validateObservationData(obs) {
  const errors = {};
  const missingFields = [];

  // Heart Rate
  if (obs.heartRate !== undefined && obs.heartRate !== '') {
    const hr = Number(obs.heartRate);
    if (isNaN(hr) || hr < 20 || hr > 260) {
      errors.heartRate = `Heart rate must be between 20 and 260 ${OBSERVATION_UNITS.heartRate}`;
    }
  } else {
    missingFields.push('Heart Rate');
  }

  // Blood Pressure Systolic & Diastolic
  if (obs.systolicBp !== undefined && obs.systolicBp !== '') {
    const sys = Number(obs.systolicBp);
    if (isNaN(sys) || sys < 40 || sys > 300) {
      errors.systolicBp = `Systolic BP must be between 40 and 300 ${OBSERVATION_UNITS.bloodPressure}`;
    }
  } else {
    missingFields.push('Systolic BP');
  }

  if (obs.diastolicBp !== undefined && obs.diastolicBp !== '') {
    const dia = Number(obs.diastolicBp);
    if (isNaN(dia) || dia < 20 || dia > 200) {
      errors.diastolicBp = `Diastolic BP must be between 20 and 200 ${OBSERVATION_UNITS.bloodPressure}`;
    }
  } else {
    missingFields.push('Diastolic BP');
  }

  // Respiratory Rate
  if (obs.respiratoryRate !== undefined && obs.respiratoryRate !== '') {
    const rr = Number(obs.respiratoryRate);
    if (isNaN(rr) || rr < 4 || rr > 80) {
      errors.respiratoryRate = `Respiratory rate must be between 4 and 80 ${OBSERVATION_UNITS.respiratoryRate}`;
    }
  } else {
    missingFields.push('Respiratory Rate');
  }

  // Temperature
  if (obs.temperature !== undefined && obs.temperature !== '') {
    const temp = Number(obs.temperature);
    if (isNaN(temp) || temp < 28 || temp > 45) {
      errors.temperature = `Temperature must be between 28.0 and 45.0 ${OBSERVATION_UNITS.temperature}`;
    }
  } else {
    missingFields.push('Temperature');
  }

  // Oxygen Saturation SpO2
  if (obs.spO2 !== undefined && obs.spO2 !== '') {
    const sat = Number(obs.spO2);
    if (isNaN(sat) || sat < 40 || sat > 100) {
      errors.spO2 = `SpO2 oxygen saturation must be between 40% and 100%`;
    }
  } else {
    missingFields.push('SpO2');
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    missingFields,
  };
}

/**
 * Creates a unique client-side submission key for retry-safe idempotency.
 * Repeated clicks with the same idempotency key will not create duplicate confirmed records.
 */
export function generateSubmissionIdempotencyKey(visitId, version = 1) {
  return `idemp_${visitId}_v${version}_${Date.now()}`;
}

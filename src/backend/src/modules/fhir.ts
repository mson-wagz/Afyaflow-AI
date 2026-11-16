import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Database } from '../database/db.js';
import type { Staff } from '../auth/auth.js';
import { calculateSatsScore, TRIAGE_PRIORITY, ADULT_CHART_MIN_AGE, PROTOCOL_METADATA } from '../../../shared/contracts/triage.js';
import { DISPOSITIONS } from '../../../shared/contracts/outcomes.js';

/* ------------------------------------------------------------------ */
/* FHIR R4 export of one visit (docs/INTEROPERABILITY.md)              */
/* ------------------------------------------------------------------ */
// A self-contained `collection` Bundle that a hospital information system or integration engine
// can import, so a visit triaged in AfyaFlow is not typed again. Vital signs use LOINC and UCUM;
// AfyaFlow-specific concepts (SATS level, TEWS) use AfyaFlow code systems with plain text.

const LOINC = 'http://loinc.org', UCUM = 'http://unitsofmeasure.org';
const AFYAFLOW = 'https://afyaflow.online/fhir';
const FHIR_ROLES = ['nurse', 'clinician', 'doctor', 'admin'];

const VITALS: Array<{ key: string; loinc: string; display: string; unit: string; ucum: string }> = [
  { key: 'heartRate', loinc: '8867-4', display: 'Heart rate', unit: '/min', ucum: '/min' },
  { key: 'respiratoryRate', loinc: '9279-1', display: 'Respiratory rate', unit: '/min', ucum: '/min' },
  { key: 'systolicBp', loinc: '8480-6', display: 'Systolic blood pressure', unit: 'mmHg', ucum: 'mm[Hg]' },
  { key: 'diastolicBp', loinc: '8462-4', display: 'Diastolic blood pressure', unit: 'mmHg', ucum: 'mm[Hg]' },
  { key: 'temperature', loinc: '8310-5', display: 'Body temperature', unit: 'Cel', ucum: 'Cel' },
  { key: 'spO2', loinc: '59408-5', display: 'Oxygen saturation in Arterial blood by Pulse oximetry', unit: '%', ucum: '%' },
];
// FHIR discharge-disposition codes where one matches exactly; otherwise text only.
const DISCHARGE_CODES: Record<string, { code: string; display: string }> = {
  DISCHARGED: { code: 'home', display: 'Home' },
  DIED: { code: 'exp', display: 'Expired' },
  LEFT_AGAINST_MEDICAL_ADVICE: { code: 'aadvice', display: 'Left against advice' },
  TRANSFERRED_OUT: { code: 'other-hcf', display: 'Other healthcare facility' },
};
const GENDER: Record<string, string> = { Male: 'male', Female: 'female', Other: 'other' };
const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : undefined);

/** FHIR R4 Bundle for one workflow visit, open or closed. Reading it is access-logged by the controller. */
export async function visitBundle(database: Database, staff: Staff, visitId: string) {
  if (!FHIR_ROLES.includes(staff.role))
    throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Clinical or administrator access required to export records.' });
  const v = (await database.pool.query(`SELECT v.*,o.vitals,o.recorded_at,vo.disposition,vo.recorded_at outcome_at,
      (SELECT max(d.timestamp) FROM decisions d WHERE d.visit_id=v.id) decided_at
    FROM visits v JOIN observations o ON o.visit_id=v.id AND o.version=v.observation_version
    LEFT JOIN visit_outcomes vo ON vo.visit_id=v.id WHERE v.id=$1 AND v.data_source='synthetic'`, [visitId])).rows[0];
  if (!v) throw new NotFoundException('Workflow visit not found.');

  const ref = () => `urn:uuid:${randomUUID()}`;
  const patientUrl = ref(), encounterUrl = ref();
  const subject = { reference: patientUrl }, encounter = { reference: encounterUrl };
  const effectiveDateTime = iso(v.recorded_at);
  const observation = (code: object, value: object, extra: object = {}) => ({
    fullUrl: ref(), resource: { resourceType: 'Observation', status: 'final', code, subject, encounter, effectiveDateTime, ...value, ...extra },
  });
  const vitalSigns = { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }] };

  const entries: object[] = [
    { fullUrl: patientUrl, resource: {
      resourceType: 'Patient',
      identifier: [{ system: `${AFYAFLOW}/identifier/visit`, value: v.id }],
      name: [{ text: v.name }],
      ...(GENDER[v.gender] ? { gender: GENDER[v.gender] } : {}),
    } },
    { fullUrl: encounterUrl, resource: {
      resourceType: 'Encounter',
      identifier: [{ system: `${AFYAFLOW}/identifier/visit`, value: v.id }],
      status: v.closed_at ? 'finished' : 'in-progress',
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'EMER', display: 'emergency' },
      subject,
      period: { start: iso(v.arrival_at), ...(v.closed_at ? { end: iso(v.closed_at) } : {}) },
      reasonCode: [{ text: v.complaint }],
      ...(v.assigned_department ? { location: [{ location: { display: v.assigned_department } }] } : {}),
      ...(v.disposition ? { hospitalization: { dischargeDisposition: {
        ...(DISCHARGE_CODES[v.disposition] ? { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/discharge-disposition', ...DISCHARGE_CODES[v.disposition] }] } : {}),
        text: DISPOSITIONS[v.disposition as keyof typeof DISPOSITIONS].label,
      } } } : {}),
    } },
  ];
  if (Number.isInteger(v.age))
    entries.push(observation({ coding: [{ system: LOINC, code: '30525-0', display: 'Age' }], text: 'Age' },
      { valueQuantity: { value: v.age, unit: 'a', system: UCUM, code: 'a' } }));
  for (const vital of VITALS) {
    const value = v.vitals?.[vital.key];
    if (typeof value === 'number')
      entries.push(observation({ coding: [{ system: LOINC, code: vital.loinc, display: vital.display }], text: vital.display },
        { valueQuantity: { value, unit: vital.unit, system: UCUM, code: vital.ucum } }, { category: [vitalSigns] }));
  }
  for (const [key, text] of [['avpu', 'Level of consciousness (AVPU)'], ['mobility', 'Mobility']] as const)
    if (v.vitals?.[key]) entries.push(observation({ text }, { valueCodeableConcept: { text: v.vitals[key] } }));
  // TEWS only where the protocol can score the patient; it is never invented.
  const score = calculateSatsScore(v.vitals || {});
  if (Number.isInteger(v.age) && v.age >= ADULT_CHART_MIN_AGE && score.isSufficientEvidence)
    entries.push(observation({ coding: [{ system: `${AFYAFLOW}/CodeSystem/sats`, code: 'tews' }], text: 'SATS Triage Early Warning Score (TEWS)' },
      { valueInteger: score.score }, { note: [{ text: `Protocol ${PROTOCOL_METADATA.version}; not clinically validated.` }] }));
  if (v.approved_priority) {
    const p = (TRIAGE_PRIORITY as Record<string, { level: number; category: string }>)[v.approved_priority];
    entries.push(observation({ coding: [{ system: `${AFYAFLOW}/CodeSystem/sats`, code: 'triage-level' }], text: 'SATS triage level (clinician approved)' },
      { valueCodeableConcept: { coding: [{ system: `${AFYAFLOW}/CodeSystem/sats-level`, code: v.approved_priority, display: `Level ${p.level} ${p.category}` }], text: `Level ${p.level} ${p.category}` } },
      { effectiveDateTime: iso(v.decided_at) ?? effectiveDateTime }));
  }
  return {
    resourceType: 'Bundle', type: 'collection', timestamp: new Date().toISOString(),
    meta: { tag: [{ system: `${AFYAFLOW}/tags`, code: 'synthetic', display: 'Synthetic workflow record' }] },
    entry: entries,
  };
}

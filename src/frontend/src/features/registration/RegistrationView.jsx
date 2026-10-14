import React from 'react';
import { useBackend } from '../../api/client.js';
import useRegistration from './useRegistration';
import { Card, Button, Input, Badge, Alert } from '../../components';

/**
 * Patient Registration & Observation Capture View
 * 
 * Fulfills FE-PATIENT-REGISTRATION-01 through 03:
 * - Explicit missing-information validation without guessing.
 * - Timestamped observation entry with units and schema field errors.
 * - Retry-safe submission and explicit draft/pending/confirmed status.
 */
export default function RegistrationView({ currentStaff }) {
  const {
    formData,
    validationErrors,
    missingObservations,
    submissionStatus,
    submittedRecord,
    errorMessage,
    handleChange,
    validate,
    submitRegistration,
    resetForm,
    units,
  } = useRegistration(currentStaff);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await submitRegistration();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Status Alerts */}
      {submissionStatus === 'pending' && <Alert variant="warning" title="Offline Draft Saved">
        This intake is pending reconnect sync and is not yet in the demo queue.
        <Button variant="outline" onClick={resetForm}>Register Next Patient</Button>
      </Alert>}
      {submissionStatus === 'confirmed' && submittedRecord && (
        <Alert
          variant="success"
          title={useBackend?"Patient Registration Confirmed by Server":"Patient Registration Saved in Demo"}
          onClose={resetForm}
        >
          <div>
            Patient <strong>{submittedRecord.name}</strong> ({submittedRecord.age}y,{' '}
            {submittedRecord.gender}) successfully registered with ID{' '}
            <code>{submittedRecord.id}</code>.
          </div>
          <div style={{ fontSize: '0.8rem', marginTop: '0.25rem', color: 'var(--color-success-dark)' }}>
            Status: Queued for clinical triage assessment • {useBackend?"Server timestamp:":"Local demo timestamp:"}{' '}
            {new Date(submittedRecord.serverConfirmedAt).toLocaleTimeString()}
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <Button variant="outline" size="sm" onClick={resetForm}>
              Register Next Patient
            </Button>
          </div>
        </Alert>
      )}

      {submissionStatus === 'duplicate' && submittedRecord && (
        <Alert
          variant="info"
          title="Idempotent Submission Detected"
          onClose={resetForm}
        >
          <div>
            Repeat submission received: Patient record <code>{submittedRecord.id}</code> was already confirmed. No duplicate created.
          </div>
        </Alert>
      )}

      {errorMessage && (
        <Alert variant="danger" title="Validation Failed">
          {errorMessage}
        </Alert>
      )}

      {/* Missing Observations Warning (Strict: Missing measurements are never guessed) */}
      {missingObservations.length > 0 && (
        <Alert variant="warning" title="Missing Clinical Observations Detected">
          <div style={{ fontSize: '0.85rem' }}>
            The following measurements have not been recorded:{' '}
            <strong>{missingObservations.join(', ')}</strong>.
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '4px', color: 'var(--color-warning-dark)' }}>
            * Note: Protocol triage will flag incomplete observations for staff review rather than estimating values.
          </div>
        </Alert>
      )}

      <form noValidate onSubmit={handleSubmit}>
        {/* Section 1: Demographics */}
        <Card
          title="Patient Registration & Visit Intake"
          subtitle="Capture synthetic patient demographic information"
          actions={<Badge variant="draft">Draft Auto-Saved</Badge>}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <Input
              id="patient-name"
              label="Patient Full Name"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g. Amani Odhiambo"
              required
              error={validationErrors.name}
              hint="Minimum 2 characters"
            />

            <Input
              id="patient-age"
              label="Age (Years)"
              type="number"
              value={formData.age}
              onChange={(e) => handleChange('age', e.target.value)}
              placeholder="e.g. 34"
              required
              error={validationErrors.age}
              hint="Range: 0 - 130 years"
            />

            <div className="form-group">
              <label htmlFor="patient-gender" className="form-label">
                Gender <span style={{ color: 'var(--color-danger)' }}>*</span>
              </label>
              <select
                id="patient-gender"
                value={formData.gender}
                onChange={(e) => handleChange('gender', e.target.value)}
                className="form-select"
              >
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '0.5rem' }}>
            <label htmlFor="patient-complaint" className="form-label">
              Presenting Complaint / Symptoms <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <textarea
              id="patient-complaint"
              rows={2}
              value={formData.presentingComplaint}
              onChange={(e) => handleChange('presentingComplaint', e.target.value)}
              placeholder="e.g. Difficulty breathing, acute chest tightness, fever for 2 days"
              className="form-textarea"
              style={{ borderColor: validationErrors.presentingComplaint ? 'var(--color-danger)' : undefined }}
              aria-invalid={Boolean(validationErrors.presentingComplaint)}
            />
            {validationErrors.presentingComplaint && (
              <div className="form-error">{validationErrors.presentingComplaint}</div>
            )}
          </div>
        </Card>

        {/* Section 2: Timestamped Observations with strict units */}
        <Card
          title="Clinical Observations (Vitals)"
          subtitle="Record timestamped measurements with standardized clinical units"
          actions={
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
              Attributed to: {currentStaff?.name || 'Triage Staff'}
            </span>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            <Input
              id="obs-systolic"
              label={`Systolic BP (${units.bloodPressure})`}
              type="number"
              placeholder="e.g. 120"
              value={formData.systolicBp}
              onChange={(e) => handleChange('systolicBp', e.target.value)}
              error={validationErrors.systolicBp}
            />

            <Input
              id="obs-diastolic"
              label={`Diastolic BP (${units.bloodPressure})`}
              type="number"
              placeholder="e.g. 80"
              value={formData.diastolicBp}
              onChange={(e) => handleChange('diastolicBp', e.target.value)}
              error={validationErrors.diastolicBp}
            />

            <Input
              id="obs-hr"
              label={`Heart Rate (${units.heartRate})`}
              type="number"
              placeholder="e.g. 78"
              value={formData.heartRate}
              onChange={(e) => handleChange('heartRate', e.target.value)}
              error={validationErrors.heartRate}
            />

            <Input
              id="obs-rr"
              label={`Respiratory Rate (${units.respiratoryRate})`}
              type="number"
              placeholder="e.g. 18"
              value={formData.respiratoryRate}
              onChange={(e) => handleChange('respiratoryRate', e.target.value)}
              error={validationErrors.respiratoryRate}
            />

            <Input
              id="obs-temp"
              label={`Temperature (${units.temperature})`}
              type="number"
              step="0.1"
              placeholder="e.g. 36.8"
              value={formData.temperature}
              onChange={(e) => handleChange('temperature', e.target.value)}
              error={validationErrors.temperature}
            />

            <Input
              id="obs-spo2"
              label={`Oxygen Saturation (${units.spO2})`}
              type="number"
              placeholder="e.g. 98"
              value={formData.spO2}
              onChange={(e) => handleChange('spO2', e.target.value)}
              error={validationErrors.spO2}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group">
              <label htmlFor="obs-avpu" className="form-label">
                Consciousness (AVPU Scale)
              </label>
              <select
                id="obs-avpu"
                value={formData.avpu}
                onChange={(e) => handleChange('avpu', e.target.value)}
                className="form-select"
              >
                <option value="">Not Recorded</option>
                <option value="Alert">Alert (A)</option>
                <option value="Voice">Responsive to Voice (V)</option>
                <option value="Pain">Responsive to Pain (P)</option>
                <option value="Unresponsive">Unresponsive (U)</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="obs-mobility" className="form-label">
                Mobility Status
              </label>
              <select
                id="obs-mobility"
                value={formData.mobility}
                onChange={(e) => handleChange('mobility', e.target.value)}
                className="form-select"
              >
                <option value="">Not Recorded</option>
                <option value="Walking normally">Walking normally</option>
                <option value="Needs assistance to walk">Needs assistance to walk</option>
                <option value="Immobile / Stretcher">Immobile / Stretcher</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <Button
              type="button"
              variant="outline"
              onClick={validate}
            >
              Validate Measurements
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submissionStatus === 'submitting'}
              disabled={submissionStatus === 'submitting'}
            >
              Confirm & Register Visit
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}

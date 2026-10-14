import React, { useState, useEffect } from 'react';
import useAuth from './useAuth';
import { Card, Button, Input, Badge, Alert } from '../../components';

/**
 * Registration & Draft Retention Demonstration Panel
 * 
 * Demonstrates:
 * "Locking or session expiry hides patient content and follows the reviewed draft-retention policy."
 */
export default function RegistrationDraftPanel() {
  const {
    staff,
    localDraft,
    hasDraft,
    saveDraft,
    clearDraft,
    lockSession,
  } = useAuth();

  const [patientName, setPatientName] = useState(localDraft?.patientName || '');
  const [patientAge, setPatientAge] = useState(localDraft?.patientAge || '');
  const [complaint, setComplaint] = useState(localDraft?.complaint || '');
  const [triageNotes, setTriageNotes] = useState(localDraft?.triageNotes || '');
  const [notification, setNotification] = useState('');

  // Sync draft from context if changed
  useEffect(() => {
    if (localDraft) {
      setPatientName(localDraft.patientName || '');
      setPatientAge(localDraft.patientAge || '');
      setComplaint(localDraft.complaint || '');
      setTriageNotes(localDraft.triageNotes || '');
    }
  }, [localDraft]);

  const handleInputChange = (field, value) => {
    let updated;
    if (field === 'name') {
      setPatientName(value);
      updated = { patientName: value, patientAge, complaint, triageNotes };
    } else if (field === 'age') {
      setPatientAge(value);
      updated = { patientName, patientAge: value, complaint, triageNotes };
    } else if (field === 'complaint') {
      setComplaint(value);
      updated = { patientName, patientAge, complaint: value, triageNotes };
    } else if (field === 'notes') {
      setTriageNotes(value);
      updated = { patientName, patientAge, complaint, triageNotes: value };
    }
    saveDraft(updated);
  };

  const handleClear = () => {
    clearDraft();
    setPatientName('');
    setPatientAge('');
    setComplaint('');
    setTriageNotes('');
    setNotification('Draft cleared successfully.');
    setTimeout(() => setNotification(''), 3000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {notification && (
        <Alert variant="info" onClose={() => setNotification('')}>
          {notification}
        </Alert>
      )}

      {hasDraft && (
        <div
          style={{
            backgroundColor: 'var(--color-warning-light)',
            border: '1px solid rgba(217, 119, 6, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, color: 'var(--color-warning-dark)', fontSize: '0.9rem' }}>
              📝 Local Draft Saved ({new Date(localDraft.savedAt).toLocaleTimeString()})
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-warning-dark)' }}>
              Protected under AfyaFlow shared-device retention policy.
            </div>
          </div>
          <Badge variant="draft">Locally Retained</Badge>
        </div>
      )}

      <Card
        title="Patient Intake & Vitals Capture"
        subtitle="Test typing patient information and locking the terminal to verify zero data loss"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={lockSession}
            title="Lock terminal to test draft retention"
          >
            🔒 Lock Terminal (Test Draft Retention)
          </Button>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
          <Input
            id="draft-patient-name"
            label="Synthetic Patient Full Name"
            placeholder="e.g. Amani Odhiambo"
            value={patientName}
            onChange={(e) => handleInputChange('name', e.target.value)}
          />
          <Input
            id="draft-patient-age"
            label="Age (Years)"
            type="number"
            placeholder="e.g. 28"
            value={patientAge}
            onChange={(e) => handleInputChange('age', e.target.value)}
          />
        </div>

        <Input
          id="draft-complaint"
          label="Presenting Complaint"
          placeholder="e.g. High fever, chills, persistent coughing for 3 days"
          value={complaint}
          onChange={(e) => handleInputChange('complaint', e.target.value)}
        />

        <div className="form-group">
          <label htmlFor="draft-notes" className="form-label">
            Preliminary Clinical / Intake Notes
          </label>
          <textarea
            id="draft-notes"
            rows={3}
            className="form-textarea"
            placeholder="Observations or notes recorded at intake desk..."
            value={triageNotes}
            onChange={(e) => handleInputChange('notes', e.target.value)}
          />
          <div className="form-hint">
            Draft updates automatically save to local storage and survive terminal locking.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClear}
            disabled={!hasDraft && !patientName && !complaint}
          >
            Discard Draft
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setNotification('Patient record submitted to triage queue (Synthetic confirmation).');
              clearDraft();
            }}
            disabled={!patientName.trim()}
          >
            Confirm & Queue Patient
          </Button>
        </div>
      </Card>
    </div>
  );
}

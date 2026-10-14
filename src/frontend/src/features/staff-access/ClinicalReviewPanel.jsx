import React, { useState } from 'react';
import useAuth from './useAuth';
import { Card, Button, Badge, Alert } from '../../components';
import { PERMISSIONS } from '../../../../shared/contracts/auth.js';
import PermissionGate from './PermissionGate';

/**
 * Interactive Clinical Review & Triage Approval Panel
 * 
 * Demonstrates:
 * 1. Clinical staff (Nurse / Doctor) can approve proposals with server acknowledgement.
 * 2. Unauthorised roles (Clerk / Admin) are blocked from clinical controls, and
 *    server-side permission denials (HTTP 403) are visibly rendered.
 * 
 * Fulfills FE-APP-SHELL-AND-STAFF-ACCESS-03 acceptance criteria:
 * "Unauthorised roles cannot use clinical controls; backend denial is shown clearly."
 */
export default function ClinicalReviewPanel() {
  const {
    staff,
    isClinical,
    performClinicalAction,
    lastPermissionError,
    clearPermissionError,
  } = useAuth();

  const [decisionSuccess, setDecisionSuccess] = useState(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  // Synthetic patient case pending clinical triage decision
  const patientCase = {
    id: 'SYN-PT-8821',
    name: 'Kofi Mwangi',
    age: 34,
    gender: 'Male',
    arrivalTime: '14 minutes ago',
    presentingComplaint: 'Acute chest tightness, fever, difficulty breathing',
    vitals: {
      bloodPressure: '142/88 mmHg',
      heartRate: '108 bpm (Tachycardia)',
      respiratoryRate: '24 /min (Tachypnoea)',
      temperature: '38.6 °C (Pyrexia)',
      spO2: '94% on room air',
    },
    aiProposal: {
      priority: 'Very Urgent (Orange)',
      protocol: 'South African Triage Scale (SATS v2026.1)',
      ruleTriggered: 'Score 5-6 (Physiological Discriminator: High RR + Tachycardia)',
      confidence: 'Deterministic protocol match',
    },
  };

  const handleAction = async (decision) => {
    setLoadingAction(true);
    setDecisionSuccess(null);
    clearPermissionError();

    try {
      const result = await performClinicalAction(PERMISSIONS.CLINICAL_APPROVAL, {
        patientId: patientCase.id,
        decision,
        reason:
          decision === 'OVERRIDDEN'
            ? overrideReason || 'Clinical override based on chest tightness presentation.'
            : 'Confirmed vital signs align with SATS Orange triage discriminator.',
      });

      if (result.success) {
        setDecisionSuccess(result.data);
      }
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Backend Denial Alert Banner */}
      {lastPermissionError && (
        <Alert
          variant="danger"
          title={`Server Permission Error (${lastPermissionError.status} ${lastPermissionError.code})`}
          onClose={clearPermissionError}
        >
          <div>{lastPermissionError.message}</div>
          <div style={{ fontSize: '0.8rem', marginTop: '0.35rem', opacity: 0.9 }}>
            Attempted action: <code>{lastPermissionError.details.action}</code> • User Role:{' '}
            <code>{lastPermissionError.details.userRole}</code> • Timestamp:{' '}
            {new Date(lastPermissionError.details.timestamp).toLocaleTimeString()}
          </div>
        </Alert>
      )}

      {/* Decision Success Banner */}
      {decisionSuccess && (
        <Alert
          variant="success"
          title="Clinical Decision Server-Acknowledged"
          onClose={() => setDecisionSuccess(null)}
        >
          <div>
            Decision <strong>{decisionSuccess.decision}</strong> for patient{' '}
            <strong>{decisionSuccess.patientId}</strong> was committed to the hospital queue.
          </div>
          <div style={{ fontSize: '0.8rem', marginTop: '0.25rem', color: 'var(--color-success-dark)' }}>
            Signed by: {decisionSuccess.clinicianName} ({decisionSuccess.clinicianRole}) • ID:{' '}
            {decisionSuccess.approvalId}
          </div>
        </Alert>
      )}

      <Card
        title="Patient Triage Review & Clinical Decision"
        subtitle="Review AI agent recommendation against recorded vital observations"
        actions={
          <Badge variant={isClinical ? 'clinical' : 'locked'}>
            {isClinical ? 'Clinical Authority Active' : 'Restricted (Non-Clinical)'}
          </Badge>
        }
      >
        {/* Patient header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            paddingBottom: '1rem',
            borderBottom: '1px solid var(--color-border-subtle)',
            marginBottom: '1rem',
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
              {patientCase.name} ({patientCase.age}y, {patientCase.gender})
            </h3>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Hospital ID: <code>{patientCase.id}</code> • Arrived {patientCase.arrivalTime}
            </div>
            <p style={{ marginTop: '0.35rem', fontSize: '0.9rem' }}>
              <strong>Chief Complaint:</strong> {patientCase.presentingComplaint}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Badge variant="clinical" style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}>
              {patientCase.aiProposal.priority}
            </Badge>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)', marginTop: '4px' }}>
              Proposed Priority
            </div>
          </div>
        </div>

        {/* Vital Signs Grid */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
            Recorded Vital Signs (Timestamped)
          </h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '0.75rem',
            }}
          >
            <div style={{ padding: '0.65rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>Blood Pressure</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{patientCase.vitals.bloodPressure}</div>
            </div>
            <div style={{ padding: '0.65rem', backgroundColor: '#fee2e2', borderRadius: 'var(--radius-sm)', border: '1px solid #fca5a5' }}>
              <div style={{ fontSize: '0.75rem', color: '#991b1b' }}>Heart Rate</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#991b1b' }}>{patientCase.vitals.heartRate}</div>
            </div>
            <div style={{ padding: '0.65rem', backgroundColor: '#fee2e2', borderRadius: 'var(--radius-sm)', border: '1px solid #fca5a5' }}>
              <div style={{ fontSize: '0.75rem', color: '#991b1b' }}>Resp. Rate</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#991b1b' }}>{patientCase.vitals.respiratoryRate}</div>
            </div>
            <div style={{ padding: '0.65rem', backgroundColor: '#fee2e2', borderRadius: 'var(--radius-sm)', border: '1px solid #fca5a5' }}>
              <div style={{ fontSize: '0.75rem', color: '#991b1b' }}>Temperature</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#991b1b' }}>{patientCase.vitals.temperature}</div>
            </div>
            <div style={{ padding: '0.65rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>Oxygen Saturation</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{patientCase.vitals.spO2}</div>
            </div>
          </div>
        </div>

        {/* Evidence & Protocol Explanation */}
        <div
          style={{
            backgroundColor: 'var(--color-primary-light)',
            border: '1px solid rgba(2, 132, 199, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-primary-dark)' }}>
            AI Agent Evidence & Protocol Reference
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text)', marginTop: '0.25rem' }}>
            <strong>Protocol:</strong> {patientCase.aiProposal.protocol}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text)', marginTop: '0.25rem' }}>
            <strong>Discriminator Rule:</strong> {patientCase.aiProposal.ruleTriggered}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.35rem' }}>
            * AI recommendation requires mandatory human clinician approval before patient queue is updated.
          </div>
        </div>

        {/* Role Permission Banner if Non-Clinical */}
        <PermissionGate
          permission={PERMISSIONS.CLINICAL_APPROVAL}
          showNotice={true}
          noticeTitle="Clinical Approval Locked for Current Role"
        >
          <div style={{ fontSize: '0.85rem', color: 'var(--color-clinical)', marginBottom: '0.75rem' }}>
            ✓ Verified as <strong>{staff?.name}</strong> ({staff?.title}) with clinical decision privileges.
          </div>
        </PermissionGate>

        {/* Clinical Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <Button
            variant="primary"
            loading={loadingAction}
            onClick={() => handleAction('APPROVED')}
            disabled={loadingAction}
            aria-label="Approve AI Triage Recommendation"
          >
            ✓ Approve Priority (Very Urgent)
          </Button>

          <Button
            variant="outline"
            disabled={loadingAction}
            onClick={() => handleAction('REJECTED')}
            aria-label="Reject AI Triage Proposal"
          >
            ✕ Reject Proposal
          </Button>

          <Button
            variant="secondary"
            disabled={loadingAction}
            onClick={() => handleAction('OVERRIDDEN')}
            aria-label="Override AI Priority"
          >
            ⚠️ Clinical Override
          </Button>

          {!isClinical && (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)', fontWeight: 600 }}>
              * Attempting to click controls as "{staff?.role}" triggers server-side 403 denial.
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}

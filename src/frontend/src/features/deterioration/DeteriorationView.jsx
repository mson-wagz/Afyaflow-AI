import React from 'react';
import useDeterioration from './useDeterioration';
import { Card, Button, Badge, Alert, Modal } from '../../components';

/**
 * Deterioration Monitoring & Reassessment Review View
 * 
 * Fulfills FE-DETERIORATION-MONITORING-01 through 03:
 * - Reassessment inbox and before/after observation evidence.
 * - Clinical review controls and rejection/escalation reasons.
 * - Last observation age, missing evidence and no false continuous coverage.
 */
export default function DeteriorationView({ currentStaff, isClinical = false }) {
  const {
    cases,
    activeCase,
    selectedCaseId,
    setSelectedCaseId,
    loading,
    actionInProgress,
    actionSuccess,
    actionError,
    dismissModalOpen,
    setDismissModalOpen,
    dismissReason,
    setDismissReason,
    handleEscalate,
    handleDismiss,
    clearMessages,
  } = useDeterioration(currentStaff);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Explicit No False Coverage Notice (WATCH-03) */}
      <Alert
        variant="info"
        title="Nursing Observation-Driven Surveillance Notice"
      >
        <div>
          This system compares newly recorded nursing observations against baseline measurements.
          It does not provide continuous telemetry or vital sign sensing. Patients without recent vitals require scheduled nursing rounds.
        </div>
      </Alert>

      {/* Success Notification */}
      {actionSuccess && (
        <Alert
          variant="success"
          title="Reassessment Decision Committed"
          onClose={clearMessages}
        >
          <div>
            Action <strong>{actionSuccess.action}</strong> for patient{' '}
            <strong>{actionSuccess.patientName}</strong> ({actionSuccess.patientId}) was acknowledged.
          </div>
          <div style={{ fontSize: '0.8rem', marginTop: '4px', color: 'var(--color-success-dark)' }}>
            Signed by: {actionSuccess.clinicianName} • Time: {new Date(actionSuccess.timestamp).toLocaleTimeString()}
          </div>
        </Alert>
      )}

      {actionError && (
        <Alert variant="danger" title="Review Error" onClose={clearMessages}>
          {actionError}
        </Alert>
      )}

      {/* Patient Case Selector */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
          Surveillance Inbox:
        </span>
        {cases.map((c) => (
          <button
            key={c.patientId}
            type="button"
            className={`btn btn-sm ${selectedCaseId === c.patientId ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => {
              setSelectedCaseId(c.patientId);
              clearMessages();
            }}
          >
            {c.patientName.split(' ')[0]} ({c.patientId})
            {c.comparison?.hasDeteriorated && <span style={{ marginLeft: '4px' }}>⚠️</span>}
          </button>
        ))}
      </div>

      {activeCase ? (
        <Card
          title={`Clinical Deterioration Review: ${activeCase.patientName}`}
          subtitle={`Department: ${activeCase.assignedDepartment} • Current Approved Priority: ${activeCase.currentApprovedPriority?.label || 'None'}`}
          actions={
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Badge variant={activeCase.ageInfo.isStale ? 'warning' : 'online'}>
                {activeCase.ageInfo.warningText} ({activeCase.ageInfo.ageFormatted})
              </Badge>
              {activeCase.comparison?.hasDeteriorated && (
                <Badge variant="danger">⚠️ Deterioration Detected</Badge>
              )}
            </div>
          }
        >
          {/* Active Alert Summary */}
          {activeCase.comparison?.hasDeteriorated ? (
            <div
              style={{
                backgroundColor: 'rgba(220, 38, 38, 0.08)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: '0.85rem',
                marginBottom: '1.25rem',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--color-danger-dark)', fontSize: '0.925rem' }}>
                🚨 Physiological Deterioration Triggers Identified ({activeCase.comparison.ruleVersion})
              </div>
              <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem', fontSize: '0.85rem', color: '#991b1b' }}>
                {activeCase.comparison.triggers.map((trig, idx) => (
                  <li key={idx} style={{ marginBottom: '2px' }}>
                    <strong>{trig}</strong>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                * Software does not adjust priority automatically. A clinician must confirm reassessment.
              </div>
            </div>
          ) : (
            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '0.85rem',
                marginBottom: '1.25rem',
                fontSize: '0.85rem',
                color: 'var(--color-text-muted)',
              }}
            >
              {activeCase.latestObservation ? (
                <span>✓ Observations stable. No acute physiological deterioration detected.</span>
              ) : (
                <span>
                  ⚠️ No repeat observations recorded since admission ({activeCase.ageInfo.ageFormatted}).
                  Schedule a nurse to record updated vitals.
                </span>
              )}
            </div>
          )}

          {/* Side-by-Side Before / After Observation Table (FE-DETERIORATION-MONITORING-01) */}
          {activeCase.latestObservation ? (
            <div style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                Observation Interval Comparison Evidence
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                      <th style={{ padding: '0.5rem' }}>Measurement Parameter</th>
                      <th style={{ padding: '0.5rem' }}>Baseline (Obs #1: {new Date(activeCase.baselineObservation.recordedAt).toLocaleTimeString()})</th>
                      <th style={{ padding: '0.5rem' }}>Latest (Obs #2: {new Date(activeCase.latestObservation.recordedAt).toLocaleTimeString()})</th>
                      <th style={{ padding: '0.5rem' }}>Observed Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCase.comparison?.deltas &&
                      Object.entries(activeCase.comparison.deltas).map(([param, data]) => {
                        const isAltered = data.diff.includes('+') || data.diff.includes('-');
                        return (
                          <tr
                            key={param}
                            style={{
                              borderBottom: '1px solid var(--color-border-subtle)',
                              backgroundColor: isAltered ? 'rgba(220, 38, 38, 0.04)' : 'transparent',
                            }}
                          >
                            <td style={{ padding: '0.5rem', fontWeight: 600, textTransform: 'capitalize' }}>
                              {param.replace(/([A-Z])/g, ' $1')}
                            </td>
                            <td style={{ padding: '0.5rem', color: 'var(--color-text-muted)' }}>
                              {data.before}
                            </td>
                            <td style={{ padding: '0.5rem', fontWeight: 700 }}>
                              {data.after}
                            </td>
                            <td style={{ padding: '0.5rem', fontWeight: 700, color: isAltered ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                              {data.diff}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <Button
              variant="danger"
              loading={actionInProgress}
              disabled={actionInProgress || !isClinical || !activeCase.comparison?.hasDeteriorated}
              onClick={handleEscalate}
            >
              🚨 Reassess & Escalate to Resuscitation (Red)
            </Button>

            <Button
              variant="outline"
              disabled={actionInProgress || !isClinical}
              onClick={() => {
                setDismissReason('');
                setDismissModalOpen(true);
              }}
            >
              Dismiss Deterioration Alert
            </Button>

            {!isClinical && (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)', fontWeight: 600 }}>
                * Clinical authorization required to commit reassessment decisions.
              </span>
            )}
          </div>
        </Card>
      ) : null}

      {/* Dismiss Modal */}
      <Modal
        isOpen={dismissModalOpen}
        onClose={() => setDismissModalOpen(false)}
        title="Dismiss Deterioration Alert"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDismissModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!dismissReason.trim() || actionInProgress}
              onClick={handleDismiss}
            >
              Confirm Dismissal
            </Button>
          </>
        }
      >
        <div className="form-group">
          <label htmlFor="dismiss-reason-input" className="form-label">
            Clinical Justification for Dismissal <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <textarea
            id="dismiss-reason-input"
            rows={3}
            className="form-textarea"
            placeholder="Explain why this physiological change does not warrant priority escalation (e.g. transient tachycardia during blood draw)..."
            value={dismissReason}
            onChange={(e) => setDismissReason(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}

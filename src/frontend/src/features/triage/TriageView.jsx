import React from 'react';
import useTriage from './useTriage';
import { Card, Button, Badge, Alert, Modal, Input } from '../../components';
import { TRIAGE_PRIORITY } from '../../../../shared/contracts/triage.js';

/**
 * Triage & Clinical Decision Review View
 * 
 * Fulfills FE-PATIENT-PRIORITISATION-01 through 04:
 * - Evidence, protocol/rule references and observation versions.
 * - Approve, reject and override controls with decision reasons.
 * - Missing evidence, stale proposals, and tool failure handling.
 * - Authorised visit decision/audit history view with clinician identity and tool traces.
 */
export default function TriageView({ currentStaff, isClinical = false }) {
  const {
    proposals,
    activeCase,
    selectedPatientId,
    setSelectedPatientId,
    decisionHistory,
    loading,
    actionInProgress,
    actionSuccess,
    actionError,
    activeTrace,
    setActiveTrace,
    overrideModalOpen,
    setOverrideModalOpen,
    rejectModalOpen,
    setRejectModalOpen,
    reasonInput,
    setReasonInput,
    targetOverridePriority,
    setTargetOverridePriority,
    handleApprove,
    handleReject,
    handleOverride,
    clearMessages,
  } = useTriage(currentStaff);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Success Banner */}
      {actionSuccess && (
        <Alert
          variant="success"
          title="Clinical Decision Saved in Demo"
          onClose={clearMessages}
        >
          <div>
            Decision <strong>{actionSuccess.decision}</strong> for patient{' '}
            <strong>{actionSuccess.patientName}</strong> ({actionSuccess.patientId}) was committed.
          </div>
          <div style={{ fontSize: '0.8rem', marginTop: '0.25rem', color: 'var(--color-success-dark)' }}>
            Signed by: {actionSuccess.clinicianName} ({actionSuccess.clinicianRole}) • Time:{' '}
            {new Date(actionSuccess.timestamp).toLocaleTimeString()} • Audit ID: {actionSuccess.decisionId}
          </div>
        </Alert>
      )}

      {/* Permission or Input Error */}
      {actionError && (
        <Alert
          variant="danger"
          title={`Clinical Decision Error (${actionError.code || 'ERROR'})`}
          onClose={clearMessages}
        >
          <div>{actionError.message}</div>
        </Alert>
      )}

      {/* Case Selector Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
          Select Patient Proposal:
        </span>
        {proposals.map((p) => (
          <button
            key={p.patientId}
            type="button"
            className={`btn btn-sm ${selectedPatientId === p.patientId ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => {
              setSelectedPatientId(p.patientId);
              clearMessages();
            }}
          >
            {p.patientName.split(' ')[0]} ({p.patientId})
          </button>
        ))}
      </div>

      {activeCase ? (
        <Card
          title="SATS Priority Recommendation"
          subtitle={`Input Version: v${activeCase.observationVersion} • Arrived: ${new Date(activeCase.arrivalTime).toLocaleTimeString()}`}
          actions={
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTrace(activeCase.toolTrace)}
                aria-label="Inspect simulated tool trace"
              >
                🔍 Inspect Tool Trace
              </Button>
              <Badge variant={isClinical ? 'clinical' : 'locked'}>
                {isClinical ? 'Clinician Decision Authority' : 'Restricted (Non-Clinical)'}
              </Badge>
            </div>
          }
        >
          {/* Patient Overview */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              borderBottom: '1px solid var(--color-border-subtle)',
              paddingBottom: '1rem',
              marginBottom: '1rem',
            }}
          >
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {activeCase.patientName} ({activeCase.age}y, {activeCase.gender})
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--color-text)', marginTop: '4px' }}>
                <strong>Chief Complaint:</strong> {activeCase.presentingComplaint}
              </p>
            </div>

            {/* Proposed Priority Badge */}
            {activeCase.proposal?.priority ? (
              <div style={{ textAlign: 'right' }}>
                <span
                  style={{
                    backgroundColor: activeCase.proposal.priority.bgColor,
                    color: activeCase.proposal.priority.color,
                    border: `1px solid ${activeCase.proposal.priority.color}`,
                    padding: '0.35rem 0.85rem',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    display: 'inline-block',
                  }}
                >
                  ● {activeCase.proposal.priority.label} ({activeCase.proposal.priority.code})
                </span>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)', marginTop: '4px' }}>
                  Target: within {activeCase.proposal.priority.targetMinutes} mins
                </div>
              </div>
            ) : (
              <Badge variant="danger">Review Required</Badge>
            )}
          </div>

          {/* Missing Evidence Handling (TRIAGE-02) */}
          {!activeCase.proposal?.isSufficientEvidence && (
            <Alert
              variant="warning"
              title="Missing Core Evidence — Automated Urgency Suppressed"
            >
              <div>
                The following vital observations are absent:{' '}
                <strong>{activeCase.proposal?.missingEvidence?.join(', ')}</strong>.
              </div>
              <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                Protocol rule engine will NOT invent measurements or fabricate a priority score.
                A nurse must record missing vitals or perform a manual clinical override.
              </div>
            </Alert>
          )}

          {/* Recorded Vitals Table */}
          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
              Recorded Patient Observations & Citations
            </h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '0.5rem',
              }}
            >
              {Object.entries(activeCase.observations)
                .filter(([key]) => key !== 'recordedAt')
                .map(([key, val]) => (
                  <div
                    key={key}
                    style={{
                      padding: '0.6rem',
                      backgroundColor: val ? '#f8fafc' : '#fef2f2',
                      border: `1px solid ${val ? 'var(--color-border)' : '#fca5a5'}`,
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', textTransform: 'capitalize' }}>
                      {key.replace(/([A-Z])/g, ' $1')}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: val ? 'var(--color-text)' : 'var(--color-danger)' }}>
                      {val || 'Not Recorded'}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Evidence Citations & Protocol Version (TRIAGE-01) */}
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
              Protocol Rule Citation
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: '2px' }}>
              <strong>Protocol:</strong> {activeCase.protocol.name} (Version {activeCase.protocol.version})
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: '2px' }}>
              <strong>Rule Triggered:</strong> {activeCase.proposal?.ruleTriggered}
            </div>
            {activeCase.proposal?.score !== null && (
              <div style={{ fontSize: '0.85rem', marginTop: '2px' }}>
                <strong>Calculated TEWS Score:</strong> {activeCase.proposal.score} points
              </div>
            )}
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              * Proposals do not alter hospital queues until an authorised clinician records a decision in this local demo.
            </div>
          </div>

          {/* Action Buttons (Approve, Reject, Override) with duplicate click protection */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <Button
              variant="primary"
              loading={actionInProgress}
              disabled={actionInProgress || !activeCase.proposal?.isSufficientEvidence}
              onClick={handleApprove}
            >
              ✓ Approve Proposed Priority
            </Button>

            <Button
              variant="secondary"
              disabled={actionInProgress}
              onClick={() => {
                setReasonInput('');
                setOverrideModalOpen(true);
              }}
            >
              ⚠️ Clinical Override Priority
            </Button>

            <Button
              variant="outline"
              disabled={actionInProgress}
              onClick={() => {
                setReasonInput('');
                setRejectModalOpen(true);
              }}
            >
              ✕ Reject Proposal
            </Button>
          </div>
        </Card>
      ) : (
        <Alert variant="info">No active proposals pending review.</Alert>
      )}

      {/* Decision & Audit History View (FE-PATIENT-PRIORITISATION-04) */}
      <Card
        title="Authorised Clinical Decision & Audit History"
        subtitle="Chronological audit records linking clinician identity, timestamps, reasons, and evidence traces"
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                <th style={{ padding: '0.65rem 0.5rem' }}>Timestamp</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Patient</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Decision</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Approved Priority</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Clinician Attribution</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Decision Reason</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Audit / Trace ID</th>
              </tr>
            </thead>
            <tbody>
              {decisionHistory.map((dec) => (
                <tr key={dec.decisionId} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '0.65rem 0.5rem', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {new Date(dec.timestamp).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: '0.65rem 0.5rem', fontWeight: 600 }}>
                    {dec.patientName} ({dec.patientId})
                  </td>
                  <td style={{ padding: '0.65rem 0.5rem' }}>
                    <Badge variant={dec.decision === 'APPROVED' ? 'online' : dec.decision === 'OVERRIDDEN' ? 'warning' : 'danger'}>
                      {dec.decision}
                    </Badge>
                  </td>
                  <td style={{ padding: '0.65rem 0.5rem' }}>
                    {dec.priority ? (
                      <span style={{ fontWeight: 700, color: dec.priority.color }}>
                        ● {dec.priority.label}
                      </span>
                    ) : 'N/A'}
                  </td>
                  <td style={{ padding: '0.65rem 0.5rem' }}>
                    <strong>{dec.clinicianName}</strong> ({dec.clinicianRole})
                  </td>
                  <td style={{ padding: '0.65rem 0.5rem', maxWidth: '240px' }}>
                    {dec.reason}
                  </td>
                  <td style={{ padding: '0.65rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                    {dec.decisionId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Tool Trace Inspector Modal */}
      {activeTrace && (
        <Modal
          isOpen={Boolean(activeTrace)}
          onClose={() => setActiveTrace(null)}
          title={`Simulated MCP Tool Trace Inspector: ${activeTrace.runId}`}
          maxWidth="640px"
          footer={
            <Button variant="secondary" onClick={() => setActiveTrace(null)}>
              Close Inspector
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
            <div>
              <strong>Simulated model:</strong> <code>{activeTrace.model}</code>
            </div>
            <div>
              <strong>Timestamp:</strong> {new Date(activeTrace.timestamp).toLocaleString()}
            </div>

            <div>
              <h4 style={{ fontWeight: 700, marginBottom: '0.5rem' }}>
                Simulated Tool Pipeline ({activeTrace.toolCalls.length} tool calls)
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {activeTrace.toolCalls.map((tc, idx) => (
                  <div
                    key={idx}
                    style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.75rem',
                      backgroundColor: '#f8fafc',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <strong style={{ color: 'var(--color-primary-dark)' }}>
                        #{idx + 1} {tc.tool}
                      </strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                        {tc.durationMs}ms
                      </span>
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', overflowX: 'auto', background: '#0f172a', color: '#38bdf8', padding: '0.5rem', borderRadius: '4px' }}>
                      <pre>{JSON.stringify({ inputs: tc.inputs, outputs: tc.outputs }, null, 2)}</pre>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Override Reason Modal */}
      <Modal
        isOpen={overrideModalOpen}
        onClose={() => setOverrideModalOpen(false)}
        title="Clinical Override Priority"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOverrideModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={reasonInput.trim().length < 5 || actionInProgress}
              onClick={handleOverride}
            >
              Confirm Override
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label htmlFor="override-priority-select" className="form-label">
              Select Overriding Priority Level
            </label>
            <select
              id="override-priority-select"
              className="form-select"
              value={targetOverridePriority}
              onChange={(e) => setTargetOverridePriority(e.target.value)}
            >
              <option value="RED">RED - Resuscitation / Immediate</option>
              <option value="ORANGE">ORANGE - Very Urgent</option>
              <option value="YELLOW">YELLOW - Urgent</option>
              <option value="GREEN">GREEN - Routine</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="override-reason-input" className="form-label">
              Clinical Justification Reason <span style={{ color: 'var(--color-danger)' }}>*</span>
            </label>
            <textarea
              id="override-reason-input"
              rows={3}
              className="form-textarea"
              placeholder="State the clinical rationale for overriding the protocol proposal..."
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
            />
            <div className="form-hint">Mandatory (minimum 5 characters). Recorded in audit trail.</div>
          </div>
        </div>
      </Modal>

      {/* Reject Proposal Modal */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Reject AI Triage Proposal"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={reasonInput.trim().length < 5 || actionInProgress}
              onClick={handleReject}
            >
              Confirm Rejection
            </Button>
          </>
        }
      >
        <div className="form-group">
          <label htmlFor="reject-reason-input" className="form-label">
            Clinical Reason for Rejection <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <textarea
            id="reject-reason-input"
            rows={3}
            className="form-textarea"
            placeholder="Explain why the proposed protocol score is invalid or rejected..."
            value={reasonInput}
            onChange={(e) => setReasonInput(e.target.value)}
          />
          <div className="form-hint">Mandatory (minimum 5 characters). Recorded in audit trail.</div>
        </div>
      </Modal>
    </div>
  );
}

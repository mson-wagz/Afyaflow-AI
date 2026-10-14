import React from 'react';
import { useBackend } from '../../api/client.js';
import useRouting from './useRouting';
import { Card, Button, Badge, Alert } from '../../components';

/**
 * Department Routing & Service Availability View
 * 
 * Fulfills FE-DEPARTMENT-ROUTING-01 through 03:
 * - Department evidence and service snapshot freshness.
 * - Approval/rejection flow and stale assessment handling.
 * - Unavailable services and manual escalation paths.
 * - Capacity never downgrades clinical urgency (ROUTE-04).
 */
export default function RoutingView({ currentStaff, isClinical = false }) {
  const {
    departments,
    candidates,
    activeCandidate,
    selectedPatientId,
    setSelectedPatientId,
    loading,
    actionInProgress,
    actionSuccess,
    actionError,
    handleTransfer,
    clearMessages,
  } = useRouting(currentStaff);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Success Banner */}
      {actionSuccess && (
        <Alert
          variant="success"
          title={useBackend?"Department Transfer Confirmed by Server":"Department Transfer Saved in Demo"}
          onClose={clearMessages}
        >
          <div>
            Patient <strong>{actionSuccess.patientName}</strong> ({actionSuccess.patientId}) was successfully transferred to{' '}
            <strong>{actionSuccess.department}</strong>.
          </div>
          <div style={{ fontSize: '0.8rem', marginTop: '4px', color: 'var(--color-success-dark)' }}>
            Authorized by: {actionSuccess.clinicianName} • Time: {new Date(actionSuccess.timestamp).toLocaleTimeString()} • Transfer ID: {actionSuccess.transferId}
          </div>
        </Alert>
      )}

      {actionError && (
        <Alert variant="danger" title="Routing Transfer Error" onClose={clearMessages}>
          {actionError}
        </Alert>
      )}

      {/* Facility Service Snapshot (FE-DEPARTMENT-ROUTING-01) */}
      <Card
        title="Facility Department Availability & Capacity Snapshot"
        subtitle="Synthetic bed occupancy and department operational status at Kenyatta National Hospital"
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {departments.map((dept) => {
            const isCongested = dept.status === 'CONGESTED';
            const percentOccupied = Math.round((dept.occupiedBeds / dept.totalBeds) * 100);

            return (
              <div
                key={dept.id}
                style={{
                  padding: '0.85rem',
                  border: `1px solid ${isCongested ? 'rgba(217, 119, 6, 0.4)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: isCongested ? 'rgba(217, 119, 6, 0.05)' : '#ffffff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                  <strong style={{ fontSize: '0.9rem' }}>{dept.name}</strong>
                  <Badge variant={isCongested ? 'warning' : 'online'}>
                    {dept.status}
                  </Badge>
                </div>
                <div style={{ fontSize: '0.775rem', color: 'var(--color-text-subtle)', marginBottom: '0.5rem' }}>
                  {dept.specialty}
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Beds: {dept.occupiedBeds} / {dept.totalBeds} ({percentOccupied}% occupied)
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Estimated Wait: {dept.waitEstimateMinutes === 0 ? 'Immediate' : `~${dept.waitEstimateMinutes} mins`}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Candidate Selector */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
          Select Patient for Routing:
        </span>
        {candidates.map((cand) => (
          <button
            key={cand.id}
            type="button"
            className={`btn btn-sm ${selectedPatientId === cand.id ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => {
              setSelectedPatientId(cand.id);
              clearMessages();
            }}
          >
            {cand.name.split(' ')[0]} ({cand.id})
          </button>
        ))}
      </div>

      {activeCandidate && (
        <Card
          title={`Routing Recommendation: ${activeCandidate.name}`}
          subtitle={`Current Location: ${activeCandidate.currentLocation} • Approved Priority: ${activeCandidate.approvedPriority?.label}`}
          actions={
            <Badge variant="clinical">
              {activeCandidate.proposal?.protocolVersion || 'AfyaFlow Routing Engine'}
            </Badge>
          }
        >
          {/* Priority Preserved Notice (ROUTE-04) */}
          <div
            style={{
              backgroundColor: 'var(--color-primary-light)',
              border: '1px solid rgba(2, 132, 199, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem',
              marginBottom: '1rem',
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--color-primary-dark)', fontSize: '0.9rem' }}>
              🛡️ Clinical Urgency Preservation Policy (ROUTE-04)
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: '2px' }}>
              Department capacity never downgrades clinically approved triage priority.
              Patient remains at approved <strong>{activeCandidate.approvedPriority?.label}</strong> level regardless of bed availability.
            </div>
          </div>

          {/* Rationale and Target Department */}
          <div style={{ marginBottom: '1.25rem' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Evidence & Proposal Rationale
            </h4>
            <div style={{ padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '0.875rem' }}>
              <div><strong>Presenting Symptoms:</strong> {activeCandidate.presentingComplaint}</div>
              <div style={{ marginTop: '4px' }}><strong>Proposed Department:</strong> {activeCandidate.proposal?.recommendedDepartment?.name}</div>
              <div style={{ marginTop: '4px' }}><strong>Routing Rationale:</strong> {activeCandidate.proposal?.evidenceRationale}</div>
            </div>
          </div>

          {/* Congestion Alert & Manual Escalation Path (FE-DEPARTMENT-ROUTING-03) */}
          {activeCandidate.proposal?.capacityWarning && (
            <Alert variant="warning" title="Department Congestion & Escalation Path">
              <div>{activeCandidate.proposal.capacityWarning}</div>
              <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                <strong>Manual Escalation Path:</strong> Page Triage Nurse Coordinator to allocate overflow bay in Resus 2, or arrange accelerated handover.
              </div>
            </Alert>
          )}

          {/* Clinician Transfer Confirmation */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' }}>
            <Button
              variant="primary"
              loading={actionInProgress}
              disabled={actionInProgress || !isClinical}
              onClick={() => handleTransfer(activeCandidate.proposal?.recommendedDepartment?.id)}
            >
              ✓ Authorise & Commit Transfer to {activeCandidate.proposal?.recommendedDepartment?.name}
            </Button>

            {!isClinical && (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)', fontWeight: 600 }}>
                * Clinician authorization required to commit patient transfer.
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

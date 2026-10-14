import React from 'react';
import useQueue from './useQueue';
import { Card, Button, Badge, Alert } from '../../components';

/**
 * Hospital Queue Management View
 * 
 * Fulfills FE-QUEUE-MANAGEMENT-01 through 03:
 * - Patient lists, department views, and elapsed waiting times.
 * - Approved state distinct from pending proposals.
 * - Polling failure handling with a visibly stale last-confirmed snapshot.
 */
export default function QueueView() {
  const {
    queue,
    rawQueue,
    workload,
    lastConfirmedSnapshotTime,
    isStale,
    staleError,
    loading,
    departmentFilter,
    setDepartmentFilter,
    simulatePollingFailure,
    setSimulatePollingFailure,
    refreshQueue,
    getWaitingTime,
  } = useQueue();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Stale Data Alert (QUEUE-04) */}
      {isStale && (
        <Alert
          variant="warning"
          title={`Showing Stale Queue Snapshot (Last Confirmed at ${
            lastConfirmedSnapshotTime ? new Date(lastConfirmedSnapshotTime).toLocaleTimeString() : 'Unknown'
          })`}
        >
          <div>{staleError}</div>
          <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
            The queue displays the last saved demo state. Unsynchronised local changes are not presented as confirmed.
          </div>
        </Alert>
      )}

      {/* Workload Snapshot Banner (QUEUE-03) */}
      {workload && (
        <Card
          title="Facility Triage Workload Snapshot"
          subtitle="Synthetic department capacity, patient ratios, and staffing recommendations"
          actions={
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Button
                variant={simulatePollingFailure ? 'danger' : 'outline'}
                size="sm"
                onClick={() => setSimulatePollingFailure(!simulatePollingFailure)}
                title="Toggle simulated polling network failure"
              >
                {simulatePollingFailure ? '⚡ Restore Network' : '🔌 Simulate Polling Outage'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                loading={loading}
                onClick={refreshQueue}
                aria-label="Refresh queue snapshot"
              >
                ↻ Refresh
              </Button>
            </div>
          }
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '0.75rem',
            }}
          >
            <div style={{ padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>Total Waiting Visits</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary-dark)' }}>
                {workload.totalWaiting}
              </div>
            </div>

            <div style={{ padding: '0.75rem', backgroundColor: '#fee2e2', borderRadius: 'var(--radius-sm)', border: '1px solid #fca5a5' }}>
              <div style={{ fontSize: '0.75rem', color: '#991b1b' }}>Urgent / Resus Cases</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#dc2626' }}>
                {workload.redCount + workload.orangeCount}
              </div>
            </div>

            <div style={{ padding: '0.75rem', backgroundColor: '#fef3c7', borderRadius: 'var(--radius-sm)', border: '1px solid #fde68a' }}>
              <div style={{ fontSize: '0.75rem', color: '#92400e' }}>Awaiting Triage Review</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#b45309' }}>
                {workload.pendingTriageCount}
              </div>
            </div>

            <div style={{ padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>Staffing Ratio (Pt:Nurse)</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text)' }}>
                {workload.ratio}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: '0.85rem',
              padding: '0.5rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: workload.isHighLoad ? 'rgba(217, 119, 6, 0.1)' : 'rgba(22, 163, 74, 0.1)',
              border: `1px solid ${workload.isHighLoad ? 'rgba(217, 119, 6, 0.3)' : 'rgba(22, 163, 74, 0.3)'}`,
              fontSize: '0.825rem',
              color: workload.isHighLoad ? 'var(--color-warning-dark)' : 'var(--color-success-dark)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>💡 <strong>Staffing Proposal:</strong> {workload.recommendation}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              (Advisory only — staffing changes require administrative approval)
            </span>
          </div>
        </Card>
      )}

      {/* Main Queue Table */}
      <Card
        title="Live Approved Queue"
        subtitle={`Visits ordered by approved clinical priority and arrival timestamp (${queue.length} displayed)`}
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Department:</span>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="form-select"
              style={{ minHeight: '34px', padding: '0.2rem 0.5rem', fontSize: '0.85rem' }}
              aria-label="Filter queue by department"
            >
              <option value="ALL">All Departments</option>
              <option value="Emergency">Emergency Medicine</option>
              <option value="Surgical">Surgical Triage</option>
              <option value="Triage">Triage Holding</option>
              <option value="Outpatient">General Outpatient</option>
            </select>
          </div>
        }
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                <th style={{ padding: '0.75rem 0.5rem' }}>Order</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Patient & Visit ID</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Wait Time</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Approved Priority</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Assessment & AI Proposal Status</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Department Bay</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((pt, idx) => (
                <tr
                  key={pt.visitId}
                  style={{
                    borderBottom: '1px solid var(--color-border-subtle)',
                    backgroundColor: pt.approvedPriority?.code === 'ORANGE' ? 'rgba(194, 65, 12, 0.03)' : 'transparent',
                  }}
                >
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700, color: 'var(--color-text-subtle)' }}>
                    #{idx + 1}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <div style={{ fontWeight: 600 }}>{pt.patientName}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                      {pt.visitId} • {pt.age}y {pt.gender} • {pt.presentingComplaint}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>
                    {getWaitingTime(pt.arrivalTime)}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    {pt.approvedPriority ? (
                      <span
                        style={{
                          backgroundColor: pt.approvedPriority.bgColor,
                          color: pt.approvedPriority.color,
                          border: `1px solid ${pt.approvedPriority.color}`,
                          padding: '0.2rem 0.55rem',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                        }}
                      >
                        ● {pt.approvedPriority.label}
                      </span>
                    ) : (
                      <Badge variant="draft">Awaiting Approval</Badge>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    {pt.pendingProposal ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <Badge variant="warning">
                          Pending Proposal: {pt.pendingProposal.priority?.code || 'REVIEW REQUIRED'}
                        </Badge>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)' }}>
                          * Does not change approved order
                        </span>
                      </div>
                    ) : pt.assessmentStatus === 'AWAITING_ASSESSMENT' ? (
                      <Badge variant="admin">Awaiting Assessment</Badge>
                    ) : (
                      <Badge variant="online">{pt.assessmentStatus === 'REJECTED_REQUIRES_REASSESSMENT' ? 'Reassessment Required' : 'Saved Demo State'}</Badge>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', color: 'var(--color-text-muted)' }}>
                    {pt.assignedDepartment}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

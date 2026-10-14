import React, { useState } from 'react';
import { Card, Badge, Button } from '../../components';

/**
 * Hospital Queue Management View
 * Visible to all authenticated roles (clinical and administrative).
 */
export default function QueueViewPanel() {
  const [lastRefreshed, setLastRefreshed] = useState(new Date().toLocaleTimeString());

  const queuePatients = [
    {
      id: 'SYN-PT-8821',
      name: 'Kofi Mwangi',
      age: 34,
      priority: 'Orange (Score 5)',
      status: 'Awaiting Clinician Decision',
      waitingTime: '14 mins',
      department: 'Emergency / Resus 2',
      isPendingApproval: true,
    },
    {
      id: 'SYN-PT-8819',
      name: 'Mary Wanjiku',
      age: 62,
      priority: 'Orange (Score 6)',
      status: 'Approved - In Treatment',
      waitingTime: '32 mins',
      department: 'Emergency Medicine',
      isPendingApproval: false,
    },
    {
      id: 'SYN-PT-8818',
      name: 'Brian Kiprono',
      age: 21,
      priority: 'Yellow (Score 3)',
      status: 'Approved - Waiting Consultation',
      waitingTime: '48 mins',
      department: 'Outpatient Triage',
      isPendingApproval: false,
    },
    {
      id: 'SYN-PT-8815',
      name: 'Grace Adhiambo',
      age: 45,
      priority: 'Green (Score 1)',
      status: 'Approved - Queued',
      waitingTime: '65 mins',
      department: 'General Outpatient',
      isPendingApproval: false,
    },
  ];

  const getPriorityBadge = (priority) => {
    if (priority.startsWith('Orange')) {
      return (
        <span
          style={{
            backgroundColor: '#ffedd5',
            color: '#c2410c',
            border: '1px solid #fdba74',
            padding: '0.2rem 0.5rem',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.75rem',
            fontWeight: 700,
          }}
        >
          ● {priority}
        </span>
      );
    }
    if (priority.startsWith('Yellow')) {
      return (
        <span
          style={{
            backgroundColor: '#fef9c3',
            color: '#a16207',
            border: '1px solid #fde047',
            padding: '0.2rem 0.5rem',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.75rem',
            fontWeight: 700,
          }}
        >
          ● {priority}
        </span>
      );
    }
    return (
      <span
        style={{
          backgroundColor: '#dcfce7',
          color: '#15803d',
          border: '1px solid #86efac',
          padding: '0.2rem 0.5rem',
          borderRadius: 'var(--radius-full)',
          fontSize: '0.75rem',
          fontWeight: 700,
        }}
      >
        ● {priority}
      </span>
    );
  };

  return (
    <Card
      title="Facility Waiting Queue & Triage Flow"
      subtitle={`Live queue state • Last refreshed at ${lastRefreshed}`}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLastRefreshed(new Date().toLocaleTimeString())}
        >
          ↻ Refresh Queue
        </Button>
      }
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
              <th style={{ padding: '0.75rem 0.5rem' }}>Patient</th>
              <th style={{ padding: '0.75rem 0.5rem' }}>Wait Time</th>
              <th style={{ padding: '0.75rem 0.5rem' }}>Assigned Priority</th>
              <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
              <th style={{ padding: '0.75rem 0.5rem' }}>Department</th>
            </tr>
          </thead>
          <tbody>
            {queuePatients.map((pt) => (
              <tr key={pt.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <td style={{ padding: '0.75rem 0.5rem' }}>
                  <div style={{ fontWeight: 600 }}>{pt.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                    ID: {pt.id} • {pt.age}y
                  </div>
                </td>
                <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: 'var(--color-text)' }}>
                  {pt.waitingTime}
                </td>
                <td style={{ padding: '0.75rem 0.5rem' }}>
                  {getPriorityBadge(pt.priority)}
                </td>
                <td style={{ padding: '0.75rem 0.5rem' }}>
                  <Badge variant={pt.isPendingApproval ? 'draft' : 'online'}>
                    {pt.status}
                  </Badge>
                </td>
                <td style={{ padding: '0.75rem 0.5rem', color: 'var(--color-text-muted)' }}>
                  {pt.department}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

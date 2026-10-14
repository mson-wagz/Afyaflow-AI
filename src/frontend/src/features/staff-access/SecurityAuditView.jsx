import React, { useEffect } from 'react';
import useAuth from './useAuth';
import { Card, Badge } from '../../components';

/**
 * Security & Staff Access Audit Log View
 */
export default function SecurityAuditView() {
  const { auditLogs, refreshLogs } = useAuth();
  useEffect(() => {
    refreshLogs();
    const timer=setInterval(refreshLogs,5000);
    return () => clearInterval(timer);
  },[refreshLogs]);

  const getEventBadge = (eventType) => {
    switch (eventType) {
      case 'SIGN_IN':
        return <Badge variant="online">Sign In</Badge>;
      case 'SESSION_UNLOCK':
        return <Badge variant="online">Unlocked</Badge>;
      case 'PERMISSION_DENIED':
        return <Badge variant="locked">Denied (403)</Badge>;
      case 'CLINICAL_DECISION_COMMITTED':
        return <Badge variant="clinical">Clinical Decision</Badge>;
      default:
        return <Badge variant="admin">{eventType}</Badge>;
    }
  };

  return (
    <Card
      title="Security & Staff Access Audit Trail"
      subtitle="Persisted staff access and patient workflow events"
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
              <th style={{ padding: '0.75rem 0.5rem' }}>Timestamp</th>
              <th style={{ padding: '0.75rem 0.5rem' }}>Event</th>
              <th style={{ padding: '0.75rem 0.5rem' }}>Staff Member</th>
              <th style={{ padding: '0.75rem 0.5rem' }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((log) => (
              <tr
                key={log.id}
                style={{
                  borderBottom: '1px solid var(--color-border-subtle)',
                  backgroundColor: log.eventType === 'PERMISSION_DENIED' ? 'rgba(220, 38, 38, 0.05)' : 'transparent',
                }}
              >
                <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </td>
                <td style={{ padding: '0.75rem 0.5rem' }}>
                  {getEventBadge(log.eventType)}
                </td>
                <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>
                  {log.staffName}
                </td>
                <td style={{ padding: '0.75rem 0.5rem', color: log.eventType === 'PERMISSION_DENIED' ? 'var(--color-danger)' : 'var(--color-text)' }}>
                  {log.details}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

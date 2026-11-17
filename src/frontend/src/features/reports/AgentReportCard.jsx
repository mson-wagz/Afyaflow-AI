import React, { useCallback, useEffect, useState } from 'react';
import { Card, Button, Alert, Badge } from '../../components';
import { api, useBackend } from '../../api/client.js';
import { formatUsd } from '../triage/RunTrace.jsx';

const STATUS = { READY: ['warning', 'Draft: awaiting acknowledgement'], ACKNOWLEDGED: ['online', 'Acknowledged'], FAILED: ['danger', 'Failed'], RUNNING: ['draft', 'Running'] };
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');

/**
 * An AI-drafted report (shift handover or quality review): generate it, read it with its token
 * and cost figures, and acknowledge it. The agent only reads data; a person accepts the draft.
 */
export default function AgentReportCard({ kind, title, subtitle, generateLabel, acknowledgeLabel, staffId, otherAcknowledger = false }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try { const latest = await api(`/reports/${kind}/latest`); setReport(latest?.id ? latest : null); } catch (e) { setError(e.message); }
  }, [kind]);
  useEffect(() => { if (useBackend) load(); }, [load]);
  if (!useBackend) return null;

  const run = async (path, body) => {
    setError(''); setBusy(true);
    try { setReport(await api(path, { method: 'POST', ...(body ? { body } : {}) })); setNote(''); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const ownHandover = otherAcknowledger && report?.requestedBy?.id === staffId;
  const [variant, label] = STATUS[report?.status] || [];

  return (
    <Card title={title} subtitle={subtitle}
      actions={<Button size="sm" disabled={busy} loading={busy} onClick={() => run(`/reports/${kind}`)}>{generateLabel}</Button>}>
      {busy && <p role="status" className="report-progress">The AI agent is gathering the facts through its tools…</p>}
      {error && <Alert variant="danger" onClose={() => setError('')}>{error}</Alert>}
      {!report && !busy && <p className="report-empty">No report yet.</p>}
      {report && (
        <div className="report">
          <div className="report-head">
            <Badge variant={variant}>{label}</Badge>
            <span className="report-meta">Drafted by AI ({report.model}) for {report.requestedBy.name}, {when(report.createdAt)}</span>
          </div>
          {report.status === 'FAILED'
            ? <p className="report-error">The agent did not produce a report: {report.error}</p>
            : <p className="report-text">{report.content}</p>}
          <p className="report-meta">
            {report.usage.modelCalls} model calls · {report.usage.toolCalls} tool calls ({[...new Set(report.steps.map((s) => s.tool).filter((t) => !t.includes('converse') && !t.includes('chat') && !t.includes('responses')))].join(', ')})
            · {report.usage.inputTokens.toLocaleString()} + {report.usage.outputTokens.toLocaleString()} tokens · {formatUsd(report.usage.costUsd)}
          </p>
          {report.status === 'READY' && (ownHandover
            ? <p className="report-note">You prepared this handover. The incoming staff member must acknowledge it.</p>
            : (
              <div className="report-ack">
                <label htmlFor={`${kind}-ack-note`}>Note (optional)</label>
                <input id={`${kind}-ack-note`} className="form-input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(`/reports/${report.id}/acknowledge`, note.trim() ? { note: note.trim() } : {})}>{acknowledgeLabel}</Button>
              </div>
            ))}
          {report.status === 'ACKNOWLEDGED' && (
            <p className="report-note">{acknowledgeLabel === 'Mark reviewed' ? 'Reviewed' : 'Acknowledged'} by {report.acknowledgedBy.name}, {when(report.acknowledgedAt)}{report.acknowledgementNote ? `: “${report.acknowledgementNote}”` : ''}</p>
          )}
          <p className="report-disclaimer">AI-drafted from recorded data. It changes no patient, priority or queue; check it before relying on it.</p>
        </div>
      )}
    </Card>
  );
}

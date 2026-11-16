import React, { useCallback, useEffect, useState } from 'react';
import { Card, Alert } from '../../components';
import { api, useBackend } from '../../api/client.js';
import { TRIAGE_PRIORITY } from '../../../../shared/contracts/triage.js';
import { DISPOSITIONS, SATS_TARGET_MINUTES, KNH_SATS_BASELINE } from '../../../../shared/contracts/outcomes.js';
import { StatTile, SegmentedBar, ColumnChart, MeterList } from './charts.jsx';
import { formatCount, formatMinutes, formatPercent, bucketLabel } from './format.js';
import { formatUsd } from '../triage/RunTrace.jsx';

const PERIODS = [{ id: 'today', label: 'Today' }, { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }];
const REFRESH_MS = 60000;

// Decision mix: categorical slots 1-3, validated as a set on the white surface. Aqua is
// below 3:1 contrast, so segments carry printed counts and the legend repeats them.
const DECISION_COLORS = { approved: '#2a78d6', overridden: '#eb6834', rejected: '#1baf7a' };

const RUN_STATUS = [
  ['DECIDED', 'Proposal decided by a clinician'],
  ['WAITING_FOR_REVIEW', 'Proposal awaiting review'],
  ['REVIEW_REQUIRED', 'Ended needing staff review'],
  ['FAILED', 'Failed'],
  ['SUPERSEDED', 'Superseded by newer observations'],
  ['QUEUED', 'Queued'],
  ['RUNNING', 'Running'],
];

/**
 * Operations dashboard for supervisors: live workload and flow figures for the chosen period.
 * The server returns counts and durations only, with no patient names or visit IDs.
 */
export default function OperationsView() {
  const [period, setPeriod] = useState('today');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await api(`/operations/summary?period=${period}`)); setError(''); }
    catch (e) { setError(e.message); }
  }, [period]);

  useEffect(() => {
    if (!useBackend) return undefined;
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (!useBackend) return <Card title="Operations"><p>Operations figures require the AfyaFlow server.</p></Card>;

  const filters = (
    <div className="ops-filters" role="group" aria-label="Period">
      {PERIODS.map((p) => (
        <button key={p.id} type="button" className={`ops-filter${period === p.id ? ' active' : ''}`}
          aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>
      ))}
    </div>
  );

  if (!data) return (
    <Card title="Operations" actions={filters}>
      {error ? <Alert variant="danger">{error}</Alert> : <div role="status">Loading operations figures…</div>}
    </Card>
  );

  const { live, flow, decisions, agentRuns, transfers, timezone, bucket } = data;
  const periodLabel = PERIODS.find((p) => p.id === data.period)?.label.toLowerCase();
  const updated = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(new Date(data.to));
  const points = flow.arrivalsByBucket.map((b) => ({ key: b.start, label: bucketLabel(b.start, bucket, timezone), value: b.arrivals }));
  const priorityParts = [
    ...['RED', 'ORANGE', 'YELLOW', 'GREEN'].map((code) => ({
      key: code, label: `${code[0]}${code.slice(1).toLowerCase()}`, value: live.byPriority[code], color: TRIAGE_PRIORITY[code].color,
    })),
    { key: 'UNPRIORITISED', label: 'No approved priority', value: live.byPriority.UNPRIORITISED, color: '#94a3b8', ink: '#0f172a' },
  ];

  const pastTarget = Object.values(live.pastTargetNotSeen || {}).reduce((a, b) => a + b, 0);
  const { outcomes, seenAgainstTarget, aiCost } = data;
  const ratio = (r) => (r.denominator ? `${formatCount(r.numerator)} of ${formatCount(r.denominator)}` : 'No cases yet');

  return (
    <div className="ops-root">
      <Card title="Operations" subtitle={`Live workload and flow for ${periodLabel}. Times in ${timezone}; updated ${updated}.`} actions={filters}>
        {error && <Alert variant="warning">Showing the last figures received. {error}</Alert>}
        <div className="ops-kpis">
          <StatTile label="Open visits" value={formatCount(live.openVisits)} />
          <StatTile label="Awaiting AI assessment" value={formatCount(live.awaitingAssessment)} />
          <StatTile label="Proposals awaiting review" value={formatCount(live.proposalsAwaitingReview)}
            detail={live.oldestProposalMinutes !== null ? `Oldest waiting ${formatMinutes(live.oldestProposalMinutes)}` : 'None waiting'} />
          <StatTile label="Need manual triage" value={formatCount(live.needsManualTriage)} tone={live.needsManualTriage ? 'attention' : undefined}
            detail="Assessment ended without a proposal" />
          <StatTile label="Overdue rechecks" value={formatCount(live.followups.overdue)} tone={live.followups.overdue ? 'attention' : undefined}
            detail={`${formatCount(live.followups.open)} open · ${formatCount(live.followups.proposed)} proposed`} />
          <StatTile label="Past SATS target, not yet seen" value={formatCount(pastTarget)} tone={pastTarget ? 'attention' : undefined}
            detail={`${formatCount(live.notYetSeen)} open visits not yet seen`} />
        </div>
        <p className="ops-note">Open visits are those without a recorded outcome.</p>
      </Card>

      <div className="ops-grid">
        <Card title="Open visits by approved priority">
          <SegmentedBar label="Open visits by approved priority" parts={priorityParts} />
        </Card>
        <Card title="Bed occupancy">
          <MeterList rows={live.departments} />
        </Card>
      </div>

      <Card title={`Arrivals: ${formatCount(flow.arrivals)}`} subtitle={bucket === 'hour' ? 'Per hour since midnight' : 'Per day'}>
        <ColumnChart label={bucket === 'hour' ? 'Arrivals per hour' : 'Arrivals per day'} valueLabel="Arrivals" points={points}
          everyNthLabel={points.length > 16 ? Math.ceil(points.length / 8) : bucket === 'hour' && points.length > 8 ? 2 : 1} />
      </Card>

      <Card title="Time to triage" subtitle="For visits that arrived in this period; median and 90th percentile">
        <div className="ops-kpis">
          {[['Arrival to AI proposal', flow.doorToProposal], ['Arrival to clinician decision', flow.doorToDecision],
            ['Proposal to clinician decision', flow.proposalToDecision]].map(([label, t]) => (
            <StatTile key={label} label={label} value={formatMinutes(t.medianMinutes)}
              detail={t.count ? `90% within ${formatMinutes(t.p90Minutes)} · ${formatCount(t.count)} visit${t.count === 1 ? '' : 's'}` : 'No visits measured yet'} />
          ))}
        </div>
      </Card>

      <div className="ops-grid">
        <Card title="Clinician decisions on AI proposals" subtitle={`Accepted unchanged: ${formatPercent(decisions.acceptanceRate)} of ${formatCount(decisions.total)}`}>
          <SegmentedBar label="Clinician decisions on AI proposals" parts={[
            { key: 'approved', label: 'Approved', value: decisions.approved, color: DECISION_COLORS.approved },
            { key: 'overridden', label: 'Overridden', value: decisions.overridden, color: DECISION_COLORS.overridden },
            { key: 'rejected', label: 'Rejected', value: decisions.rejected, color: DECISION_COLORS.rejected, ink: '#0f172a' },
          ]} />
          <p className="ops-note">Acceptance shows agreement with the AI proposal, not clinical accuracy.</p>
        </Card>
        <Card title={`AI assessments: ${formatCount(agentRuns.total)}`}
          subtitle={agentRuns.medianDurationSeconds !== null ? `Median run time ${agentRuns.medianDurationSeconds} s` : 'No finished runs in this period'}>
          <table className="ops-table">
            <thead><tr><th scope="col">Outcome</th><th scope="col">Runs</th></tr></thead>
            <tbody>
              {RUN_STATUS.filter(([status]) => agentRuns.byStatus[status]).map(([status, text]) => (
                <tr key={status}><td>{status === 'FAILED' || status === 'REVIEW_REQUIRED' ? <span aria-hidden="true">⚠ </span> : null}{text}</td><td>{formatCount(agentRuns.byStatus[status])}</td></tr>
              ))}
              {!agentRuns.total && <tr><td colSpan={2}>None in this period</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title={`Outcomes: ${formatCount(outcomes.total)}`} subtitle="Visits closed in this period. Triage accuracy uses the Kenyatta National Hospital SATS study definitions">
        <div className="ops-kpis">
          <StatTile label="Over-triage" value={formatPercent(outcomes.overTriage.percent)}
            detail={`${ratio(outcomes.overTriage)} discharged were Red, Orange or Yellow · KNH ${KNH_SATS_BASELINE.overTriagePercent}%`} />
          <StatTile label="Under-triage" value={formatPercent(outcomes.underTriage.percent)}
            detail={`${ratio(outcomes.underTriage)} admitted or died were Green · KNH ${KNH_SATS_BASELINE.underTriagePercent}%`} />
          <StatTile label="Left without being seen" value={formatPercent(outcomes.leftWithoutBeingSeenPercent)}
            detail={`${formatCount(outcomes.byDisposition.LEFT_WITHOUT_BEING_SEEN)} of ${formatCount(outcomes.total)} closed`} />
          <StatTile label="Length of stay" value={formatMinutes(outcomes.lengthOfStay.medianMinutes)}
            detail={outcomes.lengthOfStay.count ? `Median arrival to outcome · 90% within ${formatMinutes(outcomes.lengthOfStay.p90Minutes)}` : 'No closed visits yet'} />
        </div>
        <table className="ops-table" style={{ marginTop: '1rem' }}>
          <thead><tr><th scope="col">Outcome</th><th scope="col">Visits</th></tr></thead>
          <tbody>
            {Object.entries(outcomes.byDisposition).map(([code, n]) => (
              <tr key={code}><td>{DISPOSITIONS[code].label}</td><td>{formatCount(n)}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="ops-note">
          KNH figures are the hospital&apos;s published post-SATS baseline ({KNH_SATS_BASELINE.source}), shown for comparison.
          {outcomes.closedWithoutApprovedPriority ? ` ${formatCount(outcomes.closedWithoutApprovedPriority)} closed without an approved priority count in the denominators only.` : ''}
        </p>
      </Card>

      <Card title="Seen against SATS target" subtitle="Patients first seen by a clinician in this period, by approved level">
        <table className="ops-table">
          <thead><tr><th scope="col">Level</th><th scope="col">Target</th><th scope="col">Seen</th><th scope="col">Median wait</th><th scope="col">Within target</th><th scope="col">Waiting past target now</th></tr></thead>
          <tbody>
            {seenAgainstTarget.map((r) => (
              <tr key={r.priority}>
                <td>{`Level ${TRIAGE_PRIORITY[r.priority].level} · ${TRIAGE_PRIORITY[r.priority].category}`}</td>
                <td>{r.priority === 'RED' ? 'Immediate' : formatMinutes(SATS_TARGET_MINUTES[r.priority])}</td>
                <td>{formatCount(r.seen)}</td>
                <td>{formatMinutes(r.medianMinutes)}</td>
                <td>{r.priority === 'RED' ? '—' : formatPercent(r.withinTargetPercent)}</td>
                <td>{live.pastTargetNotSeen?.[r.priority] ? `⚠ ${formatCount(live.pastTargetNotSeen[r.priority])}` : '0'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {aiCost && (
        <Card title="AI cost to serve" subtitle="Measured from the token usage each model call reported. A completed triage is a clinician decision on an AI proposal">
          <div className="ops-kpis">
            <StatTile label="Cost per completed triage" value={formatUsd(aiCost.costPerOutcomeUsd)}
              detail={aiCost.completedOutcomes ? `AI ${formatUsd(aiCost.modelCostPerOutcomeUsd)} + hosting ${formatUsd(aiCost.hostingPerOutcomeUsd)} · ${formatCount(aiCost.completedOutcomes)} completed` : 'No completed triage yet'} />
            <StatTile label="Tokens per answer" value={aiCost.tokensPerAnswer ? formatCount(aiCost.tokensPerAnswer.input + aiCost.tokensPerAnswer.output) : '—'}
              detail={aiCost.tokensPerAnswer ? `${formatCount(aiCost.tokensPerAnswer.input)} input + ${formatCount(aiCost.tokensPerAnswer.output)} output, average per model call` : 'No metered model calls yet'} />
            <StatTile label="Model calls per assessment" value={aiCost.modelCallsPerRun.average ?? '—'}
              detail={aiCost.modelCallsPerRun.max !== null ? `Worst case ${aiCost.modelCallsPerRun.max} · ${formatCount(aiCost.runs)} assessments` : 'No assessments yet'} />
            <StatTile label="AI cost per assessment" value={formatUsd(aiCost.costPerRunUsd.average)}
              detail={aiCost.costPerRunUsd.max !== null ? `Worst case ${formatUsd(aiCost.costPerRunUsd.max)}` : '—'} />
          </div>
          <p className="ops-note">
            {aiCost.models.map((m) => `${m.model}: ${m.price ? `$${m.price.inputUsdPerMillion} / $${m.price.outputUsdPerMillion} per 1M input / output tokens (${m.price.source})` : 'not priced'}`).join(' · ') || 'No model calls in this period.'}
            {' '}Hosting ${aiCost.hostingUsdPerMonth}/month spread over the period. Failed and retried assessments are included.
            {aiCost.unmeteredModelCalls ? ` ⚠ ${aiCost.unmeteredModelCalls} model call(s) reported no usage and are not counted.` : ''}
          </p>
        </Card>
      )}

      <Card title="Transfers by department">
        {transfers.length ? (
          <table className="ops-table">
            <thead><tr><th scope="col">Department</th><th scope="col">Transfers</th></tr></thead>
            <tbody>{transfers.map((t) => <tr key={t.department}><td>{t.department}</td><td>{formatCount(t.count)}</td></tr>)}</tbody>
          </table>
        ) : <div className="ops-empty">No transfers in this period</div>}
      </Card>
    </div>
  );
}

import { Injectable, Inject, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Database } from '../database/db.js';
import type { Staff } from '../auth/auth.js';
import { config } from '../config.js';
import { hasPermission, PERMISSIONS } from '../../../shared/contracts/auth.js';
import { MODEL_CALL_TOOLS, runUsage, hostingUsdPerMonth, round } from './usage.js';
import { escalationSettings } from './escalation.js';

/* ------------------------------------------------------------------ */
/* Operations dashboard: aggregate figures for supervisors            */
/* ------------------------------------------------------------------ */
// Only counts and durations leave this module: no names, visit IDs or free text, so the
// dashboard is not a patient-record read and is not added to the access log. Only live
// workflow (synthetic) visits are counted; research records never enter these figures.

/** Calendar days covered by each period, ending today in the facility time zone. */
export const OPERATIONS_PERIODS = { today: 1, '7d': 7, '30d': 30 } as const;
export type OperationsPeriod = keyof typeof OPERATIONS_PERIODS;

const minutes = (seconds: unknown) => seconds === null || seconds === undefined ? null : Math.round(Number(seconds) / 6) / 10;
const timing = (row: Record<string, unknown>, prefix: string) => ({
  count: Number(row[`${prefix}_n`]), medianMinutes: minutes(row[`${prefix}_p50`]), p90Minutes: minutes(row[`${prefix}_p90`]),
});
/** Median and 90th percentile of a non-negative interval in seconds, with the number of measured visits. */
const percentiles = (expr: string, prefix: string) => `
  count(*) FILTER (WHERE ${expr}>=0)::int ${prefix}_n,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY ${expr}) FILTER (WHERE ${expr}>=0) ${prefix}_p50,
  percentile_cont(0.9) WITHIN GROUP (ORDER BY ${expr}) FILTER (WHERE ${expr}>=0) ${prefix}_p90`;

export function requireOperationsView(staff: Staff) {
  if (!hasPermission(staff.role, PERMISSIONS.OPERATIONS_VIEW))
    throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Clinical or administrator access required to view operations figures.' });
}

@Injectable()
export class OperationsService {
  constructor(@Inject(Database) private readonly database: Database) {}

  async summary(staff: Staff, period: string = 'today') {
    requireOperationsView(staff);
    if (!Object.hasOwn(OPERATIONS_PERIODS, period))
      throw new BadRequestException({ code: 'INVALID_PERIOD', message: `Period must be one of: ${Object.keys(OPERATIONS_PERIODS).join(', ')}.` });
    const days = OPERATIONS_PERIODS[period as OperationsPeriod], tz = config.facilityTimezone;
    const db = this.database.pool;
    // Window start: local midnight (days-1) days ago, so "7d" is today plus the six previous calendar days.
    const { start, now } = (await db.query(`SELECT (date_trunc('day',now() AT TIME ZONE $1)-make_interval(days=>$2)) AT TIME ZONE $1 start,now() now`,
      [tz, days - 1])).rows[0];

    const [live, review, manual, followups, departments, cohort, decisions, decidedPriorities, runs, transfers, buckets, outcomes, seen, overdue] = await Promise.all([
      db.query(`SELECT count(*)::int open,
          count(*) FILTER (WHERE approved_priority='RED')::int red, count(*) FILTER (WHERE approved_priority='ORANGE')::int orange,
          count(*) FILTER (WHERE approved_priority='YELLOW')::int yellow, count(*) FILTER (WHERE approved_priority='GREEN')::int green,
          count(*) FILTER (WHERE approved_priority IS NULL)::int unprioritised,
          count(*) FILTER (WHERE assessment_status='AWAITING_ASSESSMENT')::int awaiting_assessment,
          count(*) FILTER (WHERE seen_at IS NULL)::int not_seen
        FROM visits WHERE data_source='synthetic' AND closed_at IS NULL`),
      db.query(`SELECT count(*)::int pending, extract(epoch FROM now()-min(p.created_at)) oldest
        FROM proposals p JOIN agent_runs r ON r.id=p.run_id JOIN visits v ON v.id=p.visit_id
        WHERE v.data_source='synthetic' AND v.closed_at IS NULL AND p.status='PENDING' AND r.status IN ('WAITING_FOR_REVIEW','REVIEW_REQUIRED')`),
      // The current assessment ended without a proposal: staff must triage manually.
      db.query(`SELECT count(*)::int n FROM agent_runs r JOIN visits v ON v.id=r.visit_id AND v.observation_version=r.observation_version
        WHERE v.data_source='synthetic' AND v.closed_at IS NULL AND r.status IN ('FAILED','REVIEW_REQUIRED')
        AND NOT EXISTS(SELECT 1 FROM proposals p WHERE p.run_id=r.id AND p.status='PENDING')`),
      db.query(`SELECT count(*) FILTER (WHERE status='PROPOSED')::int proposed, count(*) FILTER (WHERE status IN ('OPEN','ACKNOWLEDGED'))::int open,
          count(*) FILTER (WHERE status IN ('OPEN','ACKNOWLEDGED') AND due_at<now())::int overdue FROM followups`),
      db.query(`SELECT id,data->>'name' name,data->>'status' status,coalesce((data->>'occupiedBeds')::int,0) occupied,
          coalesce((data->>'totalBeds')::int,0) total FROM departments ORDER BY data->>'name'`),
      // Visits arriving in the window, timed to their first proposal and first clinician decision.
      db.query(`WITH c AS (SELECT v.arrival_at,
            extract(epoch FROM (SELECT min(p.created_at) FROM proposals p WHERE p.visit_id=v.id)-v.arrival_at) to_proposal,
            extract(epoch FROM (SELECT min(d.timestamp) FROM decisions d WHERE d.visit_id=v.id)-v.arrival_at) to_decision
          FROM visits v WHERE v.data_source='synthetic' AND v.arrival_at>=$1 AND v.arrival_at<=now())
        SELECT count(*)::int arrivals,${percentiles('to_proposal', 'proposal')},${percentiles('to_decision', 'decision')} FROM c`, [start]),
      db.query(`SELECT count(*) FILTER (WHERE d.decision='APPROVED')::int approved, count(*) FILTER (WHERE d.decision='OVERRIDDEN')::int overridden,
          count(*) FILTER (WHERE d.decision='REJECTED')::int rejected,
          ${percentiles('extract(epoch FROM d.timestamp-p.created_at)', 'review')}
        FROM decisions d JOIN proposals p ON p.id=d.proposal_id JOIN visits v ON v.id=d.visit_id
        WHERE v.data_source='synthetic' AND d.timestamp>=$1`, [start]),
      db.query(`SELECT d.priority,count(*)::int n FROM decisions d JOIN visits v ON v.id=d.visit_id
        WHERE v.data_source='synthetic' AND d.timestamp>=$1 AND d.decision<>'REJECTED' AND d.priority IS NOT NULL GROUP BY d.priority`, [start]),
      db.query(`SELECT r.status,count(*)::int n,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM r.finished_at-r.created_at)) FILTER (WHERE r.finished_at IS NOT NULL) p50
        FROM agent_runs r JOIN visits v ON v.id=r.visit_id WHERE v.data_source='synthetic' AND r.created_at>=$1 GROUP BY ROLLUP(r.status)`, [start]),
      db.query(`SELECT dep.data->>'name' name,count(*)::int n FROM transfers t JOIN departments dep ON dep.id=t.department_id
        JOIN visits v ON v.id=t.visit_id WHERE v.data_source='synthetic' AND t.timestamp>=$1 GROUP BY 1 ORDER BY 2 DESC,1`, [start]),
      // Arrivals per local hour (today) or local day, including empty buckets.
      db.query(`SELECT b AT TIME ZONE $2 bucket,count(v.id)::int n
        FROM generate_series($1::timestamptz AT TIME ZONE $2,date_trunc($3,now() AT TIME ZONE $2),('1 '||$3)::interval) b
        LEFT JOIN visits v ON v.data_source='synthetic' AND v.arrival_at>=b AT TIME ZONE $2 AND v.arrival_at<(b+('1 '||$3)::interval) AT TIME ZONE $2
        GROUP BY b ORDER BY b`, [start, tz, days === 1 ? 'hour' : 'day']),
      // Outcomes recorded in the window. Under-/over-triage follow the KNH SATS evaluation
      // (Wangara et al. 2019): under = GREEN admitted or died / all admitted or died;
      // over = RED, ORANGE or YELLOW discharged / all discharged.
      db.query(`SELECT count(*)::int total,
          count(*) FILTER (WHERE o.disposition='ADMITTED')::int admitted, count(*) FILTER (WHERE o.disposition='DISCHARGED')::int discharged,
          count(*) FILTER (WHERE o.disposition='DIED')::int died, count(*) FILTER (WHERE o.disposition='LEFT_WITHOUT_BEING_SEEN')::int lwbs,
          count(*) FILTER (WHERE o.disposition='LEFT_AGAINST_MEDICAL_ADVICE')::int lama, count(*) FILTER (WHERE o.disposition='TRANSFERRED_OUT')::int transferred,
          count(*) FILTER (WHERE o.disposition IN ('ADMITTED','DIED') AND o.priority_at_disposition='GREEN')::int under_n,
          count(*) FILTER (WHERE o.disposition IN ('ADMITTED','DIED'))::int under_d,
          count(*) FILTER (WHERE o.disposition='DISCHARGED' AND o.priority_at_disposition IN ('RED','ORANGE','YELLOW'))::int over_n,
          count(*) FILTER (WHERE o.priority_at_disposition IS NULL)::int unprioritised,
          ${percentiles('extract(epoch FROM o.recorded_at-v.arrival_at)', 'los')}
        FROM visit_outcomes o JOIN visits v ON v.id=o.visit_id WHERE v.data_source='synthetic' AND o.recorded_at>=$1`, [start]),
      // Patients first seen in the window: time from arrival to being seen, against the SATS target of their approved level.
      db.query(`SELECT v.approved_priority code,count(*)::int n,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM v.seen_at-v.arrival_at)) p50,
          count(*) FILTER (WHERE v.seen_at-v.arrival_at<=make_interval(mins=>t.target))::int within_target
        FROM visits v JOIN (VALUES ('RED',0),('ORANGE',10),('YELLOW',60),('GREEN',240)) t(code,target) ON t.code=v.approved_priority
        WHERE v.data_source='synthetic' AND v.seen_at>=$1 GROUP BY v.approved_priority`, [start]),
      // Open, approved and not yet seen, already past their level's target.
      db.query(`SELECT v.approved_priority code,count(*)::int n FROM visits v
        JOIN (VALUES ('RED',0),('ORANGE',10),('YELLOW',60),('GREEN',240)) t(code,target) ON t.code=v.approved_priority
        WHERE v.data_source='synthetic' AND v.closed_at IS NULL AND v.seen_at IS NULL AND now()-v.arrival_at>make_interval(mins=>t.target)
        GROUP BY v.approved_priority`),
    ]);

    const l = live.rows[0], c = cohort.rows[0], d = decisions.rows[0], o = outcomes.rows[0];
    const aiCost = await this.aiCost(start, days, d.approved + d.overridden + d.rejected);
    const esc = (await db.query(`SELECT count(*) FILTER (WHERE status='SENT')::int sent,count(*) FILTER (WHERE status='FAILED')::int failed,
      count(*) FILTER (WHERE status='QUEUED')::int queued FROM sms_escalations WHERE created_at>=$1`, [start])).rows[0];
    const percent = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : null);
    const levels = ['RED', 'ORANGE', 'YELLOW', 'GREEN'] as const;
    const decided = d.approved + d.overridden + d.rejected;
    const runRows = runs.rows.filter((r) => r.status !== null), runTotal = runs.rows.find((r) => r.status === null);
    const priorityCount = (code: string) => decidedPriorities.rows.find((r) => r.priority === code)?.n ?? 0;
    return {
      period, timezone: tz, from: new Date(start).toISOString(), to: new Date(now).toISOString(), bucket: days === 1 ? 'hour' : 'day',
      live: {
        openVisits: l.open, awaitingAssessment: l.awaiting_assessment,
        byPriority: { RED: l.red, ORANGE: l.orange, YELLOW: l.yellow, GREEN: l.green, UNPRIORITISED: l.unprioritised },
        proposalsAwaitingReview: review.rows[0].pending, oldestProposalMinutes: minutes(review.rows[0].oldest),
        needsManualTriage: manual.rows[0].n, notYetSeen: l.not_seen,
        pastTargetNotSeen: Object.fromEntries(levels.map((code) => [code, overdue.rows.find((r) => r.code === code)?.n ?? 0])),
        followups: followups.rows[0],
        departments: departments.rows.map((r) => ({ id: r.id, name: r.name, status: r.status, occupiedBeds: r.occupied, totalBeds: r.total })),
      },
      flow: {
        arrivals: c.arrivals,
        arrivalsByBucket: buckets.rows.map((r) => ({ start: new Date(r.bucket).toISOString(), arrivals: r.n })),
        doorToProposal: timing(c, 'proposal'), doorToDecision: timing(c, 'decision'), proposalToDecision: timing(d, 'review'),
      },
      decisions: {
        total: decided, approved: d.approved, overridden: d.overridden, rejected: d.rejected,
        // Share of clinician decisions that accepted the AI-proposed priority unchanged.
        acceptanceRate: decided ? Math.round((d.approved / decided) * 1000) / 10 : null,
        decidedPriority: { RED: priorityCount('RED'), ORANGE: priorityCount('ORANGE'), YELLOW: priorityCount('YELLOW'), GREEN: priorityCount('GREEN') },
      },
      agentRuns: {
        total: runTotal?.n ?? 0, medianDurationSeconds: runTotal?.p50 == null ? null : Math.round(Number(runTotal.p50) * 10) / 10,
        byStatus: Object.fromEntries(runRows.map((r) => [r.status, r.n])),
      },
      transfers: transfers.rows.map((r) => ({ department: r.name, count: r.n })),
      outcomes: {
        total: o.total,
        byDisposition: { ADMITTED: o.admitted, DISCHARGED: o.discharged, DIED: o.died, LEFT_WITHOUT_BEING_SEEN: o.lwbs,
          LEFT_AGAINST_MEDICAL_ADVICE: o.lama, TRANSFERRED_OUT: o.transferred },
        underTriage: { numerator: o.under_n, denominator: o.under_d, percent: percent(o.under_n, o.under_d) },
        overTriage: { numerator: o.over_n, denominator: o.discharged, percent: percent(o.over_n, o.discharged) },
        leftWithoutBeingSeenPercent: percent(o.lwbs, o.total),
        closedWithoutApprovedPriority: o.unprioritised,
        lengthOfStay: timing(o, 'los'),
      },
      aiCost,
      // SMS alerts to the on-call clinician for unseen Level 1 patients (docs/INTEGRATION_MAP.md).
      escalations: { ...esc, provider: escalationSettings().provider },
      // RED's target is "immediate", so it reports time to be seen without a compliance percentage.
      seenAgainstTarget: levels.map((code) => {
        const r = seen.rows.find((x) => x.code === code);
        return { priority: code, seen: r?.n ?? 0, medianMinutes: minutes(r?.p50 ?? null),
          withinTargetPercent: code === 'RED' || !r ? null : percent(r.within_target, r.n) };
      }),
    };
  }

  /**
   * Measured AI cost-to-serve for runs started in the window. A completed outcome is a clinician
   * decision on an AI proposal; model cost includes every run (failed, superseded and retried runs
   * too), and hosting is the configured monthly cost spread over the window's days.
   */
  private async aiCost(start: Date, days: number, completedOutcomes: number) {
    const rows = (await this.database.pool.query(`SELECT r.id,r.provider,r.model,t.tool,t.outputs FROM agent_runs r
      JOIN visits v ON v.id=r.visit_id LEFT JOIN tool_traces t ON t.run_id=r.id AND t.tool=ANY($2)
      WHERE v.data_source='synthetic' AND r.created_at>=$1`, [start, MODEL_CALL_TOOLS])).rows;
    const runs = new Map<string, { provider: string; model: string; calls: any[] }>();
    for (const r of rows) {
      if (!runs.has(r.id)) runs.set(r.id, { provider: r.provider, model: r.model, calls: [] });
      if (r.tool) runs.get(r.id)!.calls.push({ tool: r.tool, outputs: r.outputs });
    }
    const usages = [...runs.values()].map((r) => ({ ...runUsage(r.provider, r.model, r.calls), model: r.model, provider: r.provider }));
    const sum = (f: (u: typeof usages[number]) => number) => usages.reduce((a, u) => a + f(u), 0);
    const calls = sum((u) => u.modelCalls), metered = calls - sum((u) => u.unmeteredModelCalls);
    const input = sum((u) => u.inputTokens), output = sum((u) => u.outputTokens);
    const priced = usages.filter((u) => u.costUsd !== null);
    const modelCost = priced.reduce((a, u) => a + (u.costUsd as number), 0);
    const hosting = hostingUsdPerMonth() * days / 30.44;
    const per = (value: number) => (completedOutcomes ? round(value / completedOutcomes, 6) : null);
    const models = [...new Map(usages.map((u) => [u.model, { model: u.model, provider: u.provider, price: u.price }])).values()];
    return {
      runs: usages.length, completedOutcomes, modelCalls: calls,
      modelCallsPerRun: { average: usages.length ? round(calls / usages.length, 2) : null, max: usages.length ? Math.max(...usages.map((u) => u.modelCalls)) : null },
      tokensPerAnswer: metered ? { input: Math.round(input / metered), output: Math.round(output / metered) } : null,
      tokens: { input, output },
      unmeteredModelCalls: calls - metered, unpricedRuns: usages.length - priced.length,
      modelCostUsd: round(modelCost, 6), hostingCostUsd: round(hosting, 4), hostingUsdPerMonth: hostingUsdPerMonth(),
      costPerRunUsd: { average: priced.length ? round(modelCost / priced.length, 6) : null,
        max: priced.length ? round(Math.max(...priced.map((u) => u.costUsd as number)), 6) : null },
      modelCostPerOutcomeUsd: per(modelCost), hostingPerOutcomeUsd: per(hosting), costPerOutcomeUsd: per(modelCost + hosting),
      models,
    };
  }
}

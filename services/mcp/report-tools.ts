import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { performance } from 'node:perf_hooks';
import { Database, id } from '../../src/backend/src/database/db.js';
import { TRIAGE_PRIORITY } from '../../src/shared/contracts/triage.js';
import { SATS_TARGET_MINUTES, KNH_SATS_BASELINE } from '../../src/shared/contracts/outcomes.js';

/* ------------------------------------------------------------------ */
/* Read-only MCP tools for the report agent (docs/AI_REPORTS.md)       */
/* ------------------------------------------------------------------ */
// Every tool only reads synthetic workflow data, except the one save tool, which stores the
// draft text on its own report. No tool can change a patient, a priority or the queue.

export type ReportKind = 'HANDOVER' | 'QUALITY_REVIEW';

const levelOf = (code: string | null) => (code ? (TRIAGE_PRIORITY as any)[code]?.level ?? null : null);

export async function createReportTools(database: Database, reportId: string, kind: ReportKind) {
  const db = database.pool;
  const server = new McpServer({ name: 'afyaflow-report-tools', version: '0.1.0' });
  let saved: string | null = null, step = 0;
  const patientIds = new Set<string>();
  const note = (rows: any[]) => { for (const r of rows) if (r.visitId) patientIds.add(r.visitId); return rows; };

  const handover: Record<string, { description: string; run: (args: any) => Promise<any> }> = {
    get_unseen_patients: {
      description: 'Open patients not yet seen by a clinician, most urgent level first: name, visit ID, approved level, minutes waited and whether past their SATS target.',
      run: async () => note((await db.query(`SELECT v.id,v.name,v.age,v.complaint,v.approved_priority,v.assessment_status,
          floor(extract(epoch FROM now()-v.arrival_at)/60)::int waited FROM visits v
        WHERE v.data_source='synthetic' AND v.closed_at IS NULL AND v.seen_at IS NULL
        ORDER BY CASE v.approved_priority WHEN 'RED' THEN 1 WHEN 'ORANGE' THEN 2 WHEN 'YELLOW' THEN 3 WHEN 'GREEN' THEN 4 ELSE 5 END, v.arrival_at LIMIT 30`)).rows
        .map((r) => ({ visitId: r.id, name: r.name, age: r.age, complaint: r.complaint, level: levelOf(r.approved_priority),
          priority: r.approved_priority ?? 'NOT_YET_APPROVED', minutesWaited: r.waited,
          pastTarget: r.approved_priority ? r.waited > (SATS_TARGET_MINUTES as any)[r.approved_priority] : null, assessmentStatus: r.assessment_status }))),
    },
    get_pending_decisions: {
      description: 'AI proposals waiting for a clinician decision: name, visit ID, proposed level and minutes waiting.',
      run: async () => note((await db.query(`SELECT v.id,v.name,p.data->'proposal'->'priority'->>'code' proposed,
          floor(extract(epoch FROM now()-p.created_at)/60)::int waiting FROM proposals p JOIN agent_runs r ON r.id=p.run_id JOIN visits v ON v.id=p.visit_id
        WHERE v.data_source='synthetic' AND v.closed_at IS NULL AND p.status='PENDING' AND r.status IN ('WAITING_FOR_REVIEW','REVIEW_REQUIRED')
        ORDER BY p.created_at LIMIT 30`)).rows.map((r) => ({ visitId: r.id, name: r.name, proposed: r.proposed ?? 'REVIEW_REQUIRED', minutesWaiting: r.waiting }))),
    },
    get_rechecks: {
      description: 'Open recheck tasks: name, visit ID, status, owner, due time and whether overdue.',
      run: async () => note((await db.query(`SELECT v.id,v.name,f.status,s.profile->>'name' owner,f.due_at,(f.due_at<now()) overdue
        FROM followups f JOIN visits v ON v.id=f.visit_id LEFT JOIN staff s ON s.id=f.owner_id
        WHERE v.closed_at IS NULL AND f.status IN ('PROPOSED','OPEN','ACKNOWLEDGED') ORDER BY f.due_at NULLS LAST LIMIT 30`)).rows
        .map((r) => ({ visitId: r.id, name: r.name, status: r.status, owner: r.owner ?? 'not assigned', dueAt: r.due_at ? new Date(r.due_at).toISOString() : null, overdue: Boolean(r.overdue) }))),
    },
    get_shift_activity: {
      description: 'Counts for the last 12 hours: arrivals, clinician decisions, outcomes by type and SMS alerts sent.',
      run: async () => (await db.query(`SELECT
          (SELECT count(*) FROM visits WHERE data_source='synthetic' AND arrival_at>now()-interval '12 hours')::int arrivals,
          (SELECT count(*) FROM decisions WHERE timestamp>now()-interval '12 hours')::int decisions,
          (SELECT coalesce(json_object_agg(disposition,n),'{}') FROM (SELECT disposition,count(*)::int n FROM visit_outcomes
            WHERE recorded_at>now()-interval '12 hours' GROUP BY 1) o) outcomes,
          (SELECT count(*) FROM sms_escalations WHERE status='SENT' AND created_at>now()-interval '12 hours')::int sms_alerts_sent`)).rows[0],
    },
  };

  const quality: typeof handover = {
    get_triage_metrics: {
      description: 'Over- and under-triage for visits closed in the last 30 days (KNH study formulas), with KNH’s published baseline.',
      run: async () => {
        const r = (await db.query(`SELECT count(*) FILTER (WHERE o.disposition IN ('ADMITTED','DIED'))::int admitted_or_died,
            count(*) FILTER (WHERE o.disposition IN ('ADMITTED','DIED') AND o.priority_at_disposition='GREEN')::int under_n,
            count(*) FILTER (WHERE o.disposition='DISCHARGED')::int discharged,
            count(*) FILTER (WHERE o.disposition='DISCHARGED' AND o.priority_at_disposition IN ('RED','ORANGE','YELLOW'))::int over_n
          FROM visit_outcomes o JOIN visits v ON v.id=o.visit_id WHERE v.data_source='synthetic' AND o.recorded_at>now()-interval '30 days'`)).rows[0];
        const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
        return { periodDays: 30, underTriage: { cases: r.under_n, of: r.admitted_or_died, percent: pct(r.under_n, r.admitted_or_died) },
          overTriage: { cases: r.over_n, of: r.discharged, percent: pct(r.over_n, r.discharged) }, knhBaseline: KNH_SATS_BASELINE };
      },
    },
    get_mistriage_cases: {
      description: 'De-identified closed cases from the last 30 days where triage level and outcome disagreed (Green admitted or died; Red, Orange or Yellow discharged), with vital signs, TEWS, the AI proposal, the clinician decision and reason, and the outcome. Visit IDs only, no names.',
      run: async () => note((await db.query(`SELECT v.id,v.age,v.complaint,o.disposition,o.priority_at_disposition,ob.vitals,
          d.decision,d.reason,p.data->'proposal'->>'score' tews,p.data->'proposal'->'priority'->>'code' ai_proposed
        FROM visit_outcomes o JOIN visits v ON v.id=o.visit_id
        JOIN observations ob ON ob.visit_id=v.id AND ob.version=v.observation_version
        LEFT JOIN LATERAL (SELECT * FROM decisions x WHERE x.visit_id=v.id ORDER BY x.timestamp DESC LIMIT 1) d ON true
        LEFT JOIN proposals p ON p.id=d.proposal_id
        WHERE v.data_source='synthetic' AND o.recorded_at>now()-interval '30 days'
          AND ((o.disposition IN ('ADMITTED','DIED') AND o.priority_at_disposition='GREEN')
            OR (o.disposition='DISCHARGED' AND o.priority_at_disposition IN ('RED','ORANGE','YELLOW')))
        ORDER BY o.recorded_at DESC LIMIT 20`)).rows.map((r) => ({
          visitId: r.id, type: r.disposition === 'DISCHARGED' ? 'OVER_TRIAGE' : 'UNDER_TRIAGE', age: r.age, complaint: r.complaint,
          vitals: r.vitals, tews: r.tews === null ? null : Number(r.tews), aiProposed: r.ai_proposed ?? null,
          clinicianDecision: r.decision ?? null, decisionReason: r.reason ?? null, approvedLevel: r.priority_at_disposition, outcome: r.disposition }))),
    },
  };

  const readTools = kind === 'HANDOVER' ? handover : quality;
  const saveName = kind === 'HANDOVER' ? 'save_handover' : 'save_quality_review';
  const trace = async (tool: string, inputs: unknown, outputs: unknown, started: number) =>
    db.query('INSERT INTO report_traces(id,report_id,step,tool,inputs,outputs,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [id('RTRACE'), reportId, ++step, tool, JSON.stringify(inputs), JSON.stringify(outputs), Math.round(performance.now() - started)]);
  const respond = (output: any) => ({ content: [{ type: 'text' as const, text: JSON.stringify(output) }], isError: Boolean(output?.error) });

  for (const [name, tool] of Object.entries(readTools)) {
    server.registerTool(name, { description: tool.description, inputSchema: z.object({}).strict() }, async (args: any) => {
      const started = performance.now(); let output: any;
      try { output = await tool.run(args); } catch (error) { output = { error: error instanceof Error ? error.message : 'Tool failed' }; }
      await trace(name, args, output, started);
      return respond(output);
    });
  }
  server.registerTool(saveName, {
    description: kind === 'HANDOVER'
      ? 'Save the handover note as a draft for the incoming nurse to acknowledge. Changes no patient, priority or queue.'
      : 'Save the quality review findings as a draft for the triage committee. Changes no patient, priority or protocol.',
    inputSchema: z.object({ text: z.string().min(20).max(4000) }).strict(),
  }, async (args: any) => {
    const started = performance.now();
    saved = args.text;
    const output = { saved: true, status: 'DRAFT_FOR_HUMAN_REVIEW' };
    await trace(saveName, { text: args.text }, output, started);
    return respond(output);
  });

  const client = new Client({ name: 'afyaflow-report-agent', version: '0.1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  return {
    client, saveName, allowed: [...Object.keys(readTools), saveName],
    saved: () => saved, patientIds: () => [...patientIds],
    traceModel: (output: unknown, inputs: unknown, started: number, tool: string) =>
      db.query('INSERT INTO report_traces(id,report_id,step,tool,inputs,outputs,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [id('RTRACE'), reportId, 1000 + (++step), tool, JSON.stringify(inputs), JSON.stringify(output), Math.round(performance.now() - started)]),
    close: async () => { await client.close(); await server.close(); },
  };
}

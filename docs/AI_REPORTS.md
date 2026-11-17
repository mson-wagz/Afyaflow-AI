# AI reports: shift handover and quality review

A second AfyaFlow agent drafts reports that people then review. It uses the same model
provider, hourly AI limits, tool allowlist, step and time limits, and tracing as the triage
agent. Its MCP tools (`services/mcp/report-tools.ts`) only read synthetic workflow data, except
one save tool that stores the draft text on its own report. **No report can change a patient,
a priority, a protocol or the queue.**

## Shift handover (Hospital Queue)

For nurses, clinicians and doctors. **Prepare handover** runs the agent:

| Tool | Returns |
| --- | --- |
| `get_unseen_patients` | Open patients not yet seen, most urgent level first, with minutes waited and whether past their SATS target |
| `get_pending_decisions` | AI proposals awaiting a clinician decision |
| `get_rechecks` | Open recheck tasks with owner, due time and whether overdue |
| `get_shift_activity` | Last 12 hours: arrivals, decisions, outcomes by type, SMS alerts sent |
| `save_handover` | Stores the draft note |

The note lists patients needing attention now, decisions awaiting review, rechecks due and a
one-line shift summary. **The incoming staff member acknowledges it**: the person who prepared a
handover cannot acknowledge it. The handover names patients, so viewing it is recorded in the
access log.

## Quality review of mis-triaged cases (Operations)

For clinicians, doctors and administrators. **Run quality review** runs the agent with:

| Tool | Returns |
| --- | --- |
| `get_triage_metrics` | Over- and under-triage for visits closed in the last 30 days (KNH study formulas) and KNH's baseline |
| `get_mistriage_cases` | Up to 20 closed cases where level and outcome disagreed (Green admitted or died; Red, Orange or Yellow discharged), with vital signs, TEWS, AI proposal, clinician decision and reason, and outcome. **Visit IDs only, no names.** |
| `save_quality_review` | Stores the draft findings |

The findings describe the metrics against KNH's baseline, what each case's record shows, and
neutral questions for the triage committee. The agent is told never to judge individual staff,
diagnose or change protocols. A reviewer marks the draft as reviewed.

## Safety and records

- **API:** `POST /api/reports/handover` or `/api/reports/quality-review` runs the agent;
  `GET /api/reports/:kind/latest`; `POST /api/reports/:id/acknowledge` with an optional note.
- **Limits:** each run counts against the hourly AI limits. Tools outside the allowlist, more
  than four tool calls in one step, the step limit, the time limit or finishing without saving
  all end the run as **FAILED**, with no report text.
- **Records:** `agent_reports` holds each draft (its text cannot be edited once saved);
  `report_traces` holds every model and tool call with its usage (append-only). The card shows
  model calls, tool calls, tokens and cost. Audit events: `REPORT_REQUESTED`, `REPORT_READY`,
  `REPORT_FAILED`, `REPORT_ACKNOWLEDGED`.

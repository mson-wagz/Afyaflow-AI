# Agent orchestration

`workflow.ts` implements a LangGraph model/tool loop backed by PostgreSQL jobs.
`bedrock.ts` uses the AWS SDK Converse API and the standard credential chain.
The hosted model selects the run-scoped MCP tools, receives their actual outputs,
and saves a pending proposal. It cannot supply an urgency code or approve a visit.
The deterministic fixture scorer is authoritative for the proposed priority.

The graph ends after proposal persistence and the run is marked WAITING_FOR_REVIEW
or REVIEW_REQUIRED. This human pause is durable domain state in PostgreSQL; it is
not a LangGraph in-memory interrupt/checkpoint. A separate authenticated HTTP
approval transaction commits the clinician's decision and approved queue change.

Defaults: at most eight model rounds, four tool calls per round, two attempts per
tool, 90-second inference deadline and 15-second MCP call deadlines. Failures are
recorded for staff review. Model responses, token usage, tool inputs/outputs and
measured durations are stored in tool_traces. The frontend displays actual traces.

The tested model is `eu.amazon.nova-lite-v1:0` in `eu-west-1`. Configuration may
select another Bedrock Converse model with tool support. No Ollama dependency or
local model download is required. Run backend tests for deterministic harness
verification and see EVALS.md for the separately executed live Bedrock run.

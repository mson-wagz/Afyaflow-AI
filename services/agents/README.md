# Agent orchestration

`workflow.ts` implements a LangGraph model/tool loop backed by PostgreSQL jobs.
`bedrock.ts` uses the AWS SDK Converse API and the standard credential chain.
The configured model selects the run-scoped MCP tools, receives their actual outputs,
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
An early text-only finish before persistence receives at most one tool-use reminder,
within the same round/deadline budget. Another early finish fails closed.

Providers are Bedrock Converse, OpenAI Responses and local Ollama native tool calling.
The AWS research deployment uses OpenAI; competition mode requires Ollama with a
separate synthetic-only database. See [competition setup](../../docs/COMPETITION.md).
The Ollama adapter binds requests to loopback, rejects redirects and unknown tool
calls, preserves tool-result names, records usage, and has no hosted fallback.
Run `npm run test:competition:live` for a real local-model proof; ordinary CI uses
controlled model doubles and does not download weights or incur inference charges.

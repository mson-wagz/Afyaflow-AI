# Run-scoped patient tools

The custom MCP server exposes `get_observations`, `read_protocol`, `score_protocol`,
`get_reassessment_context` and `save_pending_proposal`. Every server instance is bound to one active run and
its immutable observation version; model arguments cannot select another patient,
write observations, set a priority, approve a decision or transfer a visit.

The NestJS worker connects through a linked in-memory MCP transport, so the actual
MCP SDK validates and dispatches tool calls without an unauthenticated network
listener. `npm run start:mcp` is an optional stdio transport for a trusted local
process and requires `AFYAFLOW_AGENT_RUN_ID` for an active leased run. Do not expose
it to untrusted clients with application database credentials.

`borrowed-protocol.ts` starts the official filesystem MCP reference server and calls
only `read_text_file` on the fixed synthetic fixture. The model sees a zero-argument
read_protocol wrapper, not general filesystem tools. The underlying reference
server supports writes, so directory restrictions alone are not a write ban. The
container makes the protocol directory non-writable to its runtime user; local
Windows development relies on the host allowlist and exposes no write tool to the
model. An external deployment must retain both controls.

The fixture's name, version, required fields, observation ID/version, rule citations
and deterministic score are stored in the proposal. It is not an approved SATS
resource. Missing required values and unsupported ages produce staff review with
no guessed urgency. The model may add a summary, but that summary cannot change
the score or evidence persisted by the tool.

Synthetic observation reads include a bound reassessment context: latest/previous snapshot
IDs and versions, recorded-change flags, and explicit limits. The dedicated context tool
can retrieve the same evidence. Historical records receive no follow-up context. Saving
an incomplete or changed synthetic assessment atomically saves a pending follow-up with
its immutable evidence and an audit event. It cannot set an owner or due time. Scheduling,
acknowledgement, reassignment, cancellation and completion belong to authenticated clinical
HTTP actions, outside the model's MCP allowlist. Completion requires newer observations.

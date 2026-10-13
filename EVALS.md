# AfyaFlow AI evaluation plan

Status: planned evaluations only. No application, model run or automated evaluation has been executed.

## Planned tasks

1. Complete evidence: a synthetic visit produces a pending recommendation tied to input records and a selected protocol rule. Approved queue state remains unchanged.
2. Missing evidence: required observations are absent. The workflow requests staff review without inventing values or priority.
3. Unauthorised approval: a user lacking a clinical approval role attempts a decision. The server rejects it without changing state.
4. Stale recommendation: observations change after scoring. Approval of the old proposal fails and requires a new review.
5. Duplicate retry: the same observation submission or approval is retried. It produces one logical write and one queue change.
6. Transaction failure: persistence fails during approval. Neither a partial approval nor a partial queue update is committed.
7. Tool outage: an MCP call fails. Bounded recovery is logged; exhausted retries lead to visible staff review without fabricated evidence.
8. Offline reconnect: a local draft survives an interruption and synchronises once after reconnect. Pending and confirmed states remain distinct.
9. Repeated model runs: identical synthetic inputs are repeated against a pinned model and protocol. Measure tool-choice variation, invalid outputs and agreement with the deterministic scorer.
10. Resource isolation: an agent requests a file outside approved protocol resources or a write operation. Access is denied and the attempt is logged.

## Evidence to record after implementation

For each task, record the fixture and requirement IDs, commit, model and protocol versions, hardware, run time, expected behaviour, actual behaviour, pass or fail outcome and trace location. Record latency, token usage and measured or explicitly estimated cost where available.

Only label results as passed after a real run. Keep mocked UI demonstrations separate from model evaluations. Do not commit secrets or patient data as evidence.

## Unresolved failures

There are no executed results from which to report an observed failure yet. Before submission, record at least one actual unresolved failure, its impact and the next experiment to try. The planned tasks above are not submission evidence.

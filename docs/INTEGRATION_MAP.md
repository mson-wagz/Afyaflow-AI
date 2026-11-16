# Integration map

What AfyaFlow is connected to today, marked **live** (real calls in the demo),
**sandbox** (real calls to a provider's test environment) or **planned** (not built or not
connected). Nothing below is simulated and presented as live.

```
 Triage nurse (browser)                                     Hospital systems
   │  register · observations · approve / override             ▲  FHIR R4 export (live API,
   ▼                                                           │  no receiver connected yet)
 AfyaFlow server (NestJS, PostgreSQL) ──────────────────────────┘
   │  queues an assessment job
   ▼
 Agent (LangGraph) ──► Amazon Bedrock, Nova Lite (live)
   │  chooses and chains tools via MCP
   ├─► AfyaFlow MCP server (live): get_observations · read_protocol ·
   │      get_reassessment_context · score_protocol · save_pending_proposal
   └─► Official MCP filesystem server (live, read-only): protocol file
 Escalation ──► SMS gateway, Africa's Talking (sandbox) ──► on-call clinician's phone
```

## Status

| Integration | Status | What it does | Credentials |
| --- | --- | --- | --- |
| Amazon Bedrock, Nova Lite (eu-west-1) | **Live** | Model that plans the assessment and chooses tools | Server's AWS instance role; no keys on the host |
| AfyaFlow MCP server | **Live** | Five tools: read versioned observations, read the protocol, read reassessment context, deterministic scoring, save a pending proposal | Bound to one run; cannot approve or change the queue |
| Official MCP filesystem server | **Live** | Reads the protocol file, read-only | Limited to the protocol directory |
| PostgreSQL | **Live** | Records, jobs, decisions, audit and access logs | Server-only password |
| Local speech recognition (Whisper tiny, in the browser) | **Live** | Voice intake in English and Swahili, reviewed by staff before saving | None: runs on the device |
| Local model, Ollama + Qwen3 0.6B | **Live option** | Same agent with no per-token fee and no data leaving the server | None |
| FHIR R4 export (`GET /api/visits/:id/fhir`) | **Live API, no receiver** | Sends a visit to a hospital system in a standard format | Staff session; access-logged |
| SMS escalation, Africa's Talking | **Sandbox** | Texts the on-call clinician when a Level 1 patient passes target unseen | API key in server environment only |
| KNH hospital information system | **Planned** | Receive FHIR bundles; send patient registration | Needs KNH ICT agreement and credentials |
| SHA / Taifa Care HMIS and client registry | **Planned** | Patient identity and claims context | Needs Digital Health Agency onboarding |
| WhatsApp, USSD | **Planned** | Patient queue updates without a smartphone app | Needs provider account and consent design |
| KHIS (DHIS2) reporting | **Planned** | Monthly triage indicators | Needs Ministry access |

## A live run, step by step

What the run trace screen shows for one assessment:

1. Staff register a patient or record observations. AfyaFlow saves a new observation version
   and queues an assessment job.
2. **Model call 1** (Bedrock) asks for `get_observations` → the MCP server returns that
   version's measurements, never any other patient's.
3. **Model call 2** asks for `read_protocol` → read through the official filesystem MCP server.
4. **Model call 3** asks for `score_protocol` → deterministic TEWS score and SATS level; the
   model cannot change it.
5. **Model call 4** asks for `save_pending_proposal` → a proposal is saved, pending.
6. **Human approval:** a nurse or clinician approves, overrides or rejects with a reason. Only
   then does the queue change. Everything is in the audit trail.

## When something fails

| Failure | What happens |
| --- | --- |
| A tool errors or times out (15 s limit) | Retried once; the error is shown to the model and recorded in the trace |
| The model asks for a tool outside the allowlist, or too many at once | The run stops and the patient is flagged for manual triage |
| The model finishes without saving a proposal | One reminder; if it still does not save, the run ends in staff review |
| The whole run exceeds 90 s or 8 model calls | The run stops; staff review, never an invented priority |
| Observations change during a run | The result is refused as stale and a new assessment is queued |
| Hourly AI limit reached | Clinical writes continue; the assessment is marked for manual triage |
| Server or network down | Paper SATS forms; browser drafts sync on reconnect |
| SMS gateway fails | Retried a limited number of times and shown on the dashboard; the queue alert still shows on screen |

## Human approval and credentials

- **Needs a human:** every triage priority (approve, override, reject), every outcome, every
  transfer, every "see first" choice, and every account change. The AI can only propose.
- **Credentials:** AWS access through the server's instance role; the database password and
  SMS API key only in the server's environment file, never in the browser or the repository.
  The SMS message contains no patient name.

## Connecting to KNH's system next week

The FHIR export is already running. To connect: (1) agree with KNH ICT which system receives
closed visits, (2) run a small relay at the hospital that collects new bundles and posts them
to the hospital system's FHIR or HL7 interface, (3) test with synthetic records, then (4) go
live once the regulatory checklist items for data exchange are complete.

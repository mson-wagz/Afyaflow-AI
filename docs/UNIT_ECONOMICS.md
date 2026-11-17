# Unit economics and team fact sheet

Figures for the African Agentic AI Design Challenge unit economics framework. Every measured
number traces to stored model-call logs; every price comes from the official AWS Price List
API. Anything assumed is marked **assumption**, and figures only the team can supply are
marked **to supply**.

## How to verify in the demo

- **One run:** Triage & Prioritisation → *View Run Trace* shows model calls, tool calls,
  input and output tokens and the cost of that run, with each step in order.
- **Totals:** Operations → *AI cost to serve* shows tokens per answer, model calls per
  assessment (average and worst), and cost per completed triage for today, 7 or 30 days.
- **Provider records:** AWS Billing / Cost Explorer, service *Amazon Bedrock*, shows the
  same Nova Lite token usage billed by AWS.

## Measured usage

Source: every model call of the 11 Amazon Nova Lite assessments recorded on 13–14 October
2026 (`tool_traces`, provider-reported usage; synthetic patients; protocol demo-v1;
eu-west-1). All 37 model calls reported usage.

| Measure | Value |
| --- | --- |
| Model | Amazon Nova Lite (`eu.amazon.nova-lite-v1:0`), Amazon Bedrock, EU (Ireland) |
| Price per 1M tokens | **$0.069 input / $0.276 output** (AWS Price List API, on-demand, retrieved 16 Nov 2026) |
| Tokens per answer (one model call) | **1,540 input + 92 output** (average) |
| Model calls per assessment | **3.4 average, 4 worst** observed (hard limit 8) |
| Tokens per assessment | 5,180 input + 308 output average; up to 5,384 input and 430 output |
| Time per assessment | about 7–10 s typically; up to 31 s when the run ends in staff review |
| Assessments per completed triage | 1.83 in these logs (includes failed and repeated test runs; a conservative figure) |

A **completed outcome** is one clinician decision on an AI proposal (a completed triage).

## Cost per completed outcome

```
Cost per answer      = 1,540 × $0.069/1M + 92 × $0.276/1M        = $0.000132
Cost per assessment  = 5,180 × $0.069/1M + 308 × $0.276/1M       = $0.000442
AI cost per triage   = all model cost ÷ completed triages
                     = $0.004866 ÷ 6                             = $0.000811
Hosting per triage   = monthly hosting ÷ completed triages per month
Cost per triage      = AI cost per triage + hosting per triage
```

Hosting (AWS Price List API, eu-west-1, on-demand, 730 hours a month):

| Server | Compute | Disk (gp3, $0.088/GB-month) | Public IPv4 ($0.005/h) | Monthly |
| --- | --- | --- | --- | --- |
| t4g.small, 2 GB (today) | $0.0184/h = $13.43 | 20 GB = $1.76 | $3.65 | **$18.84** |
| t4g.medium, 4 GB | $0.0368/h = $26.86 | 40 GB = $3.52 | $3.65 | **$34.03** |
| t4g.xlarge, 16 GB | $0.1472/h = $107.46 | 100 GB = $8.80 | $3.65 | **$119.91** |

### At pilot, 10× and 100× volume

**Assumption:** a pilot of 3,000 completed triages a month (about 100 a day at one A&E).
Replace it with KNH's actual daily triage volume.

| Volume (completed triages a month) | Server | AI per triage | Hosting per triage | **Cost per triage** |
| --- | --- | --- | --- | --- |
| Pilot: 3,000 | t4g.small | $0.000811 | $0.00628 | **$0.0071** |
| 10×: 30,000 | t4g.medium | $0.000811 | $0.00113 | **$0.0019** |
| 100×: 300,000 | t4g.xlarge | $0.000811 | $0.00040 | **$0.0012** |

**Cost curve:** model cost is linear (about $0.0008 per triage at any volume); hosting is
largely fixed, so cost per triage falls by about 6× from pilot to 100×. Server sizes for
10× and 100× are planning assumptions, not load-tested.

**Margin per triage = price − cost per triage.** The price is for the team to set (below).

### Levers to reduce cost

- **Fewer model calls:** the agent already runs a fixed tool sequence (observations, protocol,
  score, save); most runs need 3–4 calls. Removing the duplicate protocol read seen in some
  runs saves about one call.
- **Prompt caching:** most input tokens are the repeated tool definitions and instructions.
  Nova Lite cache reads cost $0.01725 per 1M tokens (AWS Price List API, eu-west-1), a quarter
  of the normal input price.
- **Local model:** with `AI_PROVIDER=ollama` (Qwen3 0.6B) there is no per-token fee and data
  stays on the server (`DATA_RESIDENCY=kenya`). It needs at least a 4 GB server ($34.03 a
  month, so $0.0113 per triage at pilot volume); CPU throughput at high volume is not yet
  benchmarked.
- **Reserved or savings-plan pricing** for the server once volume is steady.

### Not included

SMS escalation fees (only for exceptions such as an unseen Level 1 patient past target; see
[INTEGRATION_MAP.md](INTEGRATION_MAP.md)), S3 backup storage and data transfer (cents a
month at pilot), support, training and the facility's own staff time. Human review adds no
reviewer: the triage nurse who decides today makes the decision.

## Team fact sheet

| Figure | Team's number | How to verify |
| --- | --- | --- |
| Model(s) and price per 1M input/output tokens | Nova Lite, $0.069 / $0.276 (eu-west-1); local Qwen3 0.6B, $0 | Run trace price line; AWS Price List API |
| Tokens per answer (input + output) | 1,540 + 92 | Run trace counter; dashboard *Tokens per answer* |
| Model calls per completed outcome | 3.4 per assessment (worst 4); 1.83 assessments per completed triage in logs | Dashboard *Model calls per assessment* |
| Tool, SMS, API and hosting fees per outcome | Hosting $0.0063 at pilot volume; MCP tools run on the same server (no fee); SMS only for exceptions | Hosting table above |
| **Cost per completed outcome (USD)** | **$0.0071 at pilot; $0.0019 at 10×; $0.0012 at 100×** | Dashboard *Cost per completed triage* |
| User's cost today for the same outcome | **To supply** from KNH: nurse time per triage, and the cost of over-triage (62.3% at KNH) and under-triage (7.8%) | — |
| Price, and who pays | **To supply** | — |
| Margin per outcome at pilot / 10× / 100× | Price − $0.0071 / $0.0019 / $0.0012 | — |

## What the team still needs to bring

These cannot come from the software. Without them, criteria 4 and 5 score low however good
the costs are.

1. **User's cost today**, from KNH triage nurses and the A&E lead: minutes per triage, how
   often patients wait past their SATS target, and what over-triage costs (resuscitation and
   urgent capacity used by patients who go home).
2. **Who pays and from which budget**, for example the hospital's ICT or quality budget, or
   a certified hospital-system vendor bundling AfyaFlow. Do not assume government adoption
   without a procurement route.
3. **Evidence of willingness to pay**: notes from price conversations, pilot interest, or a
   letter of intent.
4. **A named next adopter** after KNH, ideally someone already spoken to.

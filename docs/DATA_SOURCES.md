# Data sources and research use

AfyaFlow has two separate data areas: de-identified historical research cases
from MIMIC-IV-ED Demo, and synthetic registration/triage/queue demonstrations.
Neither area is a live hospital service or a clinically validated system.

## MIMIC-IV-ED Demo v2.2

Source: [PhysioNet dataset page](https://physionet.org/content/mimic-iv-ed-demo/2.2/).
The parent database contains emergency-department records from Beth Israel
Deaconess Medical Center in Boston, USA, covering 2011–2019. The public demo
is de-identified historical clinical data. It is distinct from the larger,
credential-restricted MIMIC-IV-ED release; AfyaFlow downloads only the open demo.

The demo was constructed from a selected 100-patient cohort. **The actual two
ED files bundled in this version contain 222 ED stays from 64 distinct source
patients**, with one triage row per stay. Fifteen stays have no recorded ESI
label. Do not describe this import as 100 current patients or a representative
population sample. These counts are checked against the bundled source files.

Included files are `ed/edstays.csv.gz`, `ed/triage.csv.gz`, and the original
`LICENSE.txt`. They are retained unmodified under
[`data/mimic-iv-ed-demo-2.2`](../data/mimic-iv-ed-demo-2.2/).
The published [SHA-256 checksums](https://physionet.org/files/mimic-iv-ed-demo/2.2/SHA256SUMS.txt)
are pinned in the fetcher and loader. Imports reject changed/corrupt files.
Diagnoses, medications, later vital-sign time series, and the linked hospital
demographics tables are not imported.

## Mapping and provenance

The importer joins `edstays` to `triage` using `stay_id`, verifies matching
`subject_id`, and rejects duplicate/unmatched identifiers. One stay becomes one
historical case; repeated stays by the same source patient remain separate.
Application case IDs are deterministic hashes of the dataset version and stay
ID. Display names such as “Historical case …” are labels, not patient names.

- `chiefcomplaint` becomes the displayed complaint. Blank complaints are
  labelled “Not recorded in source”; this is a placeholder, not an observation.
- `heartrate`, `sbp`, `dbp`, `resprate`, and `o2sat` map to heart rate, systolic
  and diastolic blood pressure, respiratory rate, and oxygen saturation.
- `temperature` is documented as Fahrenheit. Celsius is calculated as
  `(F − 32) × 5 / 9`, rounded to two decimal places. Source documentation warns
  that units can be miscoded. We do not guess an alternative unit. Values that
  fail AfyaFlow's entry-range checks are omitted from normalized observations
  and flagged; the unchanged value remains in the original row. Passing these
  checks does not establish physiological validity or clinical normality.
- Blank numeric observations stay absent. There is no imputation. Age is null;
  AVPU and mobility are absent because the two ED tables do not provide them.
  Arrival transport, complaint text, gender, or an ESI label cannot substitute
  for those missing fields.
- Source `acuity` is retained separately as the nurse-recorded **ESI 1–5** label
  (1 highest urgency). Pain remains source reference data. ESI is not mapped to
  AfyaFlow's colour priorities, and no ESI-versus-SATS accuracy claim is made.
- Source dates are shifted for de-identification and have no timezone metadata.
  They are displayed verbatim as shifted source references. Triage has no exact
  observation timestamp. Application arrival/observation timestamps record the
  import, not the original clinical event, and are not used as waiting times.
- Both original joined rows, transformation version, warnings, dataset/version,
  and source identifiers are retained for inspection and export. This includes
  source outcome fields in the raw view; these are not model inputs.

See the original [triage schema and unit definitions](https://mimic.mit.edu/docs/iv/modules/ed/triage.html)
and [parent dataset de-identification description](https://physionet.org/content/mimic-iv-ed/2.2/).

## Separation and AI use

Historical cases are tagged `mimic-iv-ed-demo`, read-only, and excluded from
registration visit lists, the hospital queue, clinical approval lists,
deterioration review, and routing. Backend guards reject edits, approvals,
overrides, escalations and transfers; database constraints also prevent an
approved research priority or department assignment. Existing synthetic records
are preserved and remain labelled as demonstrations.

Importing data does not queue inference. A nurse/clinician explicitly requests
an **AI research review** for one case. The existing leased agent run and four
MCP tools retrieve the bound normalized evidence and demonstration protocol,
score evidence deterministically, and save a research proposal. The original
ESI label, pain, raw rows, disposition, and source patient/stay identifiers are
excluded from the model evidence. App-generated visit/observation references,
source type, complaint, missing age, normalized observations and import-time
context are available to the model. Complaints/tool outputs remain untrusted
data, not instructions.

The configured provider receives that evidence. The deployed OpenAI adapter
uses the Responses API with `store:false`; this does not imply that all
provider-side retention is disabled. There is no model training or fine-tuning
in this integration. Requests use the existing time/tool/token budgets and may
incur inference charges. Provider failures are recorded without automatic
fallback. Already saved reviews are reused; failed runs can be explicitly
retried.

Because age and AVPU are unavailable, the present adult fixture must report
incomplete evidence, a null score/priority, and `REVIEW_REQUIRED`. Real source
data does not validate that fixture. This small US sample cannot establish
safe clinical performance in Kenya, local calibration, or health outcomes.

## Reproduce, import and export

```sh
npm ci
node scripts/fetch-mimic-demo.mjs
npm run db:migrate
npm run db:import:mimic
npm run --silent dataset:export:mimic > mimic-demo-adapted.json
```

The fetch step is optional when the checked-in files are present. It always
uses fixed public URLs and verifies their checksums. Configure `DATABASE_URL`
for migration/import. Import is transactional, serialized and idempotent: a
repeat does not overwrite source evidence, existing reviews or synthetic data.
It creates a non-interactive system import actor with a random secret, not a
public staff login. Import does not require synthetic seeding or create queues.

EC2 releases import the bundled data after migrations. Local installs run the
command above. The Lambda image includes the same data; importing it into a
Lambda-backed database requires an operator command with database connectivity.
The normal synthetic `db:seed` remains separate.

After sign-in, **Historical Research Cases → Download adapted dataset (JSON)**
provides the imported data, original rows, transformations and attribution via
`GET /api/research/export`. The export contains only historical research cases;
it excludes synthetic visits, staff, sessions, secrets, audits and AI traces.
The CLI export reproduces the normalized dataset without a database. These
exports and dataset adaptations are available under **ODbL 1.0**. Keep the
attribution and licence notice when sharing them; observe its share-alike
requirements for derivative databases. The dataset licence is separate from
application source-code licensing.

## Attribution

Contains information from MIMIC-IV-ED Demo v2.2, made available under the
[Open Data Commons Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
The [original licence](../data/mimic-iv-ed-demo-2.2/LICENSE.txt) is included.
AfyaFlow modifications are the join, display aliases, normalized observations,
quality flags, and provenance described above. The public source files and
complete transformation implementation are included in this repository.

Dataset: Johnson, A., Bulgarelli, L., Pollard, T., Celi, L. A., Horng, S., &
Mark, R. (2023). *MIMIC-IV-ED Demo (version 2.2).* PhysioNet.
RRID:SCR_007345. https://doi.org/10.13026/jzz5-vs76

Parent: Johnson, A., Bulgarelli, L., Pollard, T., Celi, L. A., Mark, R., &
Horng, S. (2023). *MIMIC-IV-ED (version 2.2).* PhysioNet.
https://doi.org/10.13026/5ntk-km72

Platform: Pollard, T., et al. (2026). *PhysioNet as a global platform for
biomedical research.* Nature Health. https://doi.org/10.1038/s44360-026-00096-z

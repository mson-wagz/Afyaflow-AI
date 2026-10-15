# Competition runtime

The AWS site remains the **research deployment**, including its separately labelled MIMIC library. Competition mode is a different runtime with synthetic records only and local inference. Do not point it at the research database. This mode does not make the prototype clinically validated or establish competition eligibility by itself.

## Local setup

1. Install Ollama from its official distribution. Disable its cloud features with `OLLAMA_NO_CLOUD=1`, bind `OLLAMA_HOST=127.0.0.1:11434`, then run `ollama serve` locally. Download the model with `ollama pull qwen3:0.6b`.
2. Create a fresh PostgreSQL database. Set `DATABASE_URL` to this database, `APP_MODE=competition`, `AI_PROVIDER=ollama`, `OLLAMA_URL=http://127.0.0.1:11434`, `OLLAMA_MODEL=qwen3:0.6b`. Environment variables override the ignored root `.env`. Do not copy AWS keys or OpenAI keys into the competition environment.
3. Run `npm ci`, `npm ci --prefix src/frontend`, `npm run db:migrate`, then `npm run db:seed`. Production seeding additionally requires `ALLOW_SYNTHETIC_SEED=true`. All seeded patients and staff are fictional.
4. Build the frontend with `VITE_APP_MODE=competition` set in your shell: `npm run build --prefix src/frontend`. Run `npm run dev:backend`; the backend serves the built frontend. For frontend development set the same variable before running Vite.
5. On a local database, run `npm run test:competition:live`. This creates and drops only its own random proof schema, runs the real model and both MCP servers, checks the human approval gate, and writes an ignored trace to `.local/competition-model-proof.json`. It makes no hosted inference requests.

The model tag must refer to downloaded local weights. Preserve the digest from the proof report with the submission; tags can change. Qwen3-0.6B's upstream weights use Apache-2.0 ([model card](https://huggingface.co/Qwen/Qwen3-0.6B)); the quantized Ollama distribution and runtime have separate notices. Check those notices when redistributing weights. Model download, RAM and CPU time are required; inference has not been benchmarked alongside the database and API on the existing 2 GB AWS host. No additional AWS infrastructure is provisioned.

## Executed local proof (15 October 2026)

Ollama 0.40.4, Qwen3 `0.6b`, model digest `7df6b6e09427a769808717c0a93cadc4ae99ed4eb8bf5ca557c90846becea435`, Windows CPU, 16 GB installed RAM (about 1.3 GB available before loading). One synthetic complete-evidence case passed the actual LangGraph/MCP workflow and staff approval transaction in 17,507 ms, including database migration and seeding. No hosted model was used. This is one engineering smoke run, not a reliability or clinical-accuracy benchmark. The complete ignored trace is `.local/competition-model-proof.json`; rerun the command to measure your own setup. The larger 4B model was not benchmarked because available memory was limited.

A second initial run ended without saving a proposal and correctly failed closed. After making the tool sequence explicit and adding at most one reminder within the existing model-round/deadline budget, three fixed repeat runs all passed (19,610 ms, 9,841 ms, 10,562 ms). One needed three model rounds and two needed two. This small sample does not establish reliability. A repeated early finish, tool error, timeout or refusal still requires staff review; there is no hosted fallback. The smoke runner also saves `.local/competition-model-proof-failure.json` on failure before dropping its temporary schema.

## Enforcement

- Hosted providers, non-loopback model endpoints, redirects and cloud-tagged models are rejected. There is no provider fallback.
- Startup refuses a database containing historical visits or previous hosted-provider runs. Use a fresh database rather than deleting research records.
- Research list, detail and export endpoints are unavailable. Historical import and CLI export are blocked.
- Run-bound MCP tools check both the source record and pinned provider before retrieving evidence.
- Build a data-free image with `docker build --target competition --build-arg APP_MODE=competition -t afyaflow-competition .`. The competition target contains no bundled MIMIC source files. Native Ollama runs on the same host; use host networking on a supported Linux setup so loopback reaches it. The standard image and AWS release remain research builds.

These guards prevent accidental use of the bundled research dataset. Free-text intake still requires the operator to enter fictional information only; the app cannot prove that arbitrary user-entered text is synthetic.

## Scoring limitation

The scorer is a synthetic workflow fixture, not a validated implementation of SATS. Its metadata now states this consistently. It does not implement the complete published SATS discriminator charts or all populations. Published clinical protocols must be mapped, licensed as needed, and reviewed with a qualified clinician before clinical deployment. Model-generated thresholds are prohibited. A local model demonstration is engineering evidence, not clinical validation.

Tool-calling implementation follows the [native Ollama API](https://docs.ollama.com/capabilities/tool-calling).

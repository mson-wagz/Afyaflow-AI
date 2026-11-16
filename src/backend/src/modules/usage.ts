/* ------------------------------------------------------------------ */
/* Token usage and cost-to-serve (docs/UNIT_ECONOMICS.md)              */
/* ------------------------------------------------------------------ */
// Every figure comes from the usage each model provider returned, as stored in tool_traces
// (one row per model call, step >= 1000). Prices are configuration, never guessed per call.

/** Trace tool names that record one model call (see services/agents/*). */
export const MODEL_CALL_TOOLS = ['bedrock_converse', 'ollama_chat', 'openai_responses'];

export type Price = { inputUsdPerMillion: number; outputUsdPerMillion: number; source: string };

/**
 * Official on-demand prices, from the AWS Price List API (service AmazonBedrock, region
 * eu-west-1, usage types EU-NovaLite-input-tokens / EU-NovaLite-output-tokens), retrieved
 * 16 November 2026: $0.000069 and $0.000276 per 1,000 tokens.
 */
const KNOWN_PRICES: Record<string, Price> = {
  'eu.amazon.nova-lite-v1:0': { inputUsdPerMillion: 0.069, outputUsdPerMillion: 0.276,
    source: 'AWS Price List API, Amazon Nova Lite on-demand, EU (Ireland), retrieved 2026-11-16' },
};

/**
 * Monthly hosting for the staging stack, from the AWS Price List API (eu-west-1, retrieved
 * 16 November 2026): t4g.small $0.0184/h × 730 h = $13.43; 20 GB gp3 × $0.088 = $1.76;
 * public IPv4 $0.005/h × 730 h = $3.65. Total $18.84. Excludes small S3 backup and transfer fees.
 */
export const DEFAULT_HOSTING_USD_PER_MONTH = 18.84;

const envNumber = (name: string) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number.`);
  return value;
};

/** Price for a run's model. Local models have no per-token fee; unknown hosted models have no price. */
export function priceFor(provider: string, model: string): Price | null {
  const input = envNumber('MODEL_INPUT_USD_PER_MILLION'), output = envNumber('MODEL_OUTPUT_USD_PER_MILLION');
  // An operator price applies only to the model it names (PRICED_MODEL), e.g. a newly priced or renegotiated model.
  if (input !== undefined && output !== undefined && process.env.PRICED_MODEL && model === process.env.PRICED_MODEL)
    return { inputUsdPerMillion: input, outputUsdPerMillion: output, source: 'Operator configuration (MODEL_*_USD_PER_MILLION)' };
  if (provider === 'ollama') return { inputUsdPerMillion: 0, outputUsdPerMillion: 0, source: 'Local model: no per-token fee (hosting counted separately)' };
  return KNOWN_PRICES[model] ?? null;
}

export const hostingUsdPerMonth = () => envNumber('HOSTING_USD_PER_MONTH') ?? DEFAULT_HOSTING_USD_PER_MONTH;

/** Input and output tokens from any provider's usage object (Bedrock, Ollama or OpenAI shapes). */
export function tokensFrom(usage: any): { input: number; output: number } | null {
  if (!usage || typeof usage !== 'object') return null;
  const input = usage.inputTokens ?? usage.input_tokens ?? usage.prompt_eval_count;
  const output = usage.outputTokens ?? usage.output_tokens ?? usage.eval_count;
  return Number.isFinite(input) && Number.isFinite(output) ? { input: Number(input), output: Number(output) } : null;
}

export const costUsd = (input: number, output: number, price: Price | null) =>
  price ? (input * price.inputUsdPerMillion + output * price.outputUsdPerMillion) / 1e6 : null;

export type CallRow = { tool: string; outputs: any };

/** Usage and cost of one run from its trace rows. Calls without reported usage are counted separately. */
export function runUsage(provider: string, model: string, calls: CallRow[]) {
  const modelCalls = calls.filter((c) => MODEL_CALL_TOOLS.includes(c.tool));
  let input = 0, output = 0, unmetered = 0;
  for (const call of modelCalls) {
    const tokens = tokensFrom(call.outputs?.usage);
    if (tokens) { input += tokens.input; output += tokens.output; } else unmetered += 1;
  }
  const price = priceFor(provider, model);
  const cost = costUsd(input, output, price);
  return {
    modelCalls: modelCalls.length, toolCalls: calls.length - modelCalls.length, inputTokens: input, outputTokens: output,
    unmeteredModelCalls: unmetered, costUsd: cost === null ? null : round(cost), price,
  };
}

export const round = (value: number, digits = 8) => Math.round(value * 10 ** digits) / 10 ** digits;

import React from 'react';

const MODEL_TOOLS = ['bedrock_converse', 'ollama_chat', 'openai_responses'];
const n = (v) => new Intl.NumberFormat('en-KE').format(v);
export const formatUsd = (v) => (v === null || v === undefined ? 'not priced' : v < 0.01 ? `$${v.toFixed(6)}` : `$${v.toFixed(4)}`);
const tokensOf = (usage) => {
  const input = usage?.inputTokens ?? usage?.input_tokens, output = usage?.outputTokens ?? usage?.output_tokens;
  return Number.isFinite(input) && Number.isFinite(output) ? { input, output } : null;
};

/**
 * Readable agent run log: a token and cost counter, then each model call and tool call in order
 * (what the model asked for, what each tool returned, how long it took). The raw JSON stays
 * available below for audit.
 */
export default function RunTrace({ trace }) {
  const usage = trace.usage;
  let modelStep = 0;
  return (
    <div>
      {usage && (
        <div className="trace-meter" role="group" aria-label="Run usage">
          <span><strong>{n(usage.modelCalls)}</strong> model calls</span>
          <span><strong>{n(usage.toolCalls)}</strong> tool calls</span>
          <span><strong>{n(usage.inputTokens)}</strong> input + <strong>{n(usage.outputTokens)}</strong> output tokens</span>
          <span>Cost <strong>{formatUsd(usage.costUsd)}</strong></span>
        </div>
      )}
      {usage?.price && <p className="trace-note">Price: {usage.price.source}.</p>}
      {usage?.unmeteredModelCalls > 0 && <p className="trace-note">⚠ {usage.unmeteredModelCalls} model call(s) returned no usage figures and are not counted.</p>}
      <ol className="trace-steps">
        {(trace.toolCalls || []).map((call, i) => {
          if (MODEL_TOOLS.includes(call.tool)) {
            modelStep += 1;
            const t = tokensOf(call.outputs?.usage);
            const requested = (call.outputs?.content || []).filter((b) => b.toolUse).map((b) => b.toolUse.name);
            return (
              <li key={i}>
                <strong>Model call {modelStep}</strong> <span className="trace-muted">({call.tool}, {n(call.durationMs)} ms{t ? `, ${n(t.input)} in / ${n(t.output)} out tokens` : ''})</span>
                <div>{requested.length ? `Asked to run: ${requested.join(', ')}` : 'Finished without requesting a tool'}</div>
              </li>
            );
          }
          const failed = call.outputs && typeof call.outputs === 'object' && 'error' in call.outputs;
          return (
            <li key={i}>
              <strong>Tool: {call.tool}</strong> <span className="trace-muted">({n(call.durationMs)} ms)</span>
              <div>{failed ? `⚠ Error: ${call.outputs.error}` : 'Returned successfully'}</div>
              {call.tool === 'save_pending_proposal' && call.inputs?.summary && (
                <div className="trace-summary">AI summary: “{call.inputs.summary}”</div>
              )}
            </li>
          );
        })}
      </ol>
      <details>
        <summary>Raw trace (JSON)</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.8rem' }}>{JSON.stringify(trace.toolCalls, null, 2)}</pre>
      </details>
    </div>
  );
}

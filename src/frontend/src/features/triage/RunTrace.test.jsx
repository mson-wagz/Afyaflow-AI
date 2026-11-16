import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RunTrace, { formatUsd } from './RunTrace.jsx';

const trace = {
  runId: 'RUN-1', provider: 'bedrock', model: 'eu.amazon.nova-lite-v1:0', status: 'WAITING_FOR_REVIEW',
  usage: { modelCalls: 2, toolCalls: 2, inputTokens: 2500, outputTokens: 160, unmeteredModelCalls: 0, costUsd: 0.00021666,
    price: { inputUsdPerMillion: 0.069, outputUsdPerMillion: 0.276, source: 'AWS Price List API, EU (Ireland)' } },
  toolCalls: [
    { tool: 'bedrock_converse', durationMs: 812, outputs: { content: [{ toolUse: { name: 'get_observations' } }], usage: { inputTokens: 1200, outputTokens: 80 } } },
    { tool: 'get_observations', durationMs: 45, outputs: { vitals: {} } },
    { tool: 'bedrock_converse', durationMs: 640, outputs: { content: [{ toolUse: { name: 'score_protocol' } }], usage: { inputTokens: 1300, outputTokens: 80 } } },
    { tool: 'score_protocol', durationMs: 12, outputs: { error: 'Scoring service timed out' } },
  ],
};

describe('agent run trace', () => {
  it('shows a token and cost counter and a readable step-by-step log', () => {
    render(<RunTrace trace={trace} />);
    expect(screen.getByRole('group', { name: 'Run usage' })).toHaveTextContent('2 model calls2 tool calls2,500 input + 160 output tokensCost $0.000217');
    expect(screen.getByText('Model call 1')).toBeInTheDocument();
    expect(screen.getByText('Asked to run: get_observations')).toBeInTheDocument();
    expect(screen.getByText(/1,200 in \/ 80 out tokens/)).toBeInTheDocument();
    expect(screen.getByText('⚠ Error: Scoring service timed out')).toBeInTheDocument();
    expect(screen.getByText(/AWS Price List API/)).toBeInTheDocument();
  });

  it('formats small and missing costs honestly', () => {
    expect(formatUsd(0.00043)).toBe('$0.000430');
    expect(formatUsd(0.25)).toBe('$0.2500');
    expect(formatUsd(null)).toBe('not priced');
  });
});

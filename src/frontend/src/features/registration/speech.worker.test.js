import { describe, it, expect, vi, beforeEach } from 'vitest';

const pipeline = vi.fn();
vi.mock('@huggingface/transformers', () => ({
  pipeline: (...args) => pipeline(...args),
  env: { backends: { onnx: { wasm: {} } } },
}));

describe('speech worker model loading', () => {
  let posted;
  beforeEach(() => {
    posted = [];
    self.postMessage = (message) => posted.push(message);
  });

  it('retries the model download after a failure instead of caching the rejection', async () => {
    await import('./speech.worker.js');
    const transcriber = vi.fn();
    pipeline.mockRejectedValueOnce(new Error('network dropped')).mockResolvedValueOnce(transcriber);

    await self.onmessage({ data: { id: 1, type: 'load' } });
    expect(posted).toEqual([{ id: 1, type: 'error', message: expect.stringMatching(/typed intake or retry/) }]);

    await self.onmessage({ data: { id: 2, type: 'load' } });
    expect(posted.at(-1)).toEqual({ id: 2, type: 'ready' });
    expect(pipeline).toHaveBeenCalledTimes(2);

    // Once loaded, the model is reused rather than downloaded again.
    await self.onmessage({ data: { id: 3, type: 'load' } });
    expect(posted.at(-1)).toEqual({ id: 3, type: 'ready' });
    expect(pipeline).toHaveBeenCalledTimes(2);
  });
});

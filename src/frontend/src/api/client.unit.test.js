import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, mutation, ApiError, errorResult } from './client.js';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function respond(body, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Browser API client unit tests', () => {
  it('sends JSON, cookies and explicit retry headers to the same-origin API', async () => {
    const fetchMock = respond({ success: true });
    await api('/visits', { method: 'POST', body: { name: 'Synthetic' }, headers: { 'Idempotency-Key': 'retry-123' } });
    expect(fetchMock).toHaveBeenCalledWith('/api/visits', expect.objectContaining({
      credentials: 'same-origin', method: 'POST', body: '{"name":"Synthetic"}',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'retry-123' },
    }));
  });

  it('returns server data without attaching a JSON body to GET requests', async () => {
    const fetchMock = respond({ queue: [] });
    expect(await api('/queue')).toEqual({ queue: [] });
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it('preserves permission error details without expiring the session', async () => {
    respond({ code: 'PERMISSION_DENIED', message: 'Clinical approval required' }, 403);
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    await expect(api('/triage/decisions')).rejects.toMatchObject({
      status: 403, code: 'PERMISSION_DENIED', message: 'Clinical approval required',
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('notifies the app when the server rejects an expired session', async () => {
    respond({ code: 'SESSION_EXPIRED', message: 'Sign in again' }, 401);
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    await expect(api('/queue')).rejects.toBeInstanceOf(ApiError);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'afyaflow-session-expired' }));
  });

  it('turns an HTML gateway failure into a usable backend error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Unavailable</html>', { status: 502 })));
    await expect(api('/queue')).rejects.toMatchObject({ status: 502, message: 'The backend is unavailable. Please try again.' });
  });

  it('reuses a supplied mutation key and refreshes views only after success', async () => {
    const fetchMock = respond({ success: true });
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    await mutation('/visits', { name: 'Synthetic' }, 'stable-retry-key');
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe('stable-retry-key');
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'afyaflow-demo-change' }));
    dispatch.mockClear();
    respond({ message: 'Version changed' }, 409);
    await expect(mutation('/visits', {}, 'stable-retry-key')).rejects.toMatchObject({ status: 409 });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('maps network failures to retryable errors without claiming success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const result = await mutation('/visits', {}).catch(errorResult);
    expect(result).toEqual({ success: false, error: { status: 503, code: 'NETWORK_ERROR', message: 'Failed to fetch' } });
    expect(dispatch).not.toHaveBeenCalled();
  });
});

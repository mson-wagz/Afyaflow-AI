import { test } from 'node:test';
import assert from 'node:assert/strict';
import { securityHeaders, CONTENT_SECURITY_POLICY } from '../../src/backend/src/security-headers.js';

function run(path: string, options: { hsts: boolean; enforceCsp: boolean }) {
  const headers: Record<string, string> = {};
  let nextCalled = false;
  securityHeaders(options)({ path } as any, { setHeader: (name: string, value: string) => { headers[name.toLowerCase()] = value; } } as any, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  return headers;
}

test('every response gets framing, sniffing, referrer, permissions and opener protection', () => {
  const headers = run('/index.html', { hsts: false, enforceCsp: false });
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.match(headers['permissions-policy'], /microphone=\(self\)/);
  assert.match(headers['permissions-policy'], /camera=\(\)/);
  assert.equal(headers['cross-origin-opener-policy'], 'same-origin');
  // Static files may be cached; only API responses carry patient data.
  assert.equal(headers['cache-control'], undefined);
});

test('API responses are never cached', () => {
  const headers = run('/api/queue', { hsts: false, enforceCsp: false });
  assert.equal(headers['cache-control'], 'no-store');
  assert.equal(headers['pragma'], 'no-cache');
});

test('HSTS is sent only for HTTPS deployments', () => {
  assert.equal(run('/', { hsts: false, enforceCsp: false })['strict-transport-security'], undefined);
  assert.equal(run('/', { hsts: true, enforceCsp: false })['strict-transport-security'], 'max-age=31536000; includeSubDomains');
});

test('the content security policy is report-only until enforcement is switched on', () => {
  const reported = run('/', { hsts: false, enforceCsp: false });
  assert.equal(reported['content-security-policy-report-only'], CONTENT_SECURITY_POLICY);
  assert.equal(reported['content-security-policy'], undefined);
  const enforced = run('/', { hsts: false, enforceCsp: true });
  assert.equal(enforced['content-security-policy'], CONTENT_SECURITY_POLICY);
  assert.equal(enforced['content-security-policy-report-only'], undefined);
  for (const directive of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'"])
    assert.ok(CONTENT_SECURITY_POLICY.includes(directive), directive);
});

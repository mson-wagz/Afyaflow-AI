import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

// Runs public/sw.js against fake service-worker globals to check its caching rules.
const source = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');
const ORIGIN = 'https://afyaflow.example';

function load({ online = true } = {}) {
  const stores = new Map(), listeners = {};
  const store = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name);
    return {
      addAll: async (urls) => urls.forEach((u) => map.set(new URL(u, ORIGIN).href, new Response(`cached ${u}`))),
      put: async (req, res) => map.set(new URL(typeof req === 'string' ? req : req.url, ORIGIN).href, res),
      match: async (req) => map.get(new URL(typeof req === 'string' ? req : req.url, ORIGIN).href),
    };
  };
  const caches = {
    open: async (name) => store(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (req) => { for (const name of stores.keys()) { const hit = await store(name).match(req); if (hit) return hit; } return undefined; },
  };
  const fetched = [];
  const fetchImpl = async (req) => {
    fetched.push(typeof req === 'string' ? req : req.url);
    if (!online) throw new TypeError('offline');
    return new Response(`network ${typeof req === 'string' ? req : req.url}`, { status: 200 });
  };
  const self = { location: { origin: ORIGIN }, addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: async () => {}, clients: { claim: async () => {} } };
  vm.runInNewContext(source, { self, caches, fetch: fetchImpl, URL, Response, Promise, console });
  const dispatch = async (type, init = {}) => {
    let responded = null, waited = null;
    listeners[type]({ ...init, respondWith: (p) => { responded = p; }, waitUntil: (p) => { waited = p; } });
    if (waited) await waited;
    return responded ? await responded : null;
  };
  const request = (path, mode = 'cors', method = 'GET') => ({ request: { url: `${ORIGIN}${path}`, mode, method } });
  return { dispatch, request, stores, fetched, setOnline: (v) => { online = v; } };
}

describe('service worker caching rules', () => {
  let sw;
  beforeEach(async () => { sw = load(); await sw.dispatch('install'); });

  it('never intercepts the API, so patient data is never cached', async () => {
    expect(await sw.dispatch('fetch', sw.request('/api/queue'))).toBeNull();
    expect(await sw.dispatch('fetch', sw.request('/api/visits', 'cors', 'POST'))).toBeNull();
    expect([...sw.stores.get('afyaflow-shell-v1').keys()].some((k) => k.includes('/api/'))).toBe(false);
  });

  it('serves the cached app when the network is down', async () => {
    sw.setOnline(false);
    const page = await sw.dispatch('fetch', sw.request('/', 'navigate'));
    expect(await page.text()).toBe('cached /');
  });

  it('caches built assets after the first online load and serves them offline', async () => {
    await sw.dispatch('fetch', sw.request('/assets/index-abc123.js'));
    sw.setOnline(false);
    const asset = await sw.dispatch('fetch', sw.request('/assets/index-abc123.js'));
    expect(await asset.text()).toBe(`network ${'https://afyaflow.example'}/assets/index-abc123.js`);
  });

  it('removes old shell caches on activation', async () => {
    sw.stores.set('afyaflow-shell-v0', new Map());
    await sw.dispatch('activate');
    expect([...sw.stores.keys()]).toEqual(['afyaflow-shell-v1']);
  });
});

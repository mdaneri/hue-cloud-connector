import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../src/worker.mjs';
import { Discovery } from '../src/discovery.mjs';
import { mockTransport } from '../src/mock-transport.mjs';
import { RequestBudget } from '../src/rate-limit.mjs';
import './helpers.mjs';

const env = { HUE_MODE: 'mock', OWNER_SITE_USER_ID: 'synthetic-owner' };
const rpc = (method, params) => ({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) });
function request(body, owner = 'synthetic-owner') {
  return new Request('https://connector.example.invalid/mcp', { method: 'POST',
    headers: { 'content-type': 'application/json', ...(owner ? { 'oai-authenticated-user-id': owner } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body) });
}

test('status accurately reports mock mode and disconnected state', async () => {
  const response = await createWorker().fetch(new Request('https://connector.example.invalid/status'));
  const result = await response.json();
  assert.equal(result.connected, false);
  assert.equal(result.mode, 'mock');
  assert.equal(result.device_writes, 'disabled');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('MCP requires configured owner identity and rejects other callers', async () => {
  const worker = createWorker();
  assert.equal((await worker.fetch(request(rpc('tools/list')), {})).status, 401);
  assert.equal((await worker.fetch(request(rpc('tools/list'), null), env)).status, 401);
  assert.equal((await worker.fetch(request(rpc('tools/list'), 'someone-else'), env)).status, 403);
});

test('live mode fails closed', async () => {
  const result = await createWorker().fetch(request(rpc('tools/list')), { ...env, HUE_MODE: 'live' });
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { code: 'LIVE_NOT_IMPLEMENTED' });
});

test('MCP discovery and tool list follow the Sites contract and expose reads only', async () => {
  const worker = createWorker();
  const discover = await (await worker.fetch(request(rpc('server/discover')), env)).json();
  assert.deepEqual(discover.result.supportedVersions, ['2026-07-28']);
  const listing = await (await worker.fetch(request(rpc('tools/list')), env)).json();
  assert.deepEqual(listing.result.tools.map(tool => tool.name), ['discover_bridges', 'list_lights', 'list_rooms', 'list_scenes', 'read_state']);
  assert.ok(listing.result.tools.every(tool => tool.annotations.readOnlyHint && !tool.inputSchema.additionalProperties));
});

test('all five MCP tools return only synthetic targeted discovery', async () => {
  let now = 0;
  const discovery = new Discovery({ transport: mockTransport(), budget: new RequestBudget({ now: () => (now += 1001) }) });
  const worker = createWorker({ discovery });
  for (const [name, args] of [['discover_bridges', {}], ['list_lights', { bridge_id: 'demo-bridge' }],
    ['list_rooms', { bridge_id: 'demo-bridge' }], ['list_scenes', { bridge_id: 'demo-bridge' }],
    ['read_state', { bridge_id: 'demo-bridge', kind: 'lights', id: 'demo-light' }]]) {
    const result = await (await worker.fetch(request(rpc('tools/call', { name, arguments: args })), env)).json();
    assert.notEqual(result.result.isError, true);
    assert.equal(JSON.parse(result.result.content[0].text).mode, 'mock');
  }
});

test('MCP rejects write tools and raw URLs without echoing inputs', async () => {
  const worker = createWorker();
  for (const [name, args, code] of [['set_light', { id: 'PRIVATE_SECRET' }, 'UNKNOWN_TOOL'],
    ['list_lights', { bridge_id: '../PRIVATE_SECRET' }, 'INVALID_INPUT']]) {
    const response = await worker.fetch(request(rpc('tools/call', { name, arguments: args })), env);
    const body = await response.json();
    assert.equal(body.result.isError, true);
    assert.equal(JSON.parse(body.result.content[0].text).code, code);
    assert.ok(!JSON.stringify(body).includes('PRIVATE_SECRET'));
  }
});

test('JSON-RPC rejects malformed, oversized requests, batches, and unknown methods', async () => {
  const worker = createWorker();
  for (const body of ['{', 'x'.repeat(16_385), [], { method: 'tools/list' }]) {
    assert.equal((await worker.fetch(request(body), env)).status, 400);
  }
  const result = await (await worker.fetch(request(rpc('unrecognized')), env)).json();
  assert.equal(result.error.code, -32601);
});

test('OAuth routes and device write routes are absent from this milestone', async () => {
  const worker = createWorker();
  for (const path of ['/oauth/hue/start', '/oauth/hue/callback', '/control', '/callback']) {
    assert.equal((await worker.fetch(new Request(`https://connector.example.invalid${path}`), env)).status, 404);
  }
});

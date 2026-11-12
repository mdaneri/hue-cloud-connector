import test from 'node:test';
import assert from 'node:assert/strict';
import { Discovery } from '../src/discovery.mjs';
import { mockTransport } from '../src/mock-transport.mjs';
import { RequestBudget } from '../src/rate-limit.mjs';
import { validateControlProposal } from '../src/validation.mjs';
import { rejectsCode, throwsCode } from './helpers.mjs';

function client(transport) {
  let now = 0;
  return new Discovery({ transport, budget: new RequestBudget({ now: () => (now += 1001) }) });
}

test('read-only discovery lists every synthetic resource kind and reads selected state', async () => {
  const discovery = client(mockTransport());
  assert.equal((await discovery.list('bridges', {})).items[0].id, 'demo-bridge');
  for (const kind of ['lights', 'rooms', 'scenes']) {
    const result = await discovery.list(kind, { bridge_id: 'demo-bridge' });
    assert.equal(result.mode, 'mock');
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].bridge_id, 'demo-bridge');
  }
  const result = await discovery.readState({ bridge_id: 'demo-bridge', kind: 'lights', id: 'demo-light' });
  assert.deepEqual(result.item.state, { on: false, brightness_percent: 40 });
  await rejectsCode(() => discovery.control({}), 'WRITE_DISABLED');
});

test('discovery validation rejects implicit targets and injection before transport', async () => {
  let calls = 0;
  const discovery = client({ read: async () => { calls++; } });
  for (const args of [{}, { bridge_id: '*' }, { bridge_id: '../private' }, { bridge_id: 'all' },
    { bridge_id: 'demo-bridge', url: 'https://evil.invalid' }]) {
    await rejectsCode(() => discovery.list('lights', args), 'INVALID_INPUT');
  }
  await rejectsCode(() => discovery.readState({ bridge_id: 'demo-bridge', kind: 'lights', id: '0' }), 'INVALID_INPUT');
  await rejectsCode(() => discovery.readState({ bridge_id: 'demo-bridge', kind: 'scenes', id: 'scene' }), 'INVALID_INPUT');
  assert.equal(calls, 0);
});

test('API status errors are actionable and omit upstream bodies', async () => {
  for (const [status, code] of [[401, 'REAUTHORIZE'], [403, 'ACCESS_DENIED'], [404, 'NOT_FOUND'],
    [429, 'RATE_LIMITED'], [500, 'UPSTREAM_UNAVAILABLE'], [503, 'UPSTREAM_UNAVAILABLE'], [302, 'UPSTREAM_REJECTED'], [400, 'UPSTREAM_REJECTED']]) {
    let calls = 0;
    const discovery = client({ read: async () => { calls++; return { status, retryAfter: '120', data: { secret: 'PRIVATE' } }; } });
    await rejectsCode(() => discovery.list('bridges', {}), code);
    assert.equal(calls, 1); // No automatic retries.
  }
});

test('transport exceptions and malformed or cross-bridge data fail closed', async () => {
  const broken = client({ read: async () => { throw new Error('SECRET_TIMEOUT_DETAIL'); } });
  await rejectsCode(() => broken.list('bridges', {}), 'UPSTREAM_UNAVAILABLE');
  for (const response of [null, { status: 200, data: { items: 'bad' } },
    { status: 200, data: { errors: [{ description: 'SECRET' }], items: [] } },
    { status: 200, data: { items: [{ id: 'id', name: 'n', bridge_id: 'other' }] } },
    { status: 200, data: { items: [{ id: 'x', name: 'n', bridge_id: 'bridge' }, { id: 'x', name: 'n', bridge_id: 'bridge' }] } }]) {
    await rejectsCode(() => client({ read: async () => response }).list('lights', { bridge_id: 'bridge' }), 'INVALID_RESPONSE');
  }
});

test('normalized records drop provider tokens and state is tied to the exact target', async () => {
  const discovery = client({ read: async request => ({ status: 200, data: request.operation === 'list'
    ? { items: [{ id: 'lamp', name: 'Example', bridge_id: 'bridge', token: 'PRIVATE', url: 'PRIVATE' }] }
    : { item: { id: 'other', name: 'Example', bridge_id: 'bridge', state: { on: true, brightness_percent: 20 } } } }) });
  assert.deepEqual((await discovery.list('lights', { bridge_id: 'bridge' })).items,
    [{ id: 'lamp', name: 'Example', bridge_id: 'bridge' }]);
  await rejectsCode(() => discovery.readState({ bridge_id: 'bridge', kind: 'lights', id: 'lamp' }), 'INVALID_RESPONSE');
});

test('internal control proposals accept only explicit narrow commands', () => {
  const command = { bridge_id: 'bridge', kind: 'lights', id: 'lamp', action: 'set', on: true, brightness_percent: 25 };
  assert.deepEqual(validateControlProposal(command), command);
  assert.deepEqual(validateControlProposal({ bridge_id: 'bridge', kind: 'scenes', id: 'scene', action: 'recall' }),
    { bridge_id: 'bridge', kind: 'scenes', id: 'scene', action: 'recall' });
  for (const change of [{ brightness_percent: 101 }, { brightness_percent: NaN }, { on: 'yes' },
    { id: 'all' }, { action: 'flash' }, { url: 'https://evil.invalid' }, { kind: 'scenes' }]) {
    throwsCode(() => validateControlProposal({ ...command, ...change }), 'INVALID_INPUT');
  }
});

test('rate budget enforces spacing and daily limits, then resets on next UTC day', () => {
  let now = 0;
  const budget = new RequestBudget({ now: () => now, daily: 2 });
  budget.take();
  throwsCode(() => budget.take(), 'RATE_LIMITED');
  now = 1000; budget.take();
  now = 2000; throwsCode(() => budget.take(), 'DAILY_BUDGET_EXCEEDED');
  now = 86_400_000; budget.take();
});

test('Retry-After seconds and HTTP dates are honored without early retries', () => {
  let now = 0;
  const budget = new RequestBudget({ now: () => now });
  assert.equal(budget.backoff('120'), 120);
  now = 60_000;
  throwsCode(() => budget.take(), 'RATE_LIMITED');
  now = 120_000; budget.take();
  assert.equal(budget.backoff(new Date(240_000).toUTCString()), 120);
  now = 239_999; throwsCode(() => budget.take(), 'RATE_LIMITED');
  now = 240_000; budget.take();
  assert.equal(budget.backoff('invalid'), 60);
});

test('an upstream 429 blocks subsequent transport calls during cooldown', async () => {
  let now = 0;
  let calls = 0;
  const discovery = new Discovery({ budget: new RequestBudget({ now: () => now }), transport: {
    read: async () => { calls++; return { status: 429, retryAfter: '30' }; },
  } });
  await rejectsCode(() => discovery.list('bridges', {}), 'RATE_LIMITED');
  now = 29_000;
  await rejectsCode(() => discovery.list('bridges', {}), 'RATE_LIMITED');
  assert.equal(calls, 1);
});

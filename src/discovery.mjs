import { fail, ConnectorError } from './errors.mjs';
import { exactObject, resourceId, resourceKind } from './validation.mjs';
import { RequestBudget } from './rate-limit.mjs';

function state(value) {
  if (!value || typeof value.on !== 'boolean'
      || !Number.isFinite(value.brightness_percent)
      || value.brightness_percent < 0 || value.brightness_percent > 100) fail('INVALID_RESPONSE');
  return { on: value.on, brightness_percent: value.brightness_percent };
}

function record(value, kind) {
  if (!value || typeof value.name !== 'string' || value.name.length > 256) fail('INVALID_RESPONSE');
  try {
    resourceId(value.id);
    if (kind !== 'bridges') resourceId(value.bridge_id);
  } catch { fail('INVALID_RESPONSE'); }
  // Project a normalized allowlist, never raw provider bodies, keys, or URLs.
  return { id: value.id, name: value.name,
    ...(kind !== 'bridges' ? { bridge_id: value.bridge_id } : {}) };
}

export class Discovery {
  constructor({ transport, budget = new RequestBudget() }) {
    this.transport = transport;
    this.budget = budget;
  }
  async #read(request) {
    this.budget.take();
    let response;
    try { response = await this.transport.read(request); }
    catch (error) {
      if (error instanceof ConnectorError && error.code === 'LIVE_NOT_IMPLEMENTED') throw error;
      fail('UPSTREAM_UNAVAILABLE');
    }
    if (!response || !Number.isInteger(response.status)) fail('INVALID_RESPONSE');
    if (response.status === 401) fail('REAUTHORIZE');
    if (response.status === 403) fail('ACCESS_DENIED');
    if (response.status === 404) fail('NOT_FOUND');
    if (response.status === 429) fail('RATE_LIMITED', this.budget.backoff(response.retryAfter));
    if (response.status >= 500) fail('UPSTREAM_UNAVAILABLE');
    if (response.status < 200 || response.status >= 300) fail('UPSTREAM_REJECTED');
    if (!response.data || response.data.errors?.length) fail('INVALID_RESPONSE');
    return response.data;
  }
  async list(kind, args) {
    if (!['bridges', 'lights', 'rooms', 'scenes'].includes(kind)) fail('INVALID_INPUT');
    exactObject(args, kind === 'bridges' ? [] : ['bridge_id']);
    if (kind !== 'bridges') resourceId(args.bridge_id);
    const data = await this.#read({ operation: 'list', kind, ...args });
    if (!Array.isArray(data.items) || data.items.length > 1000) fail('INVALID_RESPONSE');
    const items = data.items.map(item => record(item, kind));
    if (kind !== 'bridges' && items.some(item => item.bridge_id !== args.bridge_id)) fail('INVALID_RESPONSE');
    if (new Set(items.map(item => item.id)).size !== items.length) fail('INVALID_RESPONSE');
    return { mode: 'mock', items };
  }
  async readState(args) {
    exactObject(args, ['bridge_id', 'kind', 'id']);
    resourceId(args.bridge_id);
    resourceId(args.id);
    resourceKind(args.kind);
    if (args.kind === 'scenes') fail('INVALID_INPUT');
    const data = await this.#read({ operation: 'read_state', ...args });
    const item = record(data.item, args.kind);
    if (item.id !== args.id || item.bridge_id !== args.bridge_id) fail('INVALID_RESPONSE');
    return { mode: 'mock', item: { ...item, state: state(data.item.state) } };
  }
  async control() { fail('WRITE_DISABLED'); }
}

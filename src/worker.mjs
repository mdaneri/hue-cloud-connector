import { Discovery } from './discovery.mjs';
import { mockTransport } from './mock-transport.mjs';
import { fail, publicError } from './errors.mjs';
import { exactObject } from './validation.mjs';

const id = { type: 'string', pattern: '^[A-Za-z0-9_-]{1,128}$', minLength: 1, maxLength: 128 };
const schema = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
export const tools = [
  { name: 'discover_bridges', description: 'List synthetic bridges. Offline mock only.', inputSchema: schema({}, []) },
  ...['lights', 'rooms', 'scenes'].map(kind => ({
    name: `list_${kind}`, description: `List synthetic ${kind} in one explicitly selected bridge. Offline mock only.`,
    inputSchema: schema({ bridge_id: id }, ['bridge_id']),
  })),
  { name: 'read_state', description: 'Read synthetic state for one explicitly selected light or room. Offline mock only.',
    inputSchema: schema({ bridge_id: id, kind: { type: 'string', enum: ['lights', 'rooms'] }, id }, ['bridge_id', 'kind', 'id']) },
].map(tool => ({ ...tool, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }));

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
  } });
}

async function boundedJson(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) fail('INVALID_INPUT');
  if (!request.body) fail('INVALID_INPUT');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_384) { await reader.cancel(); fail('INVALID_INPUT'); }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(all));
}

export function createWorker({ discovery = new Discovery({ transport: mockTransport() }) } = {}) {
  return {
    async fetch(request, env = {}) {
      const url = new URL(request.url);
      if (url.pathname === '/status' && request.method === 'GET') {
        return json({ project: 'Private Hue cloud connector', mode: 'mock', connected: false,
          live_api: 'not_implemented', device_writes: 'disabled' });
      }
      if (url.pathname !== '/mcp') return json({ code: 'NOT_FOUND' }, 404);
      if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
      // Only Sites Dispatch may supply this identity in production. Never expose
      // a direct Worker origin where a client could forge these headers.
      if (!env.OWNER_SITE_USER_ID || !request.headers.get('oai-authenticated-user-id')) {
        return json({ code: 'AUTHENTICATION_REQUIRED' }, 401);
      }
      if (request.headers.get('oai-authenticated-user-id') !== env.OWNER_SITE_USER_ID) {
        return json({ code: 'ACCESS_DENIED' }, 403);
      }
      if (env.HUE_MODE && env.HUE_MODE !== 'mock') return json({ code: 'LIVE_NOT_IMPLEMENTED' }, 503);
      let rpc;
      try { rpc = await boundedJson(request); }
      catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid or oversized JSON request' } }, 400); }
      if (!rpc || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string'
          || !(typeof rpc.id === 'string' || (Number.isSafeInteger(rpc.id)))) {
        return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } }, 400);
      }
      const reply = result => json({ jsonrpc: '2.0', id: rpc.id, result });
      if (rpc.method === 'server/discover') return reply({ supportedVersions: ['2026-07-28'], capabilities: { tools: {} } });
      if (rpc.method === 'tools/list') return reply({ tools });
      if (rpc.method !== 'tools/call') return json({ jsonrpc: '2.0', id: rpc.id,
        error: { code: -32601, message: 'Method not found' } });
      try {
        exactObject(rpc.params, ['name', 'arguments']);
        const { name, arguments: args } = rpc.params;
        let result;
        if (name === 'discover_bridges') result = await discovery.list('bridges', args);
        else if (['list_lights', 'list_rooms', 'list_scenes'].includes(name)) result = await discovery.list(name.slice(5), args);
        else if (name === 'read_state') result = await discovery.readState(args);
        else fail('UNKNOWN_TOOL');
        return reply({ content: [{ type: 'text', text: JSON.stringify(result) }] });
      } catch (error) {
        return reply({ isError: true, content: [{ type: 'text', text: JSON.stringify(publicError(error)) }] });
      }
    },
  };
}

export default createWorker();

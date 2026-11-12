import worker from '../src/worker.mjs';

// No sockets, browser, accounts, credentials, or Hue calls.
const request = new Request('https://connector.example.invalid/mcp', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'oai-authenticated-user-id': 'synthetic-demo-owner' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'discover_bridges', arguments: {} } }),
});
const response = await worker.fetch(request, { HUE_MODE: 'mock', OWNER_SITE_USER_ID: 'synthetic-demo-owner' });
console.log(await response.text());

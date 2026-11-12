// Invented demo records in the project's internal format. Not Hue wire examples.
const data = {
  bridges: [{ id: 'demo-bridge', name: 'Example bridge (synthetic)' }],
  lights: [{ id: 'demo-light', bridge_id: 'demo-bridge', name: 'Example lamp (synthetic)',
    state: { on: false, brightness_percent: 40 } }],
  rooms: [{ id: 'demo-room', bridge_id: 'demo-bridge', name: 'Example room (synthetic)',
    state: { on: false, brightness_percent: 40 } }],
  scenes: [{ id: 'demo-scene', bridge_id: 'demo-bridge', name: 'Example scene (synthetic)' }],
};

export function mockTransport() {
  return {
    async read(request) {
      if (request.bridge_id && request.bridge_id !== 'demo-bridge') return { status: 404 };
      if (request.operation === 'list') return { status: 200, data: { items: structuredClone(data[request.kind]) } };
      const item = data[request.kind]?.find(candidate => candidate.id === request.id);
      return item ? { status: 200, data: { item: structuredClone(item) } } : { status: 404 };
    },
  };
}

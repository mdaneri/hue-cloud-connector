import { fail } from './errors.mjs';

export function exactObject(value, required, optional = []) {
  if (!value || Array.isArray(value) || typeof value !== 'object'
      || Object.keys(value).some(key => ![...required, ...optional].includes(key))
      || required.some(key => !Object.hasOwn(value, key))) fail('INVALID_INPUT');
  return value;
}

export function resourceId(value) {
  // Internal opaque IDs, not a claim about Hue's wire ID format.
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)
      || ['all', '0'].includes(value.toLowerCase())) fail('INVALID_INPUT');
  return value;
}

export function resourceKind(value) {
  if (!['lights', 'rooms', 'scenes'].includes(value)) fail('INVALID_INPUT');
  return value;
}

// Internal command proposal only. No transport or MCP write tool consumes this.
export function validateControlProposal(value) {
  exactObject(value, ['bridge_id', 'kind', 'id', 'action'], ['on', 'brightness_percent']);
  resourceId(value.bridge_id);
  resourceId(value.id);
  resourceKind(value.kind);
  if (value.kind === 'scenes') {
    if (value.action !== 'recall' || Object.hasOwn(value, 'on')
        || Object.hasOwn(value, 'brightness_percent')) fail('INVALID_INPUT');
  } else {
    if (value.action !== 'set' || (!Object.hasOwn(value, 'on')
        && !Object.hasOwn(value, 'brightness_percent'))) fail('INVALID_INPUT');
    if (Object.hasOwn(value, 'on') && typeof value.on !== 'boolean') fail('INVALID_INPUT');
    if (Object.hasOwn(value, 'brightness_percent') && (!Number.isFinite(value.brightness_percent)
        || value.brightness_percent < 0 || value.brightness_percent > 100)) fail('INVALID_INPUT');
  }
  return structuredClone(value);
}

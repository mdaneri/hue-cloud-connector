export class ConnectorError extends Error {
  constructor(code, retryAfterSeconds) {
    super(code);
    this.name = 'ConnectorError';
    this.code = code;
    if (Number.isFinite(retryAfterSeconds)) this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function fail(code, retryAfterSeconds) {
  throw new ConnectorError(code, retryAfterSeconds);
}

const publicCodes = new Set([
  'INVALID_INPUT', 'INVALID_CALLBACK', 'INVALID_STATE', 'AUTHORIZATION_DENIED',
  'AUTHENTICATION_REQUIRED', 'ACCESS_DENIED', 'NOT_FOUND', 'RATE_LIMITED',
  'DAILY_BUDGET_EXCEEDED', 'UPSTREAM_UNAVAILABLE', 'UPSTREAM_REJECTED',
  'INVALID_RESPONSE', 'REAUTHORIZE', 'TOKEN_EXCHANGE_FAILED', 'TOKEN_REFRESH_FAILED',
  'SECRET_STORAGE_FAILED', 'LIVE_NOT_IMPLEMENTED', 'WRITE_DISABLED', 'UNKNOWN_TOOL',
]);

export function publicError(error) {
  const code = error instanceof ConnectorError && publicCodes.has(error.code)
    ? error.code : 'INTERNAL_ERROR';
  return { code, ...(code === 'RATE_LIMITED' && Number.isFinite(error.retryAfterSeconds)
    ? { retry_after_seconds: error.retryAfterSeconds } : {}) };
}

// Construct logs from a tiny allowlist. Never serialize requests, errors, URLs,
// provider bodies, resource names, authorization codes, headers, or tokens.
export function auditRecord({ event, code, http_status } = {}) {
  return {
    event: ['discovery', 'oauth', 'disconnect'].includes(event) ? event : 'connector',
    ...(publicCodes.has(code) ? { code } : {}),
    ...(Number.isInteger(http_status) && http_status >= 100 && http_status <= 599
      ? { http_status } : {}),
  };
}

# Credential and access design

## Current boundary

The Worker is an offline mock. It has no Hue endpoints, outbound fetch, OAuth HTTP routes, production persistence, or write tools. OAuth and token modules are disconnected primitives exercised only with synthetic values. Environment examples contain placeholders; no secret values have been provisioned. Do not add an OpenAI API key or account login to this foundation.

## Provider OAuth, distinct from Sites identity

Sites authenticates the assistant/browser caller. Hue authorization would give a separate server-side grant for the owner's devices. Do not build a replacement for Sites sign-in or implement its reserved `/callback` path. Proposed Hue routes are `/oauth/hue/start` and `/oauth/hue/callback`, subject to verified hosting and provider rules.

Initiation must require the configured owner, a protected same-origin browser session, CSRF protection, and an allowlisted redirect URI. Generate 256-bit random state; store its hash with a hash of the initiating session and a five-minute TTL. The test primitive rejects wrong/expired/replayed state, duplicate or unexpected query parameters, credentials in URLs, fragments, wrong origins/paths, and simultaneous callbacks. Its strict query allowlist must be reconciled with the verified provider response before live use. A shared atomic consume operation is required across Workers.

After validating state, exchange the code server-side using the fixed configured redirect and provider endpoints. Never derive the callback from untrusted Host/forwarded headers or accept a user-controlled return URL. Implement PKCE S256 if supported by Hue; support remains unverified. Do not enable an implicit-token flow.

OAuth authorization codes/state may inherently traverse the provider's browser redirect URL. They must never be put in chat, screenshots, analytics, access/application logs, tool results, or durable records. Ensure the ingress can suppress query logging; block live OAuth if it cannot. Use `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, no third-party assets, and immediately redirect to a clean status URL after callback consumption. Client secrets and access/refresh tokens must never be placed in URLs. None of these callback HTTP routes are currently implemented.

## Token storage and lifecycle

The generic store uses AES-256-GCM, a fresh random 96-bit nonce per write, and version/owner-bound authenticated data. It fails closed on tampering, a wrong owner/key, or backend failure. The test backend is memory-only. A production data store must receive ciphertext only; an independently protected runtime secret holds the encryption key. Confirm platform secret access and encryption guarantees, secure key provisioning/rotation, and backup/retention behavior before use. No production encryption key is generated or saved by this project.

The generic lifecycle validates token responses, keeps tokens server-side, refreshes before expiry, persists rotated tokens before returning access, and serializes operations within one instance. It retains a prior refresh token only when a mock provider omits a replacement. The real provider's rotation contract remains unverified. Invalid grants clear local tokens and require reauthorization. Transient failures return safe errors without exposing provider content. Provider exceptions must be mapped by a verified adapter.

Production needs a shared per-owner refresh lock and atomic encrypted record replacement. Define crash recovery when refresh rotates a token but persistence fails; fail closed and require reauthorization if safe recovery is impossible. Process-local serialization does not solve multi-isolate races.

Disconnect clears local encrypted credentials before attempting optional remote revocation and distinguishes `revoked`, `unsupported`, `failed`, and `not_attempted`. Failure or lack of a revocation endpoint must never be described as successful remote revocation. Provide the owner the verified Hue account app-removal procedure, clear cached device data/state, and ensure concurrent refresh cannot restore disconnected tokens. Confirm whether both access and refresh credentials/grants need provider-side revocation before implementing that adapter.

## Tool access, targeting, and quotas

Every `/mcp` request requires the exact configured Site-scoped owner ID. An absent owner configuration fails closed. In production, identity headers are trustworthy only behind Sites Dispatch; a direct public Worker origin would permit forged headers. Do not expose one. No audience change, service bypass token, or sharing has been configured.

Discovery requires an explicit Bridge ID after bridge enumeration. State reads require an explicit Bridge ID, resource kind, and resource ID. Strict objects reject extra fields, URLs, path characters, wildcard/home-wide IDs, and unsupported fields. Internal IDs are placeholders for a future mapping, not assertions about Hue wire IDs. Future controls must additionally verify actual resource ownership, capability, and an owner-approved allowlist on each call.

The request budget rejects excess calls rather than sleeping or automatically retrying. Defaults are project choices: one request per second, 1,000 requests per UTC day. It honors numeric and HTTP-date `Retry-After` values, using a 60-second fallback when invalid. Production counters and cooldowns must be shared and atomic across all resource, token, and discovery requests; current limits are only process-local. Do not add background polling by default.

## Errors and logs

Normalized reads project allowlisted IDs, names, and state; they reject mismatched targets, duplicate IDs, malformed data, and provider errors. A future adapter must account for actual Hue HTTP and application-level error schemas before normalization. Map authentication, forbidden access, not found, rate limiting, upstream failures, invalid data, and unsupported capabilities to clear errors. Use fixed endpoints, body size limits, timeouts, verified TLS, and no auth-bearing redirects.

The current public error boundary emits allowlisted codes and numeric cooldowns. The audit constructor accepts only known events/codes and numeric HTTP status; it discards free text, URLs, errors, tokens, headers, names, and other fields. No application logging is enabled. Future logs must use this structured constructor and exclude device names and raw requests/responses. Never log a generic Error object, even when an upstream operation fails.

## Required before a first live connection

Verify the provider contract and account eligibility; approve the live app and hosting; provide secure secret entry; implement provider adapters, shared state/locking/storage, callback session/log protections, and confirmed revocation behavior. Then obtain owner OAuth consent and verify read-only inventory. Device changes require later approval of concrete targets/actions. A passing mock suite does not establish provider compatibility or production security.

# Milestone 1 verification record

Verified on Windows with Node.js `v22.14.0` on 2026-11-12.

## Checks completed on the prepared source

| Command | Actual result |
| --- | --- |
| `npm test` | Exit 0; 35 tests passed, 0 failed, 0 skipped |
| `npm run demo` | Exit 0; returned `mode: mock` and `demo-bridge`, named `Example bridge (synthetic)` |
| `npm run build` | Exit 0; emitted offline Worker entry `dist/server/index.js` |

Tests cover one-use/expired/session-bound/concurrent OAuth state, callback origin/path/pollution rejection, exchange validation, refresh rotation and serialization, invalid grants, sanitized errors, optional remote revocation outcomes, encryption round trips and tampering/owner separation, no plaintext storage fallback, structured log redaction, explicit discovery targets, provider status errors and malformed data, rate spacing/daily budgets/429 cooldowns, owner authorization, mock-only mode, bounded MCP input, and absence of OAuth/control routes. Test helpers replace global `fetch` with a rejecting function. No live device-changing test exists.

Earlier automatic test discovery also counted `test/helpers.mjs` as a test file, producing 36 passing entries. The final explicit test command excludes that helper and reports 35 substantive tests.

## Limits and pending work

API compatibility remains untested. Current detailed official Hue pages were inaccessible; the public evidence and exact unknowns are in [API-RESEARCH.md](API-RESEARCH.md). No live Hue provider adapter, production OAuth handler, durable store, distributed lock/budget, or secure provisioning flow is complete.

The offline milestone used synthetic data and required no provider account, credentials, hosting, or devices. Live integration begins with owner-authorized review of the official developer portal and verification of the current remote-control contract.

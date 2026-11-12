# Hue Cloud Connector

An offline prototype for a Philips Hue plugin for Codex and Claude. The goal is to share one MCP backend that connects the owner to their Hue devices through the Hue remote API without an always-on Windows computer. The source is public. Any future running connector is intended for one owner and must require authentication.

The current prototype exposes five synthetic read tools through a Sites-specific Worker. Plugin packages and end-to-end client compatibility are planned. Live Hue access, OAuth routes, and device control are pending. See the [implementation plan](PLAN.md) and [GitHub project board](https://github.com/users/mdaneri/projects/6) for the roadmap.

## Try the offline milestone

Node.js 22 or later is required. There are no third-party dependencies, install steps, accounts, or credentials required.

```powershell
npm test
npm run demo
npm run build
```

The demo executes an in-memory MCP request and prints one invented bridge. It opens no network listener and makes no network calls. The build produces `dist/server/index.js`, a mock Worker module; it does not deploy anything. `HUE_MODE=live` is rejected. No live tests or device-changing routes exist.

## What is here

| Files | Purpose |
| --- | --- |
| `src/worker.mjs`, `src/discovery.mjs` | Owner-gated MCP contract, explicit targeting, normalized read responses, safe errors |
| `src/mock-transport.mjs` | Clearly labeled synthetic bridge, light, room, scene, and state |
| `src/oauth.mjs`, `src/secrets.mjs` | Generic callback/state and encrypted token lifecycle primitives; no Hue adapter or OAuth routes |
| `src/rate-limit.mjs`, `src/validation.mjs` | Conservative request budgets and narrow internal control proposal validation |
| `test/` | Offline tests for discovery, OAuth, encryption, refresh/revocation, errors, limits, and access checks |
| [PLAN.md](PLAN.md) | Milestones and acceptance criteria |
| [API research](docs/API-RESEARCH.md) | Official evidence, inaccessible documentation, and unresolved questions |
| [Security design](docs/SECURITY-DESIGN.md) | Credential handling and requirements before live operation |

Sites is a candidate host. Its suitability for both clients depends on standard MCP support and a verified owner-authentication path. The hosting configuration in `config/hosting.example.json` is an offline placeholder.

## Next owner step

Open the official [Hue developer portal login](https://developers.meethue.com/login/) yourself if you already have a developer account. The next research task is to inspect its current remote-control documentation and access process. If you do not have an account, review the [registration page](https://developers.meethue.com/register/) and terms yourself before deciding whether to register. This project does not authorize registration, terms acceptance, an app request, hosting, OAuth consent, payment, or device control.

Do not paste passwords, client secrets, access tokens, refresh tokens, or authorization callback URLs into chat. Secure credential entry and supported secret provisioning must be settled before live integration. No OpenAI API key is needed for this scaffold.

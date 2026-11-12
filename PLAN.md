# Implementation plan

## 1. Offline foundation — implemented

- Research official public Hue sources and record remaining access questions.
- Build dependency-free JavaScript modules using Web Crypto, Request, and Response, compatible with a future Worker host and the installed Node test runtime.
- Expose mock MCP discovery and reads; keep every response labeled `mode: mock`.
- Exercise generic OAuth state/callback handling, encrypted token storage, serialized refresh/disconnect, errors, rate limits, owner checks, and explicit input validation with synthetic data.
- Provide source and a local Worker build only. Verify with tests, demo, and a build import.

## 2. Verify provider contract — pending owner portal access

Read the current authorized remote-control API documentation and app registration requirements. Confirm single-user private use eligibility, approvals, any fees, development/test restrictions, redirect rules, supported Bridge generations/firmware, account/Home association, Bridge discovery, pairing/application-key requirements, wire resource schemas, pagination, scopes, and limits.

Verify exact authorization/token/refresh/revocation URLs and HTTP methods, Basic client authentication details, response/error schemas, token TTL/rotation semantics, PKCE support, and denial callback parameters. Public evidence supports OAuth2 in Hue's ecosystem but does not establish these details. Do not copy old community endpoints into code. Do not treat a local CLIP tutorial as the remote contract.

Acceptance: a source-backed provider contract, permitted private-use path, and approved secret-entry procedure. Keep proprietary documentation private and respect its access conditions. Record only implementation facts permitted for this private project.

## 3. Prepare owner-private hosting — separate authorization required

Evaluate the Sites MCP workflow against the Codex and Claude compatibility milestone below. If Sites meets both clients' transport and owner-authentication requirements and the owner approves, use its Worker ESM setup/build helpers, retain the returned project identity, and declare `capabilities: ["mcp"]`. Provision runtime secrets through supported secret tooling without exposing values in tool arguments or output.

Before hosting live credentials, verify authenticated OAuth browser initiation, callback reachability through Sites, session binding, secret access controls, ingress log suppression, and an atomic durable data path. Sites reserves `/callback`; propose `/oauth/hue/callback`, subject to confirmed provider rules. Do not relax Site access or enable a public Worker origin to make the callback work. If the platform cannot support this securely, stop and present the concrete constraint before selecting another host.

Replace memory-only OAuth state, token backend, refresh serialization, and request counters with shared atomic TTL storage and a per-owner lock. Confirm that required storage/coordination is supported; D1 binding and transaction details are not yet configured. Use encrypted token records and independent key management. Do not represent process-local guards as distributed protection.

Acceptance: reviewed hosting configuration, owner identity checks on every MCP operation, shared coordination tests, secure callback/secret path, and explicit deployment approval for the concrete service.

## 4. Connect read-only discovery — separate account consent required

After the owner approves a concrete live app registration and later authorizes their account, implement a Hue provider adapter against verified endpoints. Pin destination hosts and paths in server code. Use TLS validation, bounded bodies/timeouts, no credential-bearing redirects, no arbitrary URL/proxy tool, and normalized schemas. The adapter maps actual Hue IDs to the internal validated resource IDs without inventing formats.

Initial tools:

| Tool | Target | Result |
| --- | --- | --- |
| `discover_bridges` | Authorized owner's account | Accessible Bridge IDs and names |
| `list_lights` | One explicit Bridge ID | Light IDs and names |
| `list_rooms` | One explicit Bridge ID | Room IDs and names |
| `list_scenes` | One explicit Bridge ID | Scene IDs and names, with room association when verified |
| `read_state` | One explicit Bridge, resource kind, and resource ID | Normalized supported state for a light or room |

Start with the narrowest provider scopes available; do not assume Hue offers read-only or per-device OAuth scopes. If the provider grant is broader, explain that before consent, and enforce a connector allowlist. No generic raw API tool. Filter Bridges/resources to this account and reject mismatched ownership. Minimize caching; return a freshness timestamp and identify stale data in live responses. Handle pagination and unsupported capabilities explicitly rather than silently truncating data.

Keep the project defaults of at most one request per second and 1,000 per UTC day until the exact service quotas are confirmed. Honor `Retry-After`, account for token requests in the shared budget, and never loop or poll unattended by default. Actual application quotas may span multiple Bridges. No retry after 401/403 without documented token handling; no automatic write retries.

Acceptance: owner-authorized live reads only, real normalized inventory with no secrets, tested pagination/schema mapping, verified shared quotas, and clear disconnected/unreachable/forbidden states. Remove the hard-coded mock label only when the verified live adapter and mode separation are implemented together.

## 5. Add narrow controls — pending concrete target/action approval

Propose `set_light` and `set_room` with explicit Bridge/resource IDs plus on/off and brightness percentage, and `recall_scene` with explicit Bridge/scene IDs and verified room membership. The current internal proposal validator is not an executable control API. Check device capability, authorization, and owner-approved resource allowlist before writing. A room command must clearly enumerate its affected lights. Resolve ambiguous names through discovery rather than guessing.

Before the first live change, present the actual Bridge, light/room/scene, affected devices, and requested change for owner approval. Keep live device-changing tests absent/disabled until that approval. Never provide flashing, bulk home-wide commands, schedules, security-device actions, automation creation, or a generic API proxy in this scope. Confirm uncertain outcomes with a read before considering a retry. Report partial failures and fresh observed state; do not claim physical state solely from an accepted HTTP request.

Acceptance: approved targeted write, result read-back, safe errors, no implicit targets, and an owner-accessible disconnect/revocation procedure.

## Client compatibility — next offline milestone

- Share the discovery and authorization logic between clients. Add a standard MCP adapter and verify initialization, tool listing, and tool calls with synthetic data. The current Worker implements the Sites handshake.
- Package the shared tools for Codex and Claude Code. Verify the Codex plugin and Claude Code plugin independently in clean client sessions. Evaluate Claude's remote custom connector separately because that connection originates from Anthropic's infrastructure.
- For hosted use, verify how each client authenticates to the connector. Require owner authorization on every tool call and keep that authorization distinct from the server-side Hue grant.

Acceptance: Codex and Claude Code each load the plugin and invoke all five synthetic read tools. Hosted compatibility requires a separately approved service and verified owner access from each supported client.

[OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins) · [Claude Code plugin reference](https://code.claude.com/docs/en/plugins-reference) · [Claude remote connector requirements](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

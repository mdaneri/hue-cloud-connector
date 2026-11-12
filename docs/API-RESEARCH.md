# Official API research

Checked 2026-11-12. Public pages were read without authentication. No account, application, authorization, or device operation was performed.

## Verified public evidence

| Finding | Official source |
| --- | --- |
| Signify distinguishes a remote API for developer use from Data Notice access; Data Notice access excludes changing device state. Developer registration and a credential request with terms acceptance are required. | [API terms, sections 1–2](https://developers.meethue.com/terms-of-use-and-conditions/) |
| The terms publish a 50,000 remote-call daily limit, allow throttling/revocation, and prohibit aggregating control/data across end users. They do not promise automatic private-app approval. | [API terms, sections 6 and 8](https://developers.meethue.com/terms-of-use-and-conditions/) |
| The portal offers separate developer login and registration pages. Registration states that it entails agreement to terms and privacy policies. No form was submitted. | [Login](https://developers.meethue.com/login/), [Register](https://developers.meethue.com/register/) |
| Hue advertises Out of home control with an account and Bridge. This confirms the consumer capability, not this project's developer access or exact API prerequisites. | [Hue accounts: Control lights from anywhere](https://www.philips-hue.com/en-us/explore-hue/accounts) |
| A public November 2024 notice describes Hue's OAuth2 protocol, Basic authentication, and planned withdrawal of Digest support. The home page also directs API use over HTTPS. | [Developer news home page](https://developers.meethue.com/) (dated notices), [Digest notice link](https://developers.meethue.com/deprecation-of-support-for-digest-authentication/) (detail page inaccessible) |
| The getting-started tutorial demonstrates local Bridge discovery, physical-button authorization, and local light reads/writes. It is not proof of a remote pairing procedure. | [Local getting started](https://developers.meethue.com/develop/get-started-2/) |

The terms are versioned September 2025 on the fetched page. Their stated quotas and permissions must be rechecked before live use.

## Unavailable or unresolved

The following official URLs returned HTTP 403 or were inaccessible to the web tool; the developer login page was accessible. This does not prove the pages are available immediately after login, or that authentication is the only access restriction:

- [Cloud-to-cloud getting started](https://developers.meethue.com/develop/hue-api-v2/cloud2cloud-getting-started/), previously proposed in the conversation: 403. Its contents and current applicability remain unverified.
- [Hue API v2](https://developers.meethue.com/develop/hue-api-v2/): 403.
- [Hue API v1](https://developers.meethue.com/develop/hue-api/): 403.
- [Remote API URL previously considered](https://developers.meethue.com/develop/hue-api/remote-api/): inaccessible. Do not treat this candidate URL as a verified contract.
- [Digest deprecation notice](https://developers.meethue.com/deprecation-of-support-for-digest-authentication/): 403; its dated excerpt was readable on the home page.

Unknown: current remote-control enrollment availability for this owner; app registration UI, client credential issuance, manual review, review timelines, private-use exemptions, fees, quotas beyond the terms, Bridge generation/firmware support, account/Home membership requirements, API v1/v2 remote coverage, pairing keys, scopes, pagination, and scene/room semantics.

OAuth unknowns: exact endpoints and request parameters, current grant support, client authentication details, PKCE, redirect URI matching rules, code/token TTL, refresh-token rotation/reuse rules, revocation support, and provider denial/error response fields. No endpoint constants or live OAuth adapter have been added.

## Architecture conclusion

A cloud connector is plausible given the remote API evidence. Its availability for this owner is not established. The owner's Bridge must remain reachable by Hue's service; the proposed cloud host replaces an always-on Windows connector, not the Bridge or internet connection. This is a design inference, subject to provider documentation and a future connection test.

The available plugin-creator and Sites instructions describe owner-private cloud hosting with a stateless `/mcp` endpoint, authenticated Site identity, and automatic creation of a canonical private plugin during publication. These are installed platform workflow instructions, not evidence of a deployed Site. The scaffold follows that MCP contract locally. Browser OAuth callback access, secure secret entry, and durable coordination still need verification before hosting Hue credentials.

## Security references

These standards guide generic primitives, not claims that Hue implements every optional feature:

- [RFC 9700: OAuth security best current practice](https://www.rfc-editor.org/rfc/rfc9700.html) — redirect protection, CSRF protection, and refresh-token security.
- [RFC 6749: OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749.html) — authorization-code and token lifecycle concepts.
- [RFC 7009: token revocation](https://www.rfc-editor.org/rfc/rfc7009.html) — conditional design if provider support is verified.

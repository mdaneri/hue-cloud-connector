# Project instructions

This public repository contains an offline Philips Hue connector prototype. Any future running connector is single-owner and private.

- Keep live endpoints and provider wire formats out of code until checked against current authorized official documentation. Keep research sources and unknowns in `docs/API-RESEARCH.md`.
- Never request passwords, secrets, tokens, or callback URLs in chat. Never commit or log secrets. Use placeholders until supported secure provisioning is approved.
- Do not register apps, accept terms, sign up, publish/deploy, change sharing, or perform OAuth consent merely because project work is authorized.
- Keep device-changing tests absent or disabled until the owner approves the exact target/action. Current MCP tools expose synthetic reads only.
- Use `npm test`, `npm run demo`, and `npm run build` for the offline milestone. No dependencies or network access are required.
- Preserve owner access checks and fail closed. Memory state/budgets/locks are test primitives and must not be called production-safe.
- Continue this same project in the existing workspace on the designated host. Do not modify unrelated repositories or create a replacement chat/project to work around host selection.

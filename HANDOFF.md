# MetaScraper MCP handoff — 2026-09-26

The product MCP lives in this repository under `mcp/`; shared gateway routes live in `lucci-xyz/mcp`. Production Vercel project `metascraper` deploys from `main` and uses `metascraper-photos`. Sandbox project `metascraper-sandbox` uses a separate store. The public URLs are `https://mcp.luccilabs.xyz/metascraper` and `https://sandbox.mcp.luccilabs.xyz/metascraper`.

Before this restore, main lacked the MCP source and the production direct `/mcp` and shared `/metascraper` routes returned 404. Sandbox MCP initialized successfully. The product source here was selected from feature branch `codex/photo-metadata-mcp` (`e0b39d8`) without its former `infra/mcp-gateway` files, which now belong in `lucci-xyz/mcp`. Existing PR #7 remains open and also contains VS Code extension changes that this restore does not include.

Local `npm --prefix mcp ci && npm --prefix mcp run check` passed: 29 tests, three opt-in Redis tests skipped. Next: verify the production Git deployment, run `node mcp/scripts/verify-environments.mjs` with synthetic images, then test a fresh ChatGPT connection and actual download. Preserve legacy endpoint and old client connections until references are known.


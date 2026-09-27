# MetaScraper MCP handoff — 2026-09-27

The product MCP lives in this repository under `mcp/`; shared gateway routes live in `lucci-xyz/mcp`. Production Vercel project `metascraper` deploys from `main` and uses `metascraper-photos`. Sandbox project `metascraper-sandbox` uses a separate store. The public URLs are `https://mcp.luccilabs.xyz/metascraper` and `https://sandbox.mcp.luccilabs.xyz/metascraper`.

Before this restore, main lacked the MCP source and the production direct `/mcp` and shared `/metascraper` routes returned 404. Product-only source from feature branch `codex/photo-metadata-mcp` (`e0b39d8`) was merged through PR #8 as `1c33347`; shared gateway files now belong in `lucci-xyz/mcp`. Existing PR #7 remains open and also contains VS Code extension changes that this restore does not include.

Local `npm --prefix mcp ci && npm --prefix mcp run check` passed: 29 tests, three opt-in Redis tests skipped. Production Git deployment `dpl_GqXveFEYXaSF7NpGAStAP7BhVCHJ` is ready. `node mcp/scripts/verify-environments.mjs` passed both environments with synthetic images, cross-environment denial and a 6,303,684-byte streamed download. Next: test a fresh ChatGPT connection and actual native widget behavior. Preserve the legacy connection until references are known.

# MetaScraper

Follow [Lucci Labs MCP conventions](infra/mcp-gateway/CONVENTIONS.md) for deployment, routing, environment isolation and client naming. The shared product registry lives in `infra/mcp-gateway/registry.json`.

- Production endpoint: `https://mcp.luccilabs.xyz/metascraper`.
- Sandbox endpoint: `https://sandbox.mcp.luccilabs.xyz/metascraper`.
- Keep legacy URLs functional while existing clients migrate.
- Pin Vercel project/team IDs; use the deployment helper documented in the conventions.
- Run `npm --prefix mcp run check` for relevant server/widget changes. Live environment acceptance uses only synthetic photos: `node mcp/scripts/verify-environments.mjs`.
- Never supply production database credentials to sandbox or preview deployments.
- Preserve unrelated working-tree changes, including root extension package files.

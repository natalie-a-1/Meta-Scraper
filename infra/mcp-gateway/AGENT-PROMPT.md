Update this product to follow the Lucci Labs MCP conventions.

Use the existing product name and a stable lowercase kebab-case slug:
- Production: `https://mcp.luccilabs.xyz/<slug>`
- Sandbox: `https://sandbox.mcp.luccilabs.xyz/<slug>`
- These are complete MCP endpoints; do not append `/mcp`.
- Name the client connections `<Product Name>` and `<Product Name> Sandbox`.

Read the shared conventions and route registry in the Meta-Scraper repository under `infra/mcp-gateway/`. Keep each product independently deployed on Vercel. Register its routes in the existing production and sandbox gateways; preserve other products' routes and never reassign the shared domains to a product project. Use separate projects, databases, storage, credentials and auth configuration for production and sandbox. Never give preview deployments production credentials.

Update this repository's AGENTS.md, README, deployment instructions, configuration examples, manifests, callbacks and generated links to use the new conventions. Keep supporting UI, file and API URLs under the product prefix. Preserve authentication, streaming, attachment handling and existing client compatibility. Keep widget upload helpers app-only. Pin the Vercel project and team IDs explicitly for every deployment.

Implement and verify the migration end to end: HTTPS, MCP discovery, tool calls, UI, downloads and environment isolation. Do not fabricate routes for unimplemented products or claim readiness from health checks alone. Report the final URLs, connection names, verification results and any remaining blocker. Never commit credentials or personal test files.

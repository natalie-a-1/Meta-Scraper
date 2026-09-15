# Lucci Labs MCP conventions

Use `luccilabs.xyz` exactly. Public MCP endpoints have one hostname per environment and one lowercase kebab-case product slug:

| Purpose | URL |
| --- | --- |
| Production MCP | `https://mcp.luccilabs.xyz/<slug>` |
| Sandbox MCP | `https://sandbox.mcp.luccilabs.xyz/<slug>` |
| Optional browser panel | `<MCP endpoint>/ui` |
| Health | `<MCP endpoint>/health` |
| Product-owned files and APIs | `<MCP endpoint>/files/...`, `<MCP endpoint>/api/...` |

The product URL is the complete MCP endpoint. Do not append `/mcp`, introduce product-specific public MCP subdomains, put environment names in product slugs, or use URL query parameters to select environments. The root hosts are directories, not combined MCP servers. Product website domains are separate and need not change.

MetaScraper is live at `/metascraper`. `launch` and `pilot` are reserved names only; there are no routes for them until their own MCP backends are ready. Unknown products return 404.

## Routing ownership

The shared route registry is `infra/mcp-gateway/registry.json` in the Meta-Scraper repository. Edit it and run `node infra/mcp-gateway/generate.mjs` to regenerate both gateway configurations. Preserve every other product's route. Never assign the shared domains to a product's Vercel project.

Gateways are the Vercel projects `lucci-mcp` and `lucci-mcp-sandbox` in the `lucci` team. Each product and environment runs in its own backend project. Gateways use fixed external rewrites: `/<slug>` to the backend's MCP route, and `/<slug>/:path*` to the backend's supporting routes. They preserve methods and response streams, disable response caching, and never choose an upstream from untrusted input.

Product code must generate absolute links using its environment's public prefix. Do not derive the public hostname from forwarded headers. Validate explicitly permitted Host and Origin values, including the known upstream origin. Keep browser requests under the product prefix. Do not publish internal Vercel URLs as connection URLs.

## Environment isolation

Production and sandbox require separate backend projects, databases, credentials, file storage, auth clients, callbacks and webhooks where applicable. Preview or development deployments must never receive production data credentials. Separate key prefixes alone are not the database isolation standard. Sandbox uses synthetic/test data and test-mode third-party credentials.

MetaScraper production uses `metascraper-photos` (`store_d242zyAA5zHTbBfa`); sandbox uses `metascraper-sandbox-photos` (`store_QresXSVfJ338hE3X`). Each resource is connected only to the primary deployment slot of its respective project. Vercel calls that slot `production` even in the separate sandbox project; the sandbox project's `APP_ENV` is `sandbox`. The product's production preview deployments have no production Redis credentials and fail closed if started without their own storage configuration.

Both databases use pay-as-you-go Upstash with automatic upgrades disabled. Images and metadata expire after 30 minutes; incomplete uploads after five minutes. Gateway projects contain no database credentials.

## ChatGPT and other MCP clients

Use `<Product Name>` for production and `<Product Name> Sandbox` for testing. Register each as a separate connection using its complete public endpoint. Keep distinct permissions and OAuth registrations where applicable. Preserve each product's own tools, skills and UI. Helpers that transport bytes for a widget stay app-only; ChatGPT attachments use the host-provided file descriptor.

For OAuth-enabled products, implement MCP authorization discovery and validate the full public resource URL. Route discovery under `/.well-known` using a mechanism Vercel supports; a generic external rewrite is not sufficient for its reserved `/.well-known` path. Do not weaken authentication or add cross-product token acceptance to make a gateway work. MetaScraper currently uses No Auth with unguessable expiring photo handles; that is not a blanket auth policy for other products.

## Deploy and verify

Always pin both `VERCEL_PROJECT_ID` and `VERCEL_ORG_ID`. A nested `.vercel/project.json` alone did not prevent the CLI from choosing the parent repository's project during this migration.

From this repository's root:

```sh
node infra/mcp-gateway/generate.mjs
npm --prefix mcp run check
node infra/mcp-gateway/deploy.mjs sandbox metascraper
node infra/mcp-gateway/deploy.mjs sandbox gateway
node infra/mcp-gateway/deploy.mjs production metascraper
node infra/mcp-gateway/deploy.mjs production gateway
node mcp/scripts/verify-environments.mjs
```

The deployment helper uploads an explicit allowlist of files from a fresh temporary directory; it does not upload secrets, user photos, dependencies or unrelated repository contents. The gateway and backend deploy independently; deploy only the component that changed. Confirm the printed project ID before interpreting a deployment as successful. CLI deployments use the working tree and do not commit or push it.

Acceptance must include TLS, initialization, tool and resource discovery, native widget behavior, prefixed supporting routes, a real download, and cross-environment denial. For MetaScraper, also test a file larger than 4.5 MB through multipart upload and streaming download. Keep existing endpoints functioning while clients migrate; use request forwarding rather than HTTP redirects for MCP POSTs. Legacy MetaScraper remains available at `https://mcp.metascraper.luccilabs.xyz/mcp`.

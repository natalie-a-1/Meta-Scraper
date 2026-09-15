# MetaScraper on Vercel

| Environment | MCP endpoint | Browser panel | ChatGPT connection |
| --- | --- | --- | --- |
| Production | https://mcp.luccilabs.xyz/metascraper | https://mcp.luccilabs.xyz/metascraper/ui | MetaScraper |
| Sandbox | https://sandbox.mcp.luccilabs.xyz/metascraper | https://sandbox.mcp.luccilabs.xyz/metascraper/ui | MetaScraper Sandbox |

The product URL is the complete MCP endpoint; no additional `/mcp` suffix is needed. The previous endpoint, `https://mcp.metascraper.luccilabs.xyz/mcp`, remains a compatibility endpoint.

## Architecture

The `lucci-mcp` and `lucci-mcp-sandbox` Vercel projects own the shared domains and forward product-prefixed requests to independently deployed backends. MetaScraper production runs in `metascraper`; sandbox runs in `metascraper-sandbox`. The gateway contains no photo-processing code or database credentials.

`Dockerfile.vercel` packages Node.js 22, Perl, ExifTool, the built v7 widget and workflow skill. Both backends use Vercel's container-image beta in `iad1`. A local tunnel or Docker daemon is not required.

Production Redis is `metascraper-photos`; sandbox Redis is `metascraper-sandbox-photos`. They have separate databases and credentials, and are connected only to their own project's primary deployment slot. Production credentials have been removed from preview configuration. Both resources use metered pay-as-you-go Upstash with automatic upgrades and eviction disabled.

Private photo records and chunks expire after 30 minutes. Incomplete multipart uploads expire after five minutes. Scratch files are removed after processing. Each store limits active processing to four operations, reservations to 100 objects and 200 MiB of raw photo bytes. Base64 storage is larger than the original bytes. Application expiry does not determine provider backup/erasure policies.

The panel sends large files in 512 KiB parts; downloads stream through the gateway. ChatGPT imports original attachments using the host-provided descriptor. The supported file limit remains 20 MiB.

## Configuration

| Variable | Production project | Sandbox project |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | `https://mcp.luccilabs.xyz/metascraper` | `https://sandbox.mcp.luccilabs.xyz/metascraper` |
| `ORIGIN_URLS` | `https://mcp.metascraper.luccilabs.xyz` | `https://metascraper-sandbox.vercel.app` |
| `APP_ENV` | `production` | `sandbox` |
| `PHOTO_STORAGE` | `redis` | `redis` |
| `PORT` | `3000` | `3000` |
| `DEBUG_MCP` | `0` | `0` |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Production integration only | Sandbox integration only |

The Redis adapter also accepts corresponding `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` names. Secrets stay in Vercel environment variables or ignored local files. The production project has no production Redis credentials in preview; configure a separate preview store before expecting those deployments to run. For a stable test endpoint, use the sandbox project.

## Deployment and acceptance

Read the [shared conventions](../../infra/mcp-gateway/CONVENTIONS.md) and use the [route registry](../../infra/mcp-gateway/registry.json). The explicit deployment helper pins project/team IDs and uploads a clean file allowlist, avoiding parent-project discovery surprises.

```sh
# From the repository root. Deploy only the component that changed.
npm --prefix mcp run check
node infra/mcp-gateway/deploy.mjs sandbox metascraper
node infra/mcp-gateway/deploy.mjs production metascraper

# When gateway routes change:
node infra/mcp-gateway/generate.mjs
node infra/mcp-gateway/deploy.mjs sandbox gateway
node infra/mcp-gateway/deploy.mjs production gateway

# Actual public endpoint tests using disposable synthetic photos:
node mcp/scripts/verify-environments.mjs
```

Live acceptance verifies both MCP endpoints and v7 resources, cleanup and prefixed downloads, cross-environment access denial in both directions, and a file larger than 4.5 MB through multipart upload and streaming download. The offline suite also covers allowed proxy origins, URL prefixes and registry separation. Earlier Redis-specific opt-in tests remain available in `mcp/test/redis-store.test.mjs`.

CLI deployment does not commit or push source. All deployment changes must still be committed separately to reproduce them from Git alone.

## ChatGPT connections

- Production: **MetaScraper**, app ID `asdk_app_6aa6c65f17048191b8d5f66961288d7b`.
- Sandbox: **MetaScraper Sandbox**, app ID `asdk_app_6aa6c6f7ed308191841445363567f874`.
- Compatibility: **MetaScraper (legacy URL)**, app ID `asdk_app_6aa58e6cd270819193e81765742cebd3`.

The new connections use No Auth and v7 tool/resource discovery. Start a fresh conversation and select the intended environment. Old conversation cards remain associated with their original connection. These are private developer-mode connections, not public-directory submissions.

References: [Vercel rewrites](https://vercel.com/docs/routing/rewrites), [container images](https://vercel.com/docs/functions/container-images), [environment variables](https://vercel.com/docs/environment-variables).

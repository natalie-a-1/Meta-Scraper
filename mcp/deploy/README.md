# MetaScraper MCP deployment

This repository owns the photo MCP backend. Shared route configuration and gateway deployment are in [lucci-xyz/mcp](https://github.com/lucci-xyz/mcp); do not copy its route file here.

| Environment | Public endpoint | Backend Vercel project | Photo store |
| --- | --- | --- | --- |
| Production | `https://mcp.luccilabs.xyz/metascraper` | `metascraper` | `metascraper-photos` |
| Sandbox | `https://sandbox.mcp.luccilabs.xyz/metascraper` | `metascraper-sandbox` | `metascraper-sandbox-photos` |

Both backends run the same `Dockerfile.vercel` image on separate Vercel projects. Both Vercel projects are linked to this repository's `main` branch. A push automatically deploys the sandbox backend and builds a **staged** production deployment. Production custom domains do not move until that build is promoted after sandbox checks (`autoAssignCustomDomains=false` on the production project). This keeps the source commit the same while environment variables and photo stores stay separate. `PUBLIC_BASE_URL` must equal the relevant public endpoint; `ORIGIN_URLS` lists only that backend's accepted HTTPS origin. Set `APP_ENV` to `production` or `sandbox`, `PHOTO_STORAGE=redis`, and attach only the matching Upstash Redis integration. Keep preview free of production Redis credentials. Secrets belong in Vercel environment settings, never Git.

Before pushing, run `npm --prefix mcp ci && npm --prefix mcp run check`. Confirm the GitHub MCP check and sandbox Vercel deployment are ready, then run `node mcp/scripts/verify-environments.mjs` from the repository root. It uses synthetic photos to test MCP initialization, tools, cleanup, public links, downloads and cross-environment denial. Inspect the staged production deployment for the same source commit, promote it with `vercel promote <deployment-id> --scope lucci`, and repeat the live acceptance check. Keep the previous production deployment for rollback. Run the ChatGPT attachment and widget checks in a fresh conversation as described in [mcp/README.md](../README.md). A health response alone does not establish that the app works.

The old direct endpoint `https://mcp.metascraper.luccilabs.xyz/mcp` may still have client references. Forward its POSTs until those clients are migrated; review connection IDs and access logs before retiring it. See the shared repository handoff for current live status.

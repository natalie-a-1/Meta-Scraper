# MetaScraper product

This repository owns MetaScraper's VS Code extension and MCP photo-processing application. Shared routes and gateway deployment belong to `lucci-xyz/mcp`; read its README and handoff before changing a public MCP URL.

Production MCP: `https://mcp.luccilabs.xyz/metascraper`. Sandbox MCP: `https://sandbox.mcp.luccilabs.xyz/metascraper`. Keep the old direct `/mcp` URL working until client references have migrated. Use separate Vercel projects and photo stores; never expose production storage credentials to preview or sandbox.

Run `npm --prefix mcp run check` for MCP changes and `node mcp/scripts/verify-environments.mjs` for live synthetic photo acceptance. Do not log photo bytes or capability URLs.


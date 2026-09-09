import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.mjs";
import { toolDefinitions, invokeTool } from "./tools.mjs";

export function createHttpApp({ store, html, getBaseUrl }) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    const baseUrl = new URL(getBaseUrl());
    // No trust in forwarded Host headers; protects local deployments from DNS rebinding.
    if (req.headers.host !== baseUrl.host)
      return res.status(403).json({ error: "Unrecognized host." });
    if (req.headers.origin && req.headers.origin !== baseUrl.origin)
      return res.status(403).json({ error: "Unrecognized origin." });
    next();
  });
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/", (_req, res) => {
    res.set(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    res.type("html").send(html);
  });
  app.get("/files/:photoId", async (req, res) => {
    try {
      const { photo, bytes } = await store.read(req.params.photoId);
      res.set({
        "Content-Type": photo.metadata.mimeType,
        "Content-Disposition": `attachment; filename="photo.${photo.metadata.format.toLowerCase()}"; filename*=UTF-8''${encodeURIComponent(photo.name)}`,
        "Content-Length": String(bytes.length),
      });
      res.send(bytes);
    } catch {
      res
        .status(404)
        .json({ error: "Photo expired or unavailable. Upload it again." });
    }
  });
  app.use(express.json({ limit: "29mb", strict: true }));
  app.post("/api/tools/:name", async (req, res) => {
    const definition = toolDefinitions(store, getBaseUrl()).find(
      (tool) => tool.name === req.params.name,
    );
    if (!definition) return res.status(404).json({ error: "Unknown tool." });
    const result = await invokeTool(definition, req.body);
    res.status(result.isError ? 400 : 200).json(result);
  });
  app.post("/mcp", async (req, res) => {
    const server = createMcpServer(store, getBaseUrl(), html);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent)
        res
          .status(500)
          .json({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32603, message: "Request failed." },
          });
    }
  });
  app.all("/mcp", (_req, res) => res.status(405).set("Allow", "POST").end());
  app.use((error, _req, res, _next) =>
    res
      .status(error.type === "entity.too.large" ? 413 : 400)
      .json({ error: "Invalid request or file exceeds 20 MB." }),
  );
  return app;
}

import { readFile } from "node:fs/promises";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PhotoStore } from "./store.mjs";
import { createHttpApp } from "./http.mjs";
import { createMcpServer } from "./server.mjs";
import { RedisPhotoStore } from "./redis-store.mjs";

const stdio = process.argv.includes("--stdio");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || (stdio ? 0 : 3000));
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("PORT must be between 0 and 65535.");
let baseUrl = process.env.PUBLIC_BASE_URL;
if (baseUrl) {
  const url = new URL(baseUrl);
  if (
    url.protocol !== "https:" ||
    !/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)?$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "PUBLIC_BASE_URL must be an HTTPS origin with an optional product slug, without query, fragment, or credentials.",
    );
  }
  baseUrl = `${url.origin}${url.pathname.replace(/\/$/, "")}`;
} else if (!["127.0.0.1", "localhost"].includes(host)) {
  throw new Error(
    "Set PUBLIC_BASE_URL to the HTTPS origin when listening beyond localhost.",
  );
}
const html = await readFile(
  new URL("../dist/photo.html", import.meta.url),
  "utf8",
);
if (process.env.VERCEL && process.env.PHOTO_STORAGE !== "redis")
  throw new Error("Vercel requires PHOTO_STORAGE=redis and shared storage credentials.");
const store = await (process.env.PHOTO_STORAGE === "redis" ? new RedisPhotoStore() : new PhotoStore()).init();
const allowedOrigins = (process.env.ORIGIN_URLS || "").split(",").filter(Boolean).map((value) => {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password)
    throw new Error("ORIGIN_URLS must contain only explicit HTTPS origins.");
  return url.origin;
});
const app = createHttpApp({ store, html, getBaseUrl: () => baseUrl, allowedOrigins });
const listener = app.listen(port, host);
await new Promise((resolve, reject) => {
  listener.once("listening", resolve);
  listener.once("error", reject);
});
baseUrl ||= `http://${host}:${listener.address().port}`;
console.error(`MetaScraper ready: ${baseUrl}`);
let mcp;
if (stdio) {
  mcp = createMcpServer(store, baseUrl, html);
  await mcp.connect(new StdioServerTransport());
  process.stdin.on("end", shutdown);
}
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  listener.close();
  await mcp?.close();
  await store.close();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

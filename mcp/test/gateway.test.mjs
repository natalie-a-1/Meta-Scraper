import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import { createHttpApp } from "../src/http.mjs";
import { PhotoStore } from "../src/store.mjs";
import { fixture } from "./fixtures.mjs";

test("product-path responses retain the public prefix and reject foreign proxy origins", async (t) => {
  const store = await new PhotoStore().init();
  const publicBase = "https://mcp.luccilabs.xyz/metascraper";
  const origin = "https://metascraper-origin.example";
  const app = createHttpApp({ store, html: "<html>Photo panel</html>", getBaseUrl: () => publicBase, allowedOrigins: [origin] });
  const listener = app.listen(0, "127.0.0.1");
  await new Promise(resolve => listener.once("listening", resolve));
  t.after(async () => { listener.closeAllConnections(); await new Promise(resolve => listener.close(resolve)); await store.close(); });
  const local = `http://127.0.0.1:${listener.address().port}`;
  const headers = { Host: new URL(origin).host, Origin: new URL(publicBase).origin, "Content-Type": "application/json" };
  const send = (path, { method = "GET", headers: requestHeaders = headers, body } = {}) => new Promise((resolve, reject) => {
    const req = request(`${local}${path}`, { method, headers: requestHeaders }, res => {
      let text = "";
      res.on("data", chunk => { text += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, text }));
    });
    req.on("error", reject);
    req.end(body);
  });
  const call = async (name, args) => JSON.parse((await send(`/api/tools/${name}`, { method: "POST", body: JSON.stringify(args) })).text);
  const opened = await call("open_photo", {});
  assert.ok(opened.structuredContent, JSON.stringify(opened));
  assert.equal(opened.structuredContent.uploadUrl, `${publicBase}/ui`);
  const uploaded = await call("upload_photo", { fileName: "gateway.jpg", base64: (await fixture(store)).toString("base64") });
  assert.match(uploaded.structuredContent.downloadUrl, /^https:\/\/mcp\.luccilabs\.xyz\/metascraper\/files\/[a-f0-9]{64}$/);
  assert.equal((await send("/ui")).status, 200);
  assert.equal((await send("/health", { headers: { ...headers, Origin: "https://sandbox.mcp.luccilabs.xyz" } })).status, 403);
  assert.equal((await send("/health", { headers: { ...headers, Host: "foreign.example", "X-Forwarded-Host": new URL(publicBase).host } })).status, 403);
});

test("shared gateways route only registered products to distinct environment origins", async () => {
  const configs = await Promise.all(["production", "sandbox"].map(async env => JSON.parse(await readFile(new URL(`../../infra/mcp-gateway/${env}/vercel.json`, import.meta.url), "utf8"))));
  for (const config of configs) {
    assert.equal(config.rewrites[0].source, "/metascraper");
    assert.ok(config.rewrites[0].destination.endsWith("/mcp"));
    assert.equal(config.rewrites[1].source, "/metascraper/:path*");
    assert.equal(config.rewrites.length, 2);
    assert.ok(config.headers[0].headers.some(h => h.key === "Cache-Control" && h.value === "no-store"));
  }
  assert.notEqual(new URL(configs[0].rewrites[0].destination).origin, new URL(configs[1].rewrites[0].destination).origin);
});

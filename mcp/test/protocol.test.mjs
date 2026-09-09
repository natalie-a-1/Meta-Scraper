import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { App } from "@modelcontextprotocol/ext-apps";
import { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";
import { createHttpApp } from "../src/http.mjs";
import { PhotoStore } from "../src/store.mjs";
import { UI_URI } from "../src/tools.mjs";
import { fixture } from "./fixtures.mjs";

async function start(t) {
  const store = await new PhotoStore().init();
  const html = await readFile(
    new URL("../dist/photo.html", import.meta.url),
    "utf8",
  );
  let baseUrl;
  const app = createHttpApp({ store, html, getBaseUrl: () => baseUrl });
  const listener = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => listener.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${listener.address().port}`;
  t.after(async () => {
    listener.closeAllConnections();
    await new Promise((resolve) => listener.close(resolve));
    await store.close();
  });
  const client = new Client({ name: "protocol-test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)),
  );
  t.after(() => client.close());
  return { store, client, baseUrl };
}

test("Streamable HTTP: tool discovery, file schema, upload, inspect, remove, download, delete, and errors", async (t) => {
  const { store, client, baseUrl } = await start(t);
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      "open_photo",
      "upload_photo",
      "import_photo",
      "view_metadata",
      "remove_metadata",
      "delete_photo",
    ],
  );
  for (const tool of tools) {
    assert.ok(tool.inputSchema);
    assert.ok(tool.outputSchema);
    assert.equal(typeof tool.annotations.readOnlyHint, "boolean");
    assert.equal(typeof tool.annotations.destructiveHint, "boolean");
    assert.equal(typeof tool.annotations.openWorldHint, "boolean");
  }
  const importer = tools.find((tool) => tool.name === "import_photo");
  assert.deepEqual(importer._meta["openai/fileParams"], ["file"]);
  assert.deepEqual(importer.inputSchema.properties.file.required, [
    "download_url",
    "file_id",
  ]);
  assert.deepEqual(
    Object.keys(importer.inputSchema.properties.file.properties),
    ["download_url", "file_id", "mime_type", "file_name"],
  );
  const opened = await client.callTool({ name: "open_photo", arguments: {} });
  assert.equal(opened.structuredContent.uploadUrl, baseUrl);
  const { contents } = await client.readResource({ uri: UI_URI });
  assert.equal(contents[0].mimeType, "text/html;profile=mcp-app");
  assert.ok(contents[0].text.includes("Choose a photo"));
  assert.deepEqual(contents[0]._meta.ui.csp.connectDomains, []);
  const bytes = await fixture(store);
  const uploaded = await client.callTool({
    name: "upload_photo",
    arguments: { fileName: "photo.jpg", base64: bytes.toString("base64") },
  });
  assert.ok(!uploaded.isError, JSON.stringify(uploaded));
  const photoId = uploaded.structuredContent.photo.photoId;
  const viewed = await client.callTool({
    name: "view_metadata",
    arguments: { photoId },
  });
  assert.ok(
    viewed.structuredContent.photo.fields.some(
      (field) => field.id === "GPS:GPSLatitude",
    ),
  );
  const clean = await client.callTool({
    name: "remove_metadata",
    arguments: { photoId, selection: "all" },
  });
  assert.ok(!clean.isError, JSON.stringify(clean));
  assert.equal(clean.structuredContent.photo.fields.length, 0);
  const download = await fetch(clean.structuredContent.downloadUrl);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "image/jpeg");
  assert.match(download.headers.get("content-disposition"), /attachment/);
  assert.equal(download.headers.get("cache-control"), "no-store");
  assert.ok((await download.arrayBuffer()).byteLength > 0);
  const original = await fetch(uploaded.structuredContent.downloadUrl);
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
  await client.callTool({
    name: "delete_photo",
    arguments: { photoId: clean.structuredContent.photo.photoId },
  });
  assert.equal((await fetch(clean.structuredContent.downloadUrl)).status, 404);
  const invalid = await client.callTool({
    name: "remove_metadata",
    arguments: { photoId, selection: [] },
  });
  assert.equal(invalid.isError, true);
  const missing = await client.callTool({
    name: "view_metadata",
    arguments: { photoId: "0".repeat(64) },
  });
  assert.equal(missing.isError, true);
  assert.ok(!JSON.stringify(missing).includes(store.root));
  const blocked = await client.callTool({
    name: "import_photo",
    arguments: {
      file: { download_url: "http://169.254.169.254", file_id: "file_test" },
    },
  });
  assert.equal(blocked.isError, true);
});

test("MCP Apps bridge: initialize, receive result, upload, clean, update context, and host-mediated download", async (t) => {
  const { store, client } = await start(t);
  const bridge = new AppBridge(
    client,
    { name: "standards-test-host", version: "1.0.0" },
    { serverTools: {}, openLinks: {}, updateModelContext: {} },
  );
  let openedUrl;
  bridge.onopenlink = async ({ url }) => {
    openedUrl = url;
    return {};
  };
  bridge.onupdatemodelcontext = async () => ({});
  const app = new App(
    { name: "photo-test", version: "1.0.0" },
    {},
    { autoResize: false },
  );
  const received = new Promise((resolve) => {
    app.ontoolresult = resolve;
  });
  const [hostTransport, viewTransport] = InMemoryTransport.createLinkedPair();
  await bridge.connect(hostTransport);
  await app.connect(viewTransport);
  t.after(async () => {
    await app.close();
    await bridge.close();
  });
  await bridge.sendToolInput({ arguments: {} });
  await bridge.sendToolResult(
    await client.callTool({ name: "open_photo", arguments: {} }),
  );
  assert.ok((await received).structuredContent.uploadUrl);
  const bytes = await fixture(store);
  const result = await app.callServerTool({
    name: "upload_photo",
    arguments: { fileName: "photo.jpg", base64: bytes.toString("base64") },
  });
  assert.ok(!result.isError, JSON.stringify(result));
  const cleaned = await app.callServerTool({
    name: "remove_metadata",
    arguments: {
      photoId: result.structuredContent.photo.photoId,
      selection: ["IFD0:Artist"],
    },
  });
  assert.equal(cleaned.structuredContent.photo.cleaning.verified, true);
  await app.updateModelContext({
    content: [{ type: "text", text: cleaned.structuredContent.photo.photoId }],
  });
  await app.openLink({ url: cleaned.structuredContent.downloadUrl });
  assert.equal(openedUrl, cleaned.structuredContent.downloadUrl);
});

test("HTTP boundaries reject foreign origins/hosts, missing photos, arbitrary paths, and malformed JSON", async (t) => {
  const { baseUrl } = await start(t);
  assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
  const hostStatus = await new Promise((resolve, reject) => {
    get(baseUrl, { headers: { Host: "evil.example" } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    }).on("error", reject);
  });
  assert.equal(hostStatus, 403);
  assert.equal(
    (
      await fetch(`${baseUrl}/api/tools/open_photo`, {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal((await fetch(`${baseUrl}/files/not-a-photo`)).status, 404);
  assert.equal(
    (
      await fetch(`${baseUrl}/api/tools/unknown`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{broken",
      })
    ).status,
    400,
  );
  assert.equal(
    (await fetch(`${baseUrl}/mcp`, { method: "DELETE" })).status,
    405,
  );
});

test("stdio entry point works from any current directory and returns working local upload/download URLs", async (t) => {
  const fixtures = await new PhotoStore().init();
  t.after(() => fixtures.close());
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      fileURLToPath(new URL("../src/main.mjs", import.meta.url)),
      "--stdio",
    ],
    cwd: tmpdir(),
    stderr: "pipe",
  });
  const client = new Client({ name: "stdio-test", version: "1.0.0" });
  t.after(() => client.close());
  await client.connect(transport);
  const opened = await client.callTool({ name: "open_photo", arguments: {} });
  assert.ok(opened.structuredContent.uploadUrl.startsWith("http://127.0.0.1:"));
  assert.equal((await fetch(opened.structuredContent.uploadUrl)).status, 200);
  assert.equal((await client.listTools()).tools.length, 6);
  const uploaded = await client.callTool({
    name: "upload_photo",
    arguments: {
      fileName: "stdio-photo.jpg",
      base64: (await fixture(fixtures)).toString("base64"),
    },
  });
  assert.ok(!uploaded.isError, JSON.stringify(uploaded));
  const clean = await client.callTool({
    name: "remove_metadata",
    arguments: {
      photoId: uploaded.structuredContent.photo.photoId,
      selection: "all",
    },
  });
  assert.ok(!clean.isError, JSON.stringify(clean));
  assert.equal(clean.structuredContent.photo.fields.length, 0);
  assert.equal((await fetch(clean.structuredContent.downloadUrl)).status, 200);
});

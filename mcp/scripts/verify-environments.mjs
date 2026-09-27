// Explicit live acceptance test. Uses only synthetic photos and deletes its handles.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { PhotoStore } from "../src/store.mjs";
import { fixture } from "../test/fixtures.mjs";

const bases = ["https://mcp.luccilabs.xyz/metascraper", "https://sandbox.mcp.luccilabs.xyz/metascraper"];
const local = await new PhotoStore().init();
const clients = [];
const handles = [[], []];
async function call(index, name, args) {
  const result = await clients[index].callTool({ name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result));
  return result.structuredContent;
}
try {
  for (const base of bases) {
    const client = new Client({ name: "environment-acceptance", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(base)));
    clients.push(client);
  }
  const original = await fixture(local);
  for (let i = 0; i < clients.length; i++) {
    const opened = await call(i, "open_photo", {});
    assert.equal(opened.uploadUrl, `${bases[i]}/ui`);
    assert.equal((await clients[i].listResources()).resources[0].uri, "ui://meta-scraper/photo-v7.html");
    const uploaded = await call(i, "upload_photo", { fileName: "environment-test.jpg", base64: original.toString("base64") });
    handles[i].push(uploaded.photo.photoId);
    assert.ok(uploaded.photo.fields.length > 0);
    const cleaned = await call(i, "remove_metadata", { photoId: uploaded.photo.photoId, selection: "all" });
    handles[i].push(cleaned.photo.photoId);
    assert.equal(cleaned.photo.fields.length, 0);
    assert.ok(cleaned.downloadUrl.startsWith(`${bases[i]}/files/`));
    const response = await fetch(cleaned.downloadUrl);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const output = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(await sharp(output).raw().toBuffer(), await sharp(original).raw().toBuffer());
    assert.equal((await local.upload(output, "verified.jpg")).fields.length, 0);
    assert.equal((await fetch(`${bases[i]}/ui`)).status, 200);
    assert.equal((await fetch(bases[i], { headers: { Accept: "text/event-stream" } })).status, 405);
    console.log(`${i ? "sandbox" : "production"}: MCP, v7 widget, cleanup and canonical download passed`);
  }
  for (let i = 0; i < 2; i++) {
    const foreign = handles[1 - i][0];
    assert.equal((await clients[i].callTool({ name: "view_metadata", arguments: { photoId: foreign } })).isError, true);
    assert.equal((await fetch(`${bases[i]}/files/${foreign}`)).status, 404);
  }
  console.log("Cross-environment access rejected in both directions");

  const large = await sharp(randomBytes(2048 * 1024 * 3), { raw: { width: 2048, height: 1024, channels: 3 } }).png().withExif({ IFD0: { Artist: "Synthetic test" } }).toBuffer();
  const partSize = 512 * 1024;
  let uploadId, result;
  for (let part = 0, parts = Math.ceil(large.length / partSize); part < parts; part++) {
    result = await call(0, "upload_photo", { fileName: "gateway-large.png", uploadId, part, parts, base64: large.subarray(part * partSize, (part + 1) * partSize).toString("base64") });
    uploadId = result.uploadId;
  }
  handles[0].push(result.photo.photoId);
  const cleaned = await call(0, "remove_metadata", { photoId: result.photo.photoId, selection: "all" });
  handles[0].push(cleaned.photo.photoId);
  const response = await fetch(cleaned.downloadUrl);
  assert.equal(response.status, 200);
  const output = Buffer.from(await response.arrayBuffer());
  assert.ok(output.length > 4.5 * 1024 * 1024);
  assert.equal(cleaned.photo.fields.length, 0);
  assert.deepEqual(await sharp(output).raw().toBuffer(), await sharp(large).raw().toBuffer());
  console.log(`Large upload and streamed download through gateway passed (${output.length} bytes)`);
} finally {
  for (let i = 0; i < clients.length; i++) {
    for (const photoId of handles[i]) await clients[i].callTool({ name: "delete_photo", arguments: { photoId } });
    await clients[i].close();
  }
  await local.close();
}

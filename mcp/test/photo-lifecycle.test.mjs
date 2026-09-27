import { test } from "node:test";
import assert from "node:assert/strict";
import { photoExpired, photoError, expiredMessage } from "../web/photo-lifecycle.mjs";

test("replayed photo results expire at the server deadline", () => {
  const photo = { expiresAt: "2026-09-10T03:00:00Z" };
  const deadline = Date.parse(photo.expiresAt);
  assert.equal(photoExpired(photo, deadline - 1), false);
  assert.equal(photoExpired(photo, deadline), true);
  assert.equal(photoExpired(photo, deadline + 60_000), true);
  assert.equal(photoExpired(null, deadline), false);
});

test("ChatGPT-wrapped expiration errors recover without exposing MCP internals", () => {
  const wrapped = new Error("MCP error -32000: Error code: INVALID_ARGUMENT; Error: RuntimeException: Error calling MCP tool: [TextContent(type='text', text='This photo has expired or is unavailable. Upload it again.', annotations=None, meta=None)]");
  assert.deepEqual(photoError(wrapped), { expired: true, message: expiredMessage });
  assert.deepEqual(photoError("This photo has expired or is unavailable. Upload it again."), { expired: true, message: expiredMessage });
  assert.doesNotMatch(photoError(new Error("MCP error -32000: server disconnected")).message, /MCP|32000/);
  assert.equal(photoError(new Error("Choose one photo at a time.")).message, "Choose one photo at a time.");
});

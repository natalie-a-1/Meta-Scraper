import { test } from "node:test";
import assert from "node:assert/strict";
import { validateUploadUrl, isPublicIPv4 } from "../src/download.mjs";

test("attachment imports accept only HTTPS OpenAI file hosts without credentials", () => {
  assert.equal(
    validateUploadUrl("https://files.oaiusercontent.com/photo?sig=test")
      .hostname,
    "files.oaiusercontent.com",
  );
  for (const url of [
    "file:///etc/passwd",
    "http://files.oaiusercontent.com/photo",
    "https://localhost/photo",
    "https://files.oaiusercontent.com.evil.test/photo",
    "https://evil.test/photo",
    "https://user:secret@files.oaiusercontent.com/photo",
    "https://files.oaiusercontent.com:8443/photo",
    "invalid",
  ]) {
    assert.throws(() => validateUploadUrl(url));
  }
});
test("pinned download addresses cannot target private or reserved networks", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.2",
    "169.254.169.254",
    "100.64.1.2",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "198.18.0.1",
    "192.0.2.1",
  ])
    assert.equal(isPublicIPv4(ip), false, ip);
  assert.equal(isPublicIPv4("8.8.8.8"), true);
});

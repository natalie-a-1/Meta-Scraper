import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { RedisPhotoStore, CHUNK_BYTES } from "../src/redis-store.mjs";
import { PhotoStore } from "../src/store.mjs";
import { fixture } from "./fixtures.mjs";

const enabled = process.env.RUN_REDIS_TESTS === "1";

async function setup(t) {
  const prefix = `metascraper-test:${randomBytes(12).toString("hex")}:`;
  const first = await new RedisPhotoStore({ prefix }).init();
  const second = await new RedisPhotoStore({ prefix }).init();
  const local = await new PhotoStore().init();
  t.after(async () => {
    await local.close();
    let cursor = 0;
    do {
      const [next, keys] = await first.redis.scan(cursor, { match: `${prefix}*`, count: 100 });
      cursor = Number(next);
      if (keys.length) await first.redis.del(...keys);
    } while (cursor);
  });
  return { first, second, bytes: await fixture(local) };
}

test("Redis: another instance can inspect, selectively clean, download and delete the same photo", { skip: !enabled }, async (t) => {
  const { first, second, bytes } = await setup(t);
  const photo = await first.upload(bytes, "test.jpg");
  const restored = second.describe(await second.get(photo.photoId));
  assert.deepEqual(restored, photo);
  const artist = photo.fields.find(field => field.name === "Artist");
  const selected = await second.clean(photo.photoId, [artist.id]);
  assert(!selected.fields.some(field => field.id === artist.id));
  assert(selected.fields.some(field => field.name === "GPSLatitude"));
  const cleaned = await first.clean(photo.photoId, "all");
  assert.equal(cleaned.fields.length, 0);
  assert.deepEqual((await second.read(photo.photoId)).bytes, bytes);
  assert((await second.read(cleaned.photoId)).bytes.length > 0);
  await first.delete(cleaned.photoId);
  await assert.rejects(second.get(cleaned.photoId), /expired/);
  assert(await second.get(photo.photoId));
});

test("Redis: uploads span requests, reject missing/reordered parts, and preserve exact original bytes", { skip: !enabled }, async (t) => {
  const { first, second, bytes } = await setup(t);
  // Valid JPEG plus trailing bytes exercises transfers without personal images.
  const large = Buffer.concat([bytes, Buffer.alloc(CHUNK_BYTES * 2)]);
  const parts = Math.ceil(large.length / CHUNK_BYTES);
  const initial = await first.uploadPart({ part: 0, parts, bytes: large.subarray(0, CHUNK_BYTES), fileName: "large.jpg" });
  await assert.rejects(second.uploadPart({ uploadId: initial.uploadId, part: 2, parts, bytes: large.subarray(CHUNK_BYTES * 2), fileName: "large.jpg" }), /incomplete/);
  const next = await second.uploadPart({ uploadId: initial.uploadId, part: 1, parts, bytes: large.subarray(CHUNK_BYTES, CHUNK_BYTES * 2), fileName: "large.jpg" });
  const result = await first.uploadPart({ uploadId: next.uploadId, part: 2, parts, bytes: large.subarray(CHUNK_BYTES * 2), fileName: "large.jpg" });
  assert.deepEqual((await second.read(result.photo.photoId)).bytes, large);
  await assert.rejects(first.get(initial.uploadId), /expired/);
  await assert.rejects(first.uploadPart({ part: 0, parts: 41, bytes, fileName: "too-large.jpg" }), /incomplete/);
});

test("Redis: shared leases prevent cleanup/deletion races and TTL expires photo data", { skip: !enabled }, async (t) => {
  const { first, second, bytes } = await setup(t);
  const photo = await first.upload(bytes, "expiry.jpg");
  await first.lease(first.key(photo.photoId, "lock"), async () => {
    await assert.rejects(second.delete(photo.photoId), /busy/);
    await assert.rejects(second.clean(photo.photoId, "all"), /busy/);
  });
  const ttl = await first.redis.pttl(first.key(photo.photoId));
  assert(ttl > 0 && ttl <= 30 * 60 * 1000);
  assert(await first.redis.pttl(first.key(photo.photoId, "part:0")) > 0);
  await first.redis.pexpire(first.key(photo.photoId), 100);
  await first.redis.pexpire(first.key(photo.photoId, "part:0"), 100);
  await setTimeout(200);
  await assert.rejects(second.get(photo.photoId), /expired/);
  assert.equal(await first.redis.get(first.key(photo.photoId, "part:0")), null);
});

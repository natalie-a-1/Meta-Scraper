import { randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";
import { PhotoStore, MAX_BYTES, TTL_MS } from "./store.mjs";
import { UserError } from "./errors.mjs";

export const CHUNK_BYTES = 512 * 1024;
const MAX_PARTS = Math.ceil(MAX_BYTES / CHUNK_BYTES);
const unavailable = () => new UserError("This photo has expired or is unavailable. Upload it again.");
const busy = () => new UserError("The photo service is busy. Try again shortly.");
const newId = () => randomBytes(32).toString("hex");
const release = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;
const reserve = `
local expired = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
for _, id in ipairs(expired) do redis.call('HDEL', KEYS[2], id) end
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
local total = 0
for _, bytes in ipairs(redis.call('HVALS', KEYS[2])) do total = total + tonumber(bytes) end
if redis.call('ZCARD', KEYS[1]) >= 100 or total + tonumber(ARGV[3]) > 209715200 then return 0 end
redis.call('ZADD', KEYS[1], ARGV[4], ARGV[2])
redis.call('HSET', KEYS[2], ARGV[2], ARGV[3])
redis.call('PEXPIRE', KEYS[1], 3600000)
redis.call('PEXPIRE', KEYS[2], 3600000)
return 1`;

// The shared store keeps only private, expiring keys. Disk is scratch space for
// one operation; no subsequent request depends on the same function instance.
export class RedisPhotoStore {
  constructor({ redis, prefix = "metascraper:v1:", ttlMs = TTL_MS, now = Date.now } = {}) {
    this.redis = redis || new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
      automaticDeserialization: false,
    });
    this.prefix = prefix;
    this.ttlMs = ttlMs;
    this.now = now;
    this.uploadChunkBytes = CHUNK_BYTES;
  }
  key(id, suffix = "record") {
    if (!/^[a-f0-9]{64}$/.test(id)) throw unavailable();
    return `${this.prefix}${id}:${suffix}`;
  }
  async init() { await this.redis.ping(); return this; }
  async close() {}
  describe(photo) { return PhotoStore.prototype.describe.call(this, photo); }
  async get(id) {
    const value = await this.redis.get(this.key(id));
    if (!value) throw unavailable();
    const photo = typeof value === "string" ? JSON.parse(value) : value;
    if (photo.expiresAt <= this.now()) throw unavailable();
    return photo;
  }
  async lease(key, work) {
    const token = newId();
    if (await this.redis.set(key, token, { nx: true, px: 300_000 }) !== "OK") throw busy();
    try { return await work(); }
    finally { await this.redis.eval(release, [key], [token]); }
  }
  async processing(work) {
    for (let i = 0; i < 4; i++) {
      const key = `${this.prefix}processing:${i}`;
      const token = newId();
      if (await this.redis.set(key, token, { nx: true, px: 300_000 }) !== "OK") continue;
      try { return await work(); }
      finally { await this.redis.eval(release, [key], [token]); }
    }
    throw busy();
  }
  async reserve(id, bytes, expiresAt) {
    const ok = await this.redis.eval(reserve,
      [`${this.prefix}capacity`, `${this.prefix}sizes`],
      [this.now(), id, bytes, expiresAt]);
    if (!ok) throw busy();
  }
  async forget(id, kind = "part") {
    await this.redis.del(this.key(id), ...Array.from({ length: MAX_PARTS }, (_, i) => this.key(id, `${kind}:${i}`)));
    await this.redis.eval(`redis.call('ZREM', KEYS[1], ARGV[1]); return redis.call('HDEL', KEYS[2], ARGV[1])`,
      [`${this.prefix}capacity`, `${this.prefix}sizes`], [id]);
  }
  async persist(local, result) {
    const { photo, bytes } = await local.read(result.photoId);
    const id = newId();
    const expiresAt = this.now() + this.ttlMs;
    await this.reserve(id, bytes.length, expiresAt);
    const record = { ...photo, id, expiresAt, parts: Math.ceil(bytes.length / CHUNK_BYTES) };
    delete record.path;
    delete record.locks;
    try {
      // Keep each Redis request small, including for 20 MiB originals.
      for (let i = 0; i < record.parts; i++) {
        await this.redis.set(this.key(id, `part:${i}`), bytes.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES).toString("base64"), { pxat: expiresAt });
      }
      await this.redis.set(this.key(id), record, { pxat: expiresAt });
      return this.describe(record);
    } catch (error) { await this.forget(id); throw error; }
  }
  async upload(bytes, fileName) {
    return this.processing(async () => {
      const local = await new PhotoStore().init();
      try { return await this.persist(local, await local.upload(bytes, fileName)); }
      finally { await local.close(); }
    });
  }
  async read(id) {
    const photo = await this.get(id);
    const parts = [];
    for (let i = 0; i < photo.parts; i++) {
      const part = await this.redis.get(this.key(id, `part:${i}`));
      if (typeof part !== "string") throw unavailable();
      parts.push(Buffer.from(part, "base64"));
    }
    const bytes = Buffer.concat(parts);
    if (bytes.length !== photo.bytes || photo.expiresAt <= this.now()) throw unavailable();
    return { photo, bytes };
  }
  async clean(id, selection) {
    return this.lease(this.key(id, "lock"), () => this.processing(async () => {
      const { photo, bytes } = await this.read(id);
      const local = await new PhotoStore().init();
      try {
        const original = await local.upload(bytes, photo.name);
        const cleaned = await local.clean(original.photoId, selection);
        await this.get(id); // Do not revive an original that expired during processing.
        return await this.persist(local, cleaned);
      } finally { await local.close(); }
    }));
  }
  async delete(id) {
    return this.lease(this.key(id, "lock"), () => this.forget(id));
  }
  async uploadPart({ uploadId, part, parts, bytes, fileName }) {
    if (!Number.isInteger(part) || !Number.isInteger(parts) || parts < 1 || parts > MAX_PARTS || part < 0 || part >= parts || !bytes.length || bytes.length > CHUNK_BYTES || (part < parts - 1 && bytes.length !== CHUNK_BYTES)) {
      throw new UserError("The upload is incomplete. Select your photo again.");
    }
    const id = uploadId || newId();
    if (!uploadId) {
      if (part !== 0) throw unavailable();
      const expiresAt = this.now() + 300_000;
      await this.reserve(id, parts * CHUNK_BYTES, expiresAt);
      await this.redis.set(this.key(id), { upload: true, next: 0, parts, name: fileName, expiresAt }, { pxat: expiresAt });
    }
    return this.lease(this.key(id, "lock"), async () => {
      const record = await this.get(id);
      if (!record.upload || record.next !== part || record.parts !== parts || record.name !== fileName) throw new UserError("The upload is incomplete. Select your photo again.");
      await this.redis.set(this.key(id, `upload:${part}`), bytes.toString("base64"), { pxat: record.expiresAt });
      record.next++;
      await this.redis.set(this.key(id), record, { pxat: record.expiresAt });
      if (record.next < parts) return { uploadId: id, receivedParts: record.next };
      try {
        const buffers = [];
        for (let i = 0; i < parts; i++) {
          const value = await this.redis.get(this.key(id, `upload:${i}`));
          if (typeof value !== "string") throw unavailable();
          buffers.push(Buffer.from(value, "base64"));
        }
        return { photo: await this.upload(Buffer.concat(buffers), fileName) };
      } finally { await this.forget(id, "upload"); }
    });
  }
}

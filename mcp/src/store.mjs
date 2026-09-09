import { randomBytes } from "node:crypto";
import {
  mkdtemp,
  chmod,
  writeFile,
  readFile,
  rm,
  cp,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FORMATS, MetadataEngine } from "./metadata.mjs";
import { UserError } from "./errors.mjs";

export const MAX_BYTES = 20 * 1024 * 1024;
export const TTL_MS = 30 * 60 * 1000;
const token = () => randomBytes(32).toString("hex");

export function decodePhoto(base64) {
  if (
    !base64 ||
    base64.length > Math.ceil(MAX_BYTES / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      base64,
    )
  ) {
    throw new UserError("Upload a valid photo smaller than 20 MB.");
  }
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > MAX_BYTES)
    throw new UserError("Choose a photo smaller than 20 MB.");
  return bytes;
}

export class PhotoStore {
  constructor({
    engine = new MetadataEngine(),
    ttlMs = TTL_MS,
    maxBytes = 200 * 1024 * 1024,
    now = Date.now,
  } = {}) {
    this.engine = engine;
    this.ttlMs = ttlMs;
    this.maxBytes = maxBytes;
    this.now = now;
    this.photos = new Map();
    this.usedBytes = 0;
    this.active = 0;
  }

  async init() {
    this.root = await mkdtemp(path.join(tmpdir(), "meta-scraper-"));
    await chmod(this.root, 0o700);
    this.timer = setInterval(() => this.sweep().catch(() => {}), 60_000);
    this.timer.unref();
    return this;
  }

  get(id) {
    const photo = this.photos.get(id);
    if (!photo || photo.expiresAt <= this.now())
      throw new UserError(
        "This photo has expired or is unavailable. Upload it again.",
      );
    return photo;
  }

  describe(photo) {
    return {
      photoId: photo.id,
      fileName: photo.name,
      byteSize: photo.bytes,
      expiresAt: new Date(photo.expiresAt).toISOString(),
      ...photo.metadata,
      ...(photo.cleaning ? { cleaning: photo.cleaning } : {}),
    };
  }

  async reserve(bytes) {
    await this.sweep();
    if (
      this.active >= 4 ||
      this.photos.size + this.active >= 100 ||
      this.usedBytes + bytes > this.maxBytes
    ) {
      throw new UserError(
        "The photo service is busy. Delete a previous upload or try again shortly.",
      );
    }
    this.active++;
    this.usedBytes += bytes;
  }

  async upload(bytes, fileName = "photo") {
    if (!bytes.length || bytes.length > MAX_BYTES)
      throw new UserError("Choose a photo smaller than 20 MB.");
    await this.reserve(bytes.length);
    const id = token();
    const filePath = path.join(this.root, id);
    try {
      await writeFile(filePath, bytes, { mode: 0o600, flag: "wx" });
      const metadata = await this.engine.inspect(filePath);
      const base =
        path
          .basename(fileName.replaceAll("\\", "/"))
          .replace(/\.[^.]+$/, "")
          .replace(/[^\p{L}\p{N}._ -]/gu, "_")
          .slice(0, 100) || "photo";
      const photo = {
        id,
        path: filePath,
        name: `${base}.${FORMATS[metadata.format].extension}`,
        bytes: bytes.length,
        metadata,
        expiresAt: this.now() + this.ttlMs,
        locks: 0,
      };
      this.photos.set(id, photo);
      return this.describe(photo);
    } catch (error) {
      await rm(filePath, { force: true });
      this.usedBytes -= bytes.length;
      throw error;
    } finally {
      this.active--;
    }
  }

  async clean(id, selection) {
    const original = this.get(id);
    const ids = selection === "all" ? "all" : [...new Set(selection)];
    const available = new Set(
      original.metadata.fields.map((field) => field.id),
    );
    if (
      ids !== "all" &&
      (!ids.length ||
        ids.some(
          (key) =>
            !available.has(key) ||
            !/^[A-Za-z0-9_-]+:[A-Za-z0-9_:-]+$/.test(key),
        ))
    ) {
      throw new UserError(
        "Select metadata field IDs shown for this photo. Required image properties cannot be removed.",
      );
    }
    original.locks++;
    let reserved = false;
    const nextId = token();
    const filePath = path.join(this.root, nextId);
    try {
      await this.reserve(original.bytes);
      reserved = true;
      await cp(original.path, filePath, { errorOnExist: true, force: false });
      await this.engine.remove(filePath, ids);
      const metadata = await this.engine.inspect(filePath);
      const remaining = new Set(metadata.fields.map((field) => field.id));
      const requested = ids === "all" ? [...available] : ids;
      const failed =
        ids === "all"
          ? [...remaining]
          : requested.filter((key) => remaining.has(key));
      if (failed.length) {
        throw new UserError(
          `Could not remove ${failed.slice(0, 5).join(", ")}. No download was created. ${ids === "all" ? "Export to JPEG or PNG in a photo editor and try again." : "Try Remove all metadata to clear the containing metadata block."}`,
        );
      }
      const bytes = (await stat(filePath)).size;
      if (bytes > original.bytes)
        throw new UserError(
          "Cleaning unexpectedly increased the file size. No download was created.",
        );
      const removed = [...available].filter((key) => !remaining.has(key));
      const warnings = [];
      if (removed.some((key) => key.endsWith(":Orientation")))
        warnings.push(
          "The orientation tag was removed. Some viewers may display this copy rotated.",
        );
      if (
        removed.some(
          (key) => key.startsWith("ICC-") || key.startsWith("ICC_Profile:"),
        )
      )
        warnings.push(
          "The color profile was removed. Colors may look different in some viewers.",
        );
      const photo = {
        id: nextId,
        path: filePath,
        name: original.name.replace(/(?:-clean)?(\.[^.]+)$/, "-clean$1"),
        bytes,
        metadata,
        expiresAt: this.now() + this.ttlMs,
        locks: 0,
        cleaning: {
          mode: ids === "all" ? "all" : "selected",
          removed,
          remainingCount: metadata.fields.length,
          verified: true,
          warnings,
        },
      };
      this.photos.set(nextId, photo);
      this.usedBytes += bytes - original.bytes;
      return this.describe(photo);
    } catch (error) {
      await rm(filePath, { force: true });
      if (reserved) this.usedBytes -= original.bytes;
      throw error;
    } finally {
      original.locks--;
      if (reserved) this.active--;
    }
  }

  async read(id) {
    const photo = this.get(id);
    photo.locks++;
    try {
      return { photo, bytes: await readFile(photo.path) };
    } finally {
      photo.locks--;
    }
  }

  async delete(id) {
    const photo = this.photos.get(id);
    if (!photo) return;
    if (photo.locks)
      throw new UserError(
        "This photo is being processed. Try deleting it again in a moment.",
      );
    this.photos.delete(id);
    this.usedBytes -= photo.bytes;
    await rm(photo.path, { force: true });
  }

  async sweep() {
    for (const [id, photo] of this.photos) {
      if (photo.expiresAt <= this.now() && !photo.locks) await this.delete(id);
    }
  }

  async close() {
    clearInterval(this.timer);
    await this.engine.close();
    await rm(this.root, { recursive: true, force: true });
  }
}

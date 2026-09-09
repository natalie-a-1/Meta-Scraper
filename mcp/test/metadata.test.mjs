import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { writeFile, readFile } from "node:fs/promises";
import { PhotoStore, decodePhoto, MAX_BYTES } from "../src/store.mjs";
import { fixture } from "./fixtures.mjs";

for (const format of ["jpeg", "png", "webp", "gif", "tiff"]) {
  test(`${format}: inspect, selectively remove, remove all, preserve pixels and original bytes`, async (t) => {
    const store = await new PhotoStore().init();
    t.after(() => store.close());
    const bytes = await fixture(store, format);
    const photo = await store.upload(bytes, `example.${format}`);
    assert.ok(photo.fields.some((field) => field.id === "XMP-dc:Title"));
    assert.ok(!JSON.stringify(photo).includes(store.root));
    assert.ok(photo.properties.some((field) => field.name === "ImageWidth"));
    const partial = await store.clean(photo.photoId, ["XMP-dc:Title"]);
    assert.ok(!partial.fields.some((field) => field.id === "XMP-dc:Title"));
    assert.ok(partial.fields.length > 0, "unselected metadata retained");
    for (const field of photo.fields.filter(
      (field) => !partial.cleaning.removed.includes(field.id),
    )) {
      assert.equal(
        partial.fields.find((next) => next.id === field.id)?.value,
        field.value,
      );
    }
    const cleaned = await store.clean(photo.photoId, "all");
    assert.equal(cleaned.fields.length, 0);
    assert.equal(cleaned.cleaning.verified, true);
    assert.ok(cleaned.cleaning.removed.includes("XMP-dc:Title"));
    assert.deepEqual((await store.read(photo.photoId)).bytes, bytes);
    const output = (await store.read(cleaned.photoId)).bytes;
    const beforePixels = await sharp(bytes)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const afterPixels = await sharp(output)
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.deepEqual(
      afterPixels,
      beforePixels,
      "cleaning must not recompress or corrupt pixels",
    );
    const repeated = await store.clean(cleaned.photoId, "all");
    assert.equal(repeated.fields.length, 0);
  });
}

test("invalid files, empty selection, unknown/structural tags and argument injection are rejected", async (t) => {
  const store = await new PhotoStore().init();
  t.after(() => store.close());
  await assert.rejects(store.upload(Buffer.from("<svg></svg>"), "photo.jpg"));
  await assert.rejects(store.upload(Buffer.from("not a photo"), "photo.jpg"));
  const photo = await store.upload(await fixture(store), "../../private.jpg");
  assert.equal(photo.fileName, "private.jpg");
  for (const selection of [
    [],
    ["File:ImageWidth"],
    ["IFD0:Artist\n-execute"],
    ["IFD0:Missing"],
  ]) {
    await assert.rejects(
      store.clean(photo.photoId, selection),
      /Select metadata field IDs/,
    );
  }
  assert.equal(store.active, 0);
  assert.equal(store.photos.size, 1);
  for (const input of [
    "",
    "abc!",
    "data:image/png;base64,abcd",
    "a".repeat(Math.ceil(MAX_BYTES / 3) * 4 + 4),
  ]) {
    assert.throws(() => decodePhoto(input));
  }
});

test("expired and deleted IDs stop working; every copy has an independent private ID", async (t) => {
  let now = Date.now();
  const store = await new PhotoStore({ now: () => now, ttlMs: 100 }).init();
  t.after(() => store.close());
  const photo = await store.upload(await fixture(store), "photo.jpg");
  const cleaned = await store.clean(photo.photoId, "all");
  assert.notEqual(cleaned.photoId, photo.photoId);
  await store.delete(cleaned.photoId);
  assert.throws(() => store.get(cleaned.photoId), /unavailable/);
  assert.ok(store.get(photo.photoId));
  now += 101;
  assert.throws(() => store.get(photo.photoId), /expired/);
  await store.sweep();
  assert.equal(store.photos.size, 0);
  assert.equal(store.usedBytes, 0);
});

test("failed verification never releases a false-clean download and preserves the original", async (t) => {
  const store = await new PhotoStore().init();
  t.after(() => store.close());
  const bytes = await fixture(store);
  const photo = await store.upload(bytes, "photo.jpg");
  store.engine.remove = async () => {}; // Simulate an unsupported/no-op ExifTool deletion.
  await assert.rejects(
    store.clean(photo.photoId, "all"),
    /No download was created/,
  );
  assert.equal(store.photos.size, 1);
  assert.equal(store.usedBytes, bytes.length);
  assert.equal(store.active, 0);
  assert.deepEqual((await store.read(photo.photoId)).bytes, bytes);
});

test("capacity bounds apply to uploads and copies, and removed orientation produces a warning", async (t) => {
  const store = await new PhotoStore().init();
  t.after(() => store.close());
  const bytes = await fixture(store, "jpeg", {
    "Orientation#": 6,
    Artist: "Synthetic",
  });
  const photo = await store.upload(bytes, "rotated.jpg");
  store.maxBytes = bytes.length;
  await assert.rejects(store.upload(bytes), /busy/);
  await assert.rejects(store.clean(photo.photoId, "all"), /busy/);
  store.maxBytes *= 3;
  const clean = await store.clean(photo.photoId, "all");
  assert.ok(
    clean.cleaning.warnings.some((warning) => warning.includes("rotated")),
  );
});

for (const format of ["gif", "webp", "tiff"]) {
  test(`${format}: multiple frames/pages and animation timing survive cleaning`, async (t) => {
    const store = await new PhotoStore().init();
    t.after(() => store.close());
    const pixels = Buffer.concat([
      Buffer.alloc(8 * 8 * 3, 120),
      Buffer.alloc(8 * 8 * 3, 240),
    ]);
    const file = `${store.root}/animated.${format}`;
    const bytes = await sharp(pixels, {
      raw: { width: 8, height: 16, channels: 3, pageHeight: 8 },
    })
      .toFormat(format, { loop: 0, delay: [100, 250] })
      .toBuffer();
    await writeFile(file, bytes);
    await store.engine.exiftool.write(
      file,
      { "XMP:Title": "Animation title" },
      { writeArgs: ["-overwrite_original"] },
    );
    const input = await readFile(file);
    const photo = await store.upload(input, `animated.${format}`);
    const cleaned = await store.clean(photo.photoId, "all");
    const output = (await store.read(cleaned.photoId)).bytes;
    assert.equal(cleaned.fields.length, 0);
    const before = await sharp(input, { animated: true }).metadata();
    const after = await sharp(output, { animated: true }).metadata();
    assert.equal(before.pages, 2);
    for (const key of ["pages", "pageHeight", "delay", "loop"])
      assert.deepEqual(after[key], before[key], key);
    assert.deepEqual(
      await sharp(input, { animated: true }).raw().toBuffer(),
      await sharp(output, { animated: true }).raw().toBuffer(),
    );
  });
}

test("embedded JPEG/GIF comments are visible and can be removed individually", async (t) => {
  const store = await new PhotoStore().init();
  t.after(() => store.close());
  for (const format of ["jpeg", "gif"]) {
    const photo = await store.upload(
      await fixture(store, format, {
        Comment: "Private comment",
        "XMP:Title": "Keep this title",
      }),
      `photo.${format}`,
    );
    assert.ok(photo.fields.some((field) => field.id === "File:Comment"));
    const clean = await store.clean(photo.photoId, ["File:Comment"]);
    assert.ok(!clean.fields.some((field) => field.id === "File:Comment"));
    assert.equal(
      clean.fields.find((field) => field.id === "XMP-dc:Title").value,
      "Keep this title",
    );
  }
});

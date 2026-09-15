import sharp from "sharp";
import { readFile } from "node:fs/promises";

export async function fixture(store, format = "jpeg", tags) {
  const file = `${store.root}/fixture.${format}`;
  const source = sharp({
    create: { width: 32, height: 24, channels: 3, background: "#76927c" },
  });
  await source.toFormat(format).toFile(file);
  await store.engine.exiftool.write(
    file,
    tags ||
      (format === "gif"
        ? { "XMP:Title": "Synthetic photo", Comment: "Synthetic comment" }
        : {
            Artist: "Synthetic Artist",
            GPSLatitude: 40.1234,
            GPSLongitude: -89.4321,
            "XMP:Title": "Synthetic photo",
            "XMP:Description": '<script>alert("untrusted metadata")</script>',
          }),
    { writeArgs: ["-overwrite_original"] },
  );
  return readFile(file);
}

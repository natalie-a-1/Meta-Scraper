import { ExifTool } from "exiftool-vendored";
import { UserError } from "./errors.mjs";

export const FORMATS = {
  JPEG: { extension: "jpg", mime: "image/jpeg" },
  PNG: { extension: "png", mime: "image/png" },
  WEBP: { extension: "webp", mime: "image/webp" },
  GIF: { extension: "gif", mime: "image/gif" },
  TIFF: { extension: "tiff", mime: "image/tiff" },
};

// These describe the encoded image, rather than optional descriptive metadata.
// In particular, TIFF needs its IFD pixel layout to remain a readable image.
const structuralNames = new Set(
  `ImageWidth ImageHeight ExifImageWidth ExifImageHeight
  BitsPerSample Compression PhotometricInterpretation StripOffsets SamplesPerPixel
  RowsPerStrip StripByteCounts PlanarConfiguration Predictor TileWidth TileLength
  TileOffsets TileByteCounts ExtraSamples SampleFormat ColorMap FillOrder NewSubfileType PageNumber
  SubfileType SubIFD JPEGTables JPEGInterchangeFormat JPEGInterchangeFormatLength
  YCbCrSubSampling YCbCrPositioning ReferenceBlackWhite XResolution YResolution ResolutionUnit
  ColorType BitDepth Filter Interlace Gamma SRGBRendering ColorSpace Endianness
  AnimationIterations BackgroundColor CanvasWidth CanvasHeight VP8Version
  HorizontalScale VerticalScale AlphaIsUsed ImageCount AnimationLoopCount Duration
  FrameCount HasColorMap ColorResolution BackgroundColorIndex PixelAspectRatio
  TransparentColor TransparentColorIndex GIFVersion ScreenDescriptor LocalColorTable
  GlobalColorTableSize ColorTableSize ColorResolutionDepth BitsPerPixel WebP_Flags ImageLeft ImageTop Disposal ImageDelay
  AnimationFrameFlags AnimationFrameDuration AnimationFrameX AnimationFrameY
  AnimationFrameWidth AnimationFrameHeight`.split(/\s+/),
);

function technical(group, name, format) {
  return (
    (group === "File" && name !== "Comment") ||
    group === "JFIF" ||
    (format === "TIFF" &&
      /^IFD\d+$/.test(group) &&
      ["PreviewImageStart", "PreviewImageLength", "PreviewImage"].includes(
        name,
      )) ||
    (/^(IFD\d+|SubIFD\d*|ExifIFD|PNG|GIF|RIFF|VP8|VP8L|VP8X|WebP)$/.test(
      group,
    ) &&
      structuralNames.has(name))
  );
}

export class MetadataEngine {
  constructor() {
    this.exiftool = new ExifTool({
      maxProcs: 2,
      taskTimeoutMillis: 20_000,
      useMWG: false,
    });
  }

  async inspect(path) {
    const raw = await this.exiftool.readRaw(path, {
      readArgs: ["-G1", "-a", "-s", "-n", "-struct"],
      ignoreMinorErrors: false,
      useMWG: false,
    });
    const type =
      raw["File:FileType"] === "Extended WEBP"
        ? "WEBP"
        : raw["File:FileType"]?.toUpperCase();
    if (!FORMATS[type])
      throw new UserError(
        "Choose an original JPEG, PNG, WebP, GIF, or TIFF photo. This file is not a supported image.",
      );
    if (
      raw["ExifTool:Error"] ||
      raw["ExifTool:Warning"] ||
      raw.errors?.length ||
      raw.warnings?.length
    ) {
      throw new UserError(
        "This image has malformed or incomplete metadata. Export a fresh copy from your photo editor and try again.",
      );
    }
    const fields = [];
    const properties = [];
    for (const [id, value] of Object.entries(raw)) {
      const separator = id.indexOf(":");
      if (separator < 0) continue;
      const group = id.slice(0, separator);
      const name = id.slice(separator + 1);
      if (["System", "ExifTool", "Composite", "MWG"].includes(group)) continue;
      // File:Comment is embedded JPEG/GIF data, unlike filesystem-derived tags.
      if (
        group === "File" &&
        ![
          "Comment",
          "FileType",
          "MIMEType",
          "ImageWidth",
          "ImageHeight",
          "EncodingProcess",
          "BitsPerSample",
          "ColorComponents",
          "YCbCrSubSampling",
        ].includes(name)
      )
        continue;
      const field = {
        id,
        group,
        name,
        value: typeof value === "string" ? value : JSON.stringify(value),
      };
      (technical(group, name, type) ? properties : fields).push(field);
    }
    if (JSON.stringify({ fields, properties }).length > 1_000_000) {
      throw new UserError(
        "This image has more metadata than can be displayed safely. Try a smaller photo.",
      );
    }
    return { format: type, mimeType: FORMATS[type].mime, fields, properties };
  }

  async remove(path, ids) {
    const args = ids === "all" ? ["-all="] : ids.map((id) => `-${id}=`);
    try {
      await this.exiftool.write(
        path,
        {},
        { writeArgs: [...args, "-overwrite_original"] },
      );
    } catch (error) {
      if (ids !== "all") {
        throw new UserError("These fields could not be removed individually. Try Remove all metadata, or upload another original photo. No download was created.");
      }
      throw error;
    }
    if (ids === "all") {
      // ExifTool deliberately retains TIFF IFD0 when deleting whole groups.
      // Clear any surviving descriptive fields individually, then the caller
      // independently verifies that no optional metadata remains.
      const remaining = (await this.inspect(path)).fields;
      if (remaining.length) {
        if (
          remaining.some(
            ({ id }) => !/^[A-Za-z0-9_-]+:[A-Za-z0-9_:-]+$/.test(id),
          )
        ) {
          throw new UserError(
            "Some metadata cannot be safely removed from this image. No download was created.",
          );
        }
        await this.exiftool.write(
          path,
          {},
          {
            writeArgs: [
              ...remaining.map(({ id }) => `-${id}=`),
              "-overwrite_original",
            ],
          },
        );
      }
    }
  }

  async close() {
    await this.exiftool.end();
  }
}

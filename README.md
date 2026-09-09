# Meta-Scraper

Inspect and remove photo metadata in **ChatGPT, Claude, or another MCP client**. Upload an original photo, see its embedded fields, then remove selected fields or all removable metadata and download a separate copy.

- A compact panel with searchable metadata, field selection, and a download button.
- JPEG, PNG, WebP, GIF, and TIFF support, including animated GIF/WebP and multipage TIFF.
- Removal verified by rereading the output. Original files and encoded pixels are preserved.
- Streamable HTTP and stdio MCP transports, ChatGPT attachment import, and a portable file picker with a standalone browser fallback.
- Temporary storage with private photo IDs, expiring downloads, and explicit deletion.

## Run the MCP app

Use **Node.js 22.13 or newer**. ExifTool is bundled; no OpenAI or Anthropic API key is needed.

```sh
cd mcp
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:3000** for the photo panel. MCP runs at **http://127.0.0.1:3000/mcp**.

See [connection and deployment instructions](mcp/README.md) for ChatGPT, Claude, stdio, HTTPS hosting, and Docker. Remote chat hosts need a reachable HTTPS endpoint or supported private tunnel; localhost alone does not connect to them.

Try asking:

> “Open Meta-Scraper so I can check a photo before sharing it.”
>
> “Show the metadata in this attached photo.”
>
> “Remove just the GPS fields, and keep the camera information.”
>
> “Remove all metadata and give me a cleaned copy.”

## What “remove all” means

The app removes descriptive metadata recognized by ExifTool, including EXIF, GPS, XMP, IPTC, comments, and color profiles when present and supported. Pixel layout and format properties keep the file readable. Some fields cannot be removed independently; the app reports this and suggests **Remove all metadata** to clear the containing block. Failed verification does not produce a download.

Removing orientation or color profiles can change how a viewer displays the copy; returned warnings make that explicit. Metadata stripping does not redact visible contents. Use original files: chat and social platforms may resize uploads or remove metadata before the app receives them.

## Privacy and checks

The MCP app processes uploads **on the machine running its server**. A remotely hosted server receives the original file. Photos and download links expire after 30 minutes; see [retention notes](mcp/README.md#privacy-and-retention). Metadata returned in chat is also subject to the host’s retention settings.

```sh
cd mcp
npm run check
```

Checks cover real image processing, pixel/frame preservation, MCP transports, UI bridge calls, downloads, expiry, deletion, and input/HTTP boundaries. [Validation and host acceptance checks](mcp/VALIDATION.md).

The original VS Code extension remains available with its own dependencies and commands: [usage](docs/VS_CODE.md), [testing](TESTING.md), [publishing](PUBLISHING.md).

[MIT license](LICENSE).

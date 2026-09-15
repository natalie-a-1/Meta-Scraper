# MetaScraper MCP

A small MCP Apps editor with separate `src/` server and `web/` panel code. The base64 upload helper is visible only to the panel, so ChatGPT uses original attachment imports. Only `open_photo` mounts the panel; data tools update it through the standard MCP Apps bridge. The UI uses a self-contained bundle, host themes, accessible form controls, and no external assets or analytics.

## Local setup

```sh
cd mcp
npm ci
npm run build
npm start
```

Requires Node.js 22.13+ and the OS dependencies used by vendored ExifTool (Perl on Linux/macOS, bundled executable on Windows). A Docker image is included. The app does not call a model API and needs no API key.

The panel runs at `http://127.0.0.1:3000`; MCP runs at `/mcp`. Set `PORT` to choose another port. Build after changing `web/` files and restart after server changes.

## Preview the inline MCP component

Run `npm run dev:host` after building, then open `http://127.0.0.1:3101/host`. This renders the registered UI resource inside a sandboxed iframe using the official MCP Apps bridge and real server tools. It is a local verification host, not an authenticated ChatGPT session. Do not open `web/photo.html` directly: it is an unbuilt template with asset placeholders.

The card summarizes location, dates, camera/device information, names/notes, and other details in plain language. One action removes all embedded details; a separate inspector supports category and individual selection. The card inherits host colors and fonts. In ChatGPT, **Choose from ChatGPT files** appears when the host provides its file-library APIs; other hosts retain the original-file upload control. Conversation-driven imports and edits finish with `open_photo(photoId)` to render their result.

See [DESIGN.md](./DESIGN.md) for the OpenAI/Apple design rationale, interaction flow, and accessibility decisions.

## Connect ChatGPT

1. Start the server and expose it through a supported private MCP tunnel or public HTTPS origin. OpenAI Secure MCP Tunnel can also connect the local stdio server. For a public development tunnel, set `PUBLIC_BASE_URL` to its HTTPS origin before starting.
2. Enable **Developer mode** under **Settings → Security and login**. Availability depends on account/workspace policy.
3. Open [ChatGPT Plugins](https://chatgpt.com/plugins), select the plus button, and create an MCP connection using `https://YOUR-HOST/mcp` or the configured private tunnel.
4. Enable MetaScraper in a conversation. Attach the original photo using ChatGPT’s normal attachment control and ask what it reveals or what to remove. `import_photo` receives the original through `openai/fileParams`; the result card appears after inspection or requested cleanup. The component picker is a fallback.
5. After changing tool definitions, restart and **Refresh** the connection to reload descriptors.

For an HTTPS tunnel that preserves the public Host header:

```sh
PUBLIC_BASE_URL=https://YOUR-TUNNEL-HOST npm start
```

These labels follow the [current OpenAI connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt). Some clients still use **Apps** or **Connectors**. Public directory submission and hosting are separate; this repository does not register a connection in your account.

### Repeatable native development test

With Node.js 22.13+ and `cloudflared` installed, build the panel, then keep these two terminals running. In the first terminal:

```sh
cloudflared tunnel --url http://127.0.0.1:3102 --no-autoupdate
```

Copy the HTTPS origin printed by Cloudflare. In the second terminal, from `mcp/`:

```sh
npm run build
PORT=3102 PUBLIC_BASE_URL=https://YOUR-PRINTED-HOST.trycloudflare.com npm start
```

Create the ChatGPT connection with these values:

| Setting | Value |
| --- | --- |
| Name | MetaScraper |
| Description | Inspect and remove hidden details from photos. Keep the original and download a verified cleaned copy. |
| MCP server URL | The printed HTTPS origin followed by `/mcp` |
| Authentication | None |

This is a temporary personal development connection. The endpoint depends on both processes and this computer staying online. Restarting the quick tunnel changes its URL; update the connection and `PUBLIC_BASE_URL` together. Restarting the server invalidates existing photo handles. A stable deployment is separate from this test setup.

In a new ChatGPT conversation with MetaScraper enabled, run these checks:

1. Ask **“What can photo metadata reveal about me?”** without a file. Confirm a conversational answer and an optional invitation to attach, with no empty card.
2. Attach an original JPEG or HEIC/HEIF through ChatGPT’s composer and ask **“Does this photo contain my location?”** Confirm import uses the attachment and opens a focused card containing only recorded facts. `test/data/synthetic.heic` contains intentionally fictional metadata for testing.
3. Ask **“Remove all hidden metadata from that photo.”** Confirm the existing photo is reused and a cleaned-copy card appears without another upload or removal click. Save and open the output.
4. In a fresh conversation, attach a photo with **“Remove all hidden metadata from this photo.”** Confirm import, cleanup, and the final card happen in one request.
5. Test **Show all details**, category-specific removal, and the custom selection inspector. Confirm unselected fields and the original remain intact.
6. Explicitly ask to open the upload panel to test its fallback picker. Ask to delete only the test copies, then confirm their old download links no longer work.

The local `/host` preview and direct MCP transport tests do not establish that native ChatGPT rendering works. Record the account's native results separately, including host file selection, state restoration, and any tool confirmation prompts. After changing the UI bundle or tool descriptors, rebuild, restart, refresh the ChatGPT connection, and start a new conversation.

## Connect Claude

### Claude web / remote connector

Use the same publicly reachable HTTPS `/mcp` endpoint. In **Settings → Connectors**, add a custom connector using that URL, enable it in a conversation, and ask to open MetaScraper. MCP Apps capable hosts render the panel. Otherwise `open_photo` returns a link to the complete standalone panel.

Select the original file in the MetaScraper panel: a generic MCP server cannot automatically read a Claude conversation attachment. Do not ask the assistant to infer EXIF from visible pixels or reconstruct base64. See [Claude’s custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

### Claude Desktop / other local stdio clients

After building, add this MCP configuration, replacing both absolute paths. GUI applications may not inherit your shell’s Node version manager.

```json
{
  "mcpServers": {
    "meta-scraper": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/MetaScraper/mcp/src/main.mjs", "--stdio"]
    }
  }
}
```

The process serves a loopback panel/download endpoint on a dynamically allocated port and sends only MCP messages to stdout. Diagnostics go to stderr. Restart the client and ask it to open MetaScraper. Assets resolve independently of the client’s current directory. Without embedded UI, open the returned browser link to upload, inspect, clean, and download there.

Loopback download links are reachable only on the server's machine. When a private tunnel points to a different machine, configure a reachable HTTPS `PUBLIC_BASE_URL` for browser uploads/downloads as well as the MCP connection.

Supported still-image uploads include JPEG, PNG, WebP, GIF, TIFF, HEIC, and HEIF (`.heic`, `.heif`, `.hif`). HEIF stays in its original container without conversion to JPEG. Required codec, item-layout, and rendering properties remain; descriptive EXIF/XMP/GPS metadata can be selected or removed in full.

## Tools

| Tool | Input | Result |
| --- | --- | --- |
| `open_photo` | Optional `photoId`, `focus` | Focused result card; picker only as an explicit fallback |
| `upload_photo` | `fileName`, original `base64` bytes | Stored photo and metadata; normally called by the picker |
| `import_photo` | ChatGPT `file` descriptor | Imported attachment and metadata |
| `view_metadata` | `photoId` | Embedded fields, exact IDs, image properties |
| `remove_metadata` | `photoId`, `selection: "all"` or field ID array | New copy, removed IDs, verification, warnings, download |
| `delete_photo` | `photoId` | Deletes that copy and invalidates its link |

For example, `selection: ["GPS:GPSLatitude", "GPS:GPSLongitude"]` removes those exact fields. To remove all location information, select **all fields in the GPS group**, plus location values in XMP/IPTC if present. Removing coordinates alone does not remove every location-related field.

IDs and download URLs are 256-bit bearer capabilities: possession grants access to that photo. There is no listing endpoint, user directory, shared “current photo,” or arbitrary filesystem access. Anonymous tools operate only on a newly supplied file or a valid capability. No account is required. Use locally or in a controlled personal deployment; add OAuth and user ownership for an account-based public service.

## Privacy and retention

- Upload limit: 20 MiB. A server holds at most 200 MiB of uploaded/output data and 100 stored photos, with at most four active processing operations. Metadata display is limited to 1 MB; oversized/malformed files fail explicitly.
- Each copy expires after 30 minutes. Local/stdio uploads use an owner-only OS temporary directory; the process sweeps expired files every minute and removes its files on graceful shutdown. The Vercel deployment uses private Redis records and data chunks with matching expiry deadlines; function restarts preserve unexpired handles. Explicit deletion removes the selected copy from the active store.
- Vercel uploads and metadata are stored in the dedicated Upstash resource. Image processing uses temporary container files that are removed when the operation finishes. Incomplete multipart uploads expire after five minutes. Application expiry does not define a hosting provider's backup or storage-erasure policy.
- Abrupt termination can leave an inaccessible temporary directory on disk. Use an ephemeral container filesystem or private `tmpfs` for `/tmp` when deploying, and enforce temporary-file cleanup on persistent hosts. Expiry is not secure erasure from storage backups.
- The app sends no photo bytes to a model API or analytics service. Metadata requested through tools enters chat. UI interactions share only the photo handle, filename, counts, and cleanup results as model context; host tool handling can also retain arguments/results. Server deletion does not erase chat history or downloads.
- Downloads use `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, attachment disposition, and a verified image MIME type. The app does not log request bodies or download URLs. Hosting-platform request logs can contain `/files/*` capability paths; access to those logs must remain restricted, and the links stop working at expiry or deletion.
- Attachment imports accept HTTPS `oaiusercontent.com` hosts and four OpenAI Azure storage accounts observed in native ChatGPT file parameters: `oaisdmntprwestus3`, `oaisdmntprsouthcentralus`, `oaisdmntprcentralus`, and `oaisdmntprnorthcentralus` under `blob.core.windows.net`. The allowlist does not include arbitrary Azure accounts. Downloads reject redirects and private/reserved addresses, pin a validated DNS result, and enforce timeout/size bounds. An unrecognized future host requires verification before adding it; the picker remains a fallback. `DEBUG_MCP=1` logs the attachment origin and HTTP status, never its signed URL or bytes.
- Embedded strings are data, rendered with `textContent`. Metadata values never enter HTML or shell commands. Individual deletion arguments must match IDs found in that upload and a strict identifier grammar.

## HTTPS / Docker deployment

The production endpoint is **https://mcp.luccilabs.xyz/metascraper**; sandbox is **https://sandbox.mcp.luccilabs.xyz/metascraper**. Both are hosted on Vercel with separate databases and credentials. See the [Vercel deployment and storage setup](deploy/README.md). The single-instance instructions below apply to the local/Docker in-memory store; Vercel uses shared Redis storage with the same 30-minute expiry.

```sh
docker build -f mcp/Dockerfile -t meta-scraper .
docker run --rm --init --read-only --tmpfs /tmp:rw,noexec,nosuid,size=384m \
  -p 127.0.0.1:3000:3000 \
  -e HOST=0.0.0.0 -e PUBLIC_BASE_URL=https://photos.example.com \
  meta-scraper
```

Replace the example origin and place the container behind a TLS reverse proxy. Preserve the public `Host` header. `PUBLIC_BASE_URL` is an HTTPS origin with an optional product-slug path, without query or credentials; it supplies all output links. For the shared gateway, set `ORIGIN_URLS` to explicitly permitted backend origins and use `<PUBLIC_BASE_URL>/ui` for the standalone panel. Listening outside loopback requires it. Foreign Host/browser Origin requests are rejected; wildcard CORS is not enabled. Chat hosts make MCP requests from their backend; the panel calls tools through the host bridge.

Use one server instance: records and capabilities are in memory. Restarting invalidates all IDs. Horizontal scaling requires shared storage/ownership and a new retention design. Configure proxy request size (at least 29 MB for base64), timeouts, rate limits, and resource limits appropriate to your deployment. Keep ExifTool patched. Use operational controls for an unattended public service.

The widget has no external network/asset dependencies, so MCP Apps domain allowlists are empty. Original-file uploads can display a local blob thumbnail; no thumbnail request is sent to another service. For public plugin submission with UI, configure a unique `_meta.ui.domain`, stable HTTPS, and the host’s privacy/review requirements. Those deployment-specific settings have no invented domain or credentials in the source.

## Development and sources

```sh
npm run check
npm audit
```

Checks run lint, build the panel, and test actual ExifTool and MCP transports. The [photo workflow skill](skills/photo-metadata/SKILL.md) is the single source for server initialization instructions. Tool descriptions also carry the attachment-first routing because host treatment of server instructions varies. The server advertises the draft skills extension with `skills/list`, `skills/get`, and a digest-verified resource for OpenAI submission-time skill import. Developer-mode tool refresh does not install a packaged skill; native behavior is driven by the refreshed tool descriptors and server instructions. The Docker image includes the skill.

The implementation follows OpenAI’s [MCP server guide](https://developers.openai.com/plugins/build/mcp-server), [UI guide](https://developers.openai.com/plugins/build/chatgpt-ui), [tool guide](https://developers.openai.com/plugins/plan/tools), and [file parameter reference](https://developers.openai.com/plugins/reference#define-file-inputs). The resource/bridge structure adapts the [official MCP Apps quickstart at v1.7.5](https://github.com/modelcontextprotocol/ext-apps/tree/v1.7.5/examples/quickstart), matched to the installed 1.x MCP SDK. OpenAI’s example catalog was reviewed; this portable quickstart fits without importing a larger showcase UI.

## Conversation-driven results

General questions stay in chat. Without an image, a personal check asks for an attachment instead of opening an empty card. For an attached photo, inspection starts with `import_photo`; follow-ups reuse its photo ID. Explicit cleanup requests complete import → removal → cleaned result without asking the user to press Remove again. A photo alone does not authorize deletion.

`open_photo` accepts `focus`: `overview`, `location`, `date`, `device`, `author`, or `other`. Focused cards show recorded values, expose the whole category's exact removal set, and offer **Show all details**. Missing values are reported as absent in the supplied file, without assuming the original never contained them. The server never infers metadata from the visible image.

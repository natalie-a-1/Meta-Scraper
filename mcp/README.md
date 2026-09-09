# Meta-Scraper MCP

A small MCP Apps editor with separate `src/` server and `web/` panel code. Only `open_photo` mounts the panel; data tools update it through the standard MCP Apps bridge. The UI uses a self-contained bundle, host themes, accessible form controls, and no external assets or analytics.

## Local setup

```sh
cd mcp
npm ci
npm run build
npm start
```

Requires Node.js 22.13+ and the OS dependencies used by vendored ExifTool (Perl on Linux/macOS, bundled executable on Windows). A Docker image is included. The app does not call a model API and needs no API key.

The panel runs at `http://127.0.0.1:3000`; MCP runs at `/mcp`. Set `PORT` to choose another port. Build after changing `web/` files and restart after server changes.

## Connect ChatGPT

1. Start the server and expose it through a supported private MCP tunnel or public HTTPS origin. OpenAI Secure MCP Tunnel can also connect the local stdio server. For a public development tunnel, set `PUBLIC_BASE_URL` to its HTTPS origin before starting.
2. Enable **Developer mode** under **Settings → Security and login**. Availability depends on account/workspace policy.
3. Open [ChatGPT Plugins](https://chatgpt.com/plugins), select the plus button, and create an MCP connection using `https://YOUR-HOST/mcp` or the configured private tunnel.
4. Enable the connection in a conversation and ask to open Meta-Scraper. Select a photo in the panel. An original ChatGPT attachment can also be passed to `import_photo` via `openai/fileParams`.
5. After changing tool definitions, restart and **Refresh** the connection to reload descriptors.

For an HTTPS tunnel that preserves the public Host header:

```sh
PUBLIC_BASE_URL=https://YOUR-TUNNEL-HOST npm start
```

These labels follow the [current OpenAI connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt). Some clients still use **Apps** or **Connectors**. Public directory submission and hosting are separate; this repository does not register a connection in your account.

## Connect Claude

### Claude web / remote connector

Use the same publicly reachable HTTPS `/mcp` endpoint. In **Settings → Connectors**, add a custom connector using that URL, enable it in a conversation, and ask to open Meta-Scraper. MCP Apps capable hosts render the panel. Otherwise `open_photo` returns a link to the complete standalone panel.

Select the original file in the Meta-Scraper panel: a generic MCP server cannot automatically read a Claude conversation attachment. Do not ask the assistant to infer EXIF from visible pixels or reconstruct base64. See [Claude’s custom connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

### Claude Desktop / other local stdio clients

After building, add this MCP configuration, replacing both absolute paths. GUI applications may not inherit your shell’s Node version manager.

```json
{
  "mcpServers": {
    "meta-scraper": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/Meta-Scraper/mcp/src/main.mjs", "--stdio"]
    }
  }
}
```

The process serves a loopback panel/download endpoint on a dynamically allocated port and sends only MCP messages to stdout. Diagnostics go to stderr. Restart the client and ask it to open Meta-Scraper. Assets resolve independently of the client’s current directory. Without embedded UI, open the returned browser link to upload, inspect, clean, and download there.

Loopback download links are reachable only on the server's machine. When a private tunnel points to a different machine, configure a reachable HTTPS `PUBLIC_BASE_URL` for browser uploads/downloads as well as the MCP connection.

## Tools

| Tool | Input | Result |
| --- | --- | --- |
| `open_photo` | Optional `photoId` | Panel or standalone upload link |
| `upload_photo` | `fileName`, original `base64` bytes | Stored photo and metadata; normally called by the picker |
| `import_photo` | ChatGPT `file` descriptor | Imported attachment and metadata |
| `view_metadata` | `photoId` | Embedded fields, exact IDs, image properties |
| `remove_metadata` | `photoId`, `selection: "all"` or field ID array | New copy, removed IDs, verification, warnings, download |
| `delete_photo` | `photoId` | Deletes that copy and invalidates its link |

For example, `selection: ["GPS:GPSLatitude", "GPS:GPSLongitude"]` removes those exact fields. To remove all location information, select **all fields in the GPS group**, plus location values in XMP/IPTC if present. Removing coordinates alone does not remove every location-related field.

IDs and download URLs are 256-bit bearer capabilities: possession grants access to that photo. There is no listing endpoint, user directory, shared “current photo,” or arbitrary filesystem access. Anonymous tools operate only on a newly supplied file or a valid capability. No account is required. Use locally or in a controlled personal deployment; add OAuth and user ownership for an account-based public service.

## Privacy and retention

- Upload limit: 20 MiB. A server holds at most 200 MiB of uploaded/output data and 100 stored photos, with at most four active processing operations. Metadata display is limited to 1 MB; oversized/malformed files fail explicitly.
- Uploads are stored in an owner-only OS temporary directory. Each copy expires after 30 minutes. Expired links immediately stop working; the running process sweeps expired files every minute. Explicit deletion and graceful shutdown remove files immediately.
- Abrupt termination can leave an inaccessible temporary directory on disk. Use an ephemeral container filesystem or private `tmpfs` for `/tmp` when deploying, and enforce temporary-file cleanup on persistent hosts. Expiry is not secure erasure from storage backups.
- The app sends no photo bytes to a model API or analytics service. Metadata requested through tools enters chat. UI interactions share only the photo handle, filename, counts, and cleanup results as model context; host tool handling can also retain arguments/results. Server deletion does not erase chat history or downloads.
- Downloads use `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, attachment disposition, and a verified image MIME type. Do not log request bodies or `/files/*` paths in a reverse proxy.
- Attachment imports accept only HTTPS `oaiusercontent.com` hosts, reject redirects and private/reserved addresses, pin a validated DNS result, and enforce timeout/size bounds. Other hosts use the picker, not arbitrary URL fetching.
- Embedded strings are data, rendered with `textContent`. Metadata values never enter HTML or shell commands. Individual deletion arguments must match IDs found in that upload and a strict identifier grammar.

## HTTPS / Docker deployment

```sh
docker build -f mcp/Dockerfile -t meta-scraper .
docker run --rm --init --read-only --tmpfs /tmp:rw,noexec,nosuid,size=384m \
  -p 127.0.0.1:3000:3000 \
  -e HOST=0.0.0.0 -e PUBLIC_BASE_URL=https://photos.example.com \
  meta-scraper
```

Replace the example origin and place the container behind a TLS reverse proxy. Preserve the public `Host` header. `PUBLIC_BASE_URL` is an HTTPS origin without a path, query, or credentials; it supplies all output links. Listening outside loopback requires it. Foreign Host/browser Origin requests are rejected; wildcard CORS is not enabled. Chat hosts make MCP requests from their backend; the panel calls tools through the host bridge.

Use one server instance: records and capabilities are in memory. Restarting invalidates all IDs. Horizontal scaling requires shared storage/ownership and a new retention design. Configure proxy request size (at least 29 MB for base64), timeouts, rate limits, and resource limits appropriate to your deployment. Keep ExifTool patched. Use operational controls for an unattended public service.

The widget has no network/asset dependencies, so MCP Apps CSP allowlists are empty. For public plugin submission with UI, configure a unique `_meta.ui.domain`, stable HTTPS, and the host’s privacy/review requirements. Those deployment-specific settings have no invented domain or credentials in the source.

## Development and sources

```sh
npm run check
npm audit
```

Checks run lint, build the panel, and test actual ExifTool and MCP transports. An optional [photo workflow skill](skills/photo-metadata/SKILL.md) can be included in a host plugin package; it does not replace MCP setup.

The implementation follows OpenAI’s [MCP server guide](https://developers.openai.com/plugins/build/mcp-server), [UI guide](https://developers.openai.com/plugins/build/chatgpt-ui), [tool guide](https://developers.openai.com/plugins/plan/tools), and [file parameter reference](https://developers.openai.com/plugins/reference#define-file-inputs). The resource/bridge structure adapts the [official MCP Apps quickstart at v1.7.5](https://github.com/modelcontextprotocol/ext-apps/tree/v1.7.5/examples/quickstart), matched to the installed 1.x MCP SDK. OpenAI’s example catalog was reviewed; this portable quickstart fits without importing a larger showcase UI.

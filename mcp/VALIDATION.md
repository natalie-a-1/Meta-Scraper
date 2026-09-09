# Validation

## Automated checks

Run `npm ci && npm run check` from `mcp/` with Node 22.13+. The check builds the actual panel and runs 19 tests using vendored ExifTool, Sharp as an independent test decoder, and the official MCP SDK/Apps bridge.

- JPEG, PNG, WebP, GIF, and TIFF: inspect embedded fields, selectively remove a field while retaining unselected values, remove all metadata, reread outputs, compare decoded pixels, and confirm original bytes are unchanged.
- Animated GIF/WebP and multipage TIFF: retain page/frame count, timing/loop values, and pixels from every frame/page.
- JPEG/GIF comments: display and independently remove embedded comments. TIFF full removal also checks fields that ExifTool's basic `-all=` leaves in IFD0.
- Invalid files/base64, empty or forged selection, structural field selection, and argument injection: reject without changing the original.
- Failed removal verification: do not create a download. Expiry/deletion invalidate IDs; copies have independent IDs; capacity applies to uploads and outputs; orientation removal produces a display warning.
- HTTP and stdio: initialize, discover schemas/annotations, upload, inspect, clean, and download actual images. Stdio starts outside the repository and uses its local companion URL.
- MCP Apps: initialize the bridge, receive tool input/result notifications, call upload/clean tools from the UI side, update model context, and request a host-mediated download.
- HTTP request boundaries, private/missing photo IDs, attachment host allowlisting, and private/reserved address blocking.

Local result: all 19 checks passed on macOS with Node 22.23.2. `npm audit` reported no vulnerabilities in the MCP package. The workflow skill passed `quick_validate.py`. CI runs the checks on Linux and macOS and builds the Docker image.

## Browser verification

After building, run `npm run dev:host` and open `http://127.0.0.1:3101/host`. This development-only page uses the official `AppBridge`, a sandboxed iframe with only `allow-scripts`, and a CSP that disallows network loads inside the widget and permits local blob thumbnails. It exercises the real HTTP MCP server. The production entry point does not expose this route.

Chromium verification completed for the standalone panel and sandboxed host:

- Select/upload a synthetic original JPEG; show its nine embedded fields.
- Treat an XMP value containing `<script>` as inert visible text.
- Select Artist; create a copy with that field absent and the other eight present.
- Remove all remaining metadata; show verified zero remaining fields.
- Download the resulting file through the browser and through the host's open-link handler.
- Receive the host's dark-theme update; review layout at desktop and 390-pixel widths.
- Keep checkbox focus during selection and update model context after an upload.

No widget JavaScript errors occurred. The development host's browser SDK probes `GET /mcp`, which correctly returns 405 for the stateless POST-only transport; a missing favicon also produces a harmless browser request error. Neither affects the widget or tool calls.

## Host acceptance after connecting

These are deployment/account checks, not claims that this PR has installed a live app:

| Host | Check |
| --- | --- |
| ChatGPT | Refresh tool discovery, open the panel, upload an original file, remove selected/all fields, and download. Also pass a real host attachment to `import_photo` to exercise its expiring download URL. |
| Claude remote | Connect the HTTPS `/mcp` URL, open the panel, select the original file in the widget, inspect, clean, and download. |
| Claude Desktop | Configure stdio using absolute Node/server paths, restart, and run the same workflow through the widget or returned browser link. |

Authenticated ChatGPT/Claude account sessions and a live host-issued attachment URL were not exercised locally. Their portable protocol paths and ChatGPT file descriptor schema were verified against the current official documentation and SDK. No production endpoint or public directory listing is created by the PR. Local Docker execution was unavailable because the Docker daemon was not running; the PR's container job supplies build validation.

The original VS Code extension was not changed or retested. Its pre-existing root dependency edits are outside this PR.

## Inline UI follow-up

The v2 resource uses shared host color/font tokens, a compact inline card, and a feature-detected ChatGPT file-library picker. Conversation tool instructions explicitly finish with `open_photo(photoId)`. Rechecked the real sandbox bridge with upload and verified remove-all in the browser; all 19 automated tests pass. The ChatGPT file-library extension still requires acceptance testing in an authenticated ChatGPT session.

## HEIF support

Added synthetic HEIC and generic-brand HEIF regression cases for upload, selective/full cleanup, repeated cleanup, protected structural fields, and original-byte preservation. ExifTool image-data hashes are equal before and after cleanup, and codec/rendering properties are unchanged. The suite now contains 21 tests.

## Large upload regression

Reproduced a stack overflow in the repeated-group base64 validation regex with a 3,469,788-byte JPEG. Replaced it with a bounded canonical decode/encode check. Added synthetic regression coverage at the reported size and the 20 MiB boundary, including malformed padding/characters and oversized input. All 22 tests pass. The reported photo also uploaded through the real browser MCP Apps bridge and completed full cleanup; no user photo or metadata was added to the repository.

## Conversation-first redesign

The v3 component replaces the inline technical list with plain-language categories and one primary action. Exact fields are available in a separate, keyboard-contained inspector; the host can expand it to fullscreen. Tested category-level GPS removal while retaining names/notes, Escape dismissal, full cleanup, local thumbnail loading, a 390px dark layout, and the simpler upload prompt. A new presentation regression test confirms exact field coverage and avoids inventing absent location information. All 23 tests pass. See [DESIGN.md](./DESIGN.md) for the design rationale and remaining host acceptance work.

## Discovery and motion refinement

All 24 tests pass, including additional checks for recorded-value summaries, invalid dates, and insight fallback behavior. The local browser flow was exercised with a deliberately delayed test response to inspect the subtle thumbnail processing cue and verified completion transition. Reduced-motion mode uses a static thumbnail and halo. Test delays are confined to browser verification; production adds no processing delay.

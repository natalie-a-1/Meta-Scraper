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

### Authenticated ChatGPT follow-up — September 9, 2026

Connected the public HTTPS development endpoint in ChatGPT developer mode with no authentication. ChatGPT discovered all six tools and the v3 UI resource. In a real ChatGPT conversation, `open_photo` rendered the inline upload card inside the OpenAI widget sandbox, including the host file-library option.

Uploaded the repository's synthetic HEIC fixture through the public MCP client, then opened its returned handle in the ChatGPT conversation. The native card displayed the fixture's recorded categories. Pressing **Remove hidden details** invoked the tool through ChatGPT's widget bridge, displayed processing feedback, and resolved to **Hidden details removed**, with keyboard focus on **Save cleaned photo**. The save action was invoked; completion of the browser download was not independently observed. Direct public transport testing separately verified a cleaned HEIC download returned HTTP 200 and `image/heic`.

Original-file selection through the native OS picker and ChatGPT attachment import remain manual acceptance checks. This session used a temporary Cloudflare development tunnel; it is not a permanent deployment or directory submission. Claude acceptance remains outstanding.

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

## Native expiry regression and MetaScraper rename

Reproduced the reported native error in a second tab: ChatGPT replayed a photo card after its temporary server copy expired, and cleanup exposed a wrapped `MCP error -32000` exception. The v4 widget revalidates photo handles on mount, checks expiry before actions and when returning to the tab, and schedules expiry while the card is open. An unavailable photo clears the stale controls and offers a new upload with a plain-language message. Widget state stores the latest handle and original handle when the host supports restoration; server reads remain authoritative.

All 26 checks pass, including regression cases for the exact ChatGPT-wrapped exception and the expiry deadline. In authenticated ChatGPT with CSP enforcement enabled, verified selective HEIC location removal, retained names/notes, fullscreen inspector return, and the cleaned-copy view. Deleted only the synthetic original on the server to reproduce the unavailable-photo condition in an already-open card; clicking cleanup recovered to the upload view without raw MCP text. A second tab replayed the original conversation result rather than the latest cleaned copy, so cross-tab restoration of the latest widget state is not claimed.

The user's uploaded JPEG also completed full cleanup through the native widget. Downloaded its actual output from the public endpoint and independently verified zero removable fields and successful 5712 × 4284 pixel decoding. No personal image bytes or metadata were added to this repository. The ChatGPT connection and app-facing names now use MetaScraper, and connection discovery was refreshed to the v4 resource. The temporary HTTPS tunnel is still required.


## ChatGPT attachment and intent routing — September 9, 2026

The v5 resource preserves the visual design and adds focused result cards for location, dates, device, author, and other embedded details. General questions stay conversational. Tool descriptions and the maintained workflow skill guide attachment import, reuse of existing handles, category-specific answers, and explicit cleanup requests that finish with the cleaned result. The same skill body supplies MCP initialization instructions; skill discovery exposes its manifest, content, and SHA-256 digest for OpenAI’s submission-time import. This does not claim a public-directory skill installation.

All 28 automated checks pass with Node 22.23.2, covering focused values and complete category removal, skill discovery and content integrity, attachment host validation, expiry recovery, file formats, transport, and the UI bridge. The skill also passes `quick_validate.py`.

Authenticated ChatGPT testing after refreshing discovery to v5 confirmed:

- A general metadata question without a photo receives an answer and attachment invitation, with no empty UI card.
- A synthetic JPEG uploaded through ChatGPT’s own composer reaches `import_photo` as the original attachment and opens a Location card showing its recorded coordinates. No widget upload is needed.
- A follow-up request to remove all hidden metadata reuses that imported photo and opens the verified cleaned-copy card without another button press.
- In a fresh native conversation, attaching a synthetic JPEG with a direct removal request completes import, cleanup, and the final card in one turn. The Save action opens ChatGPT’s host-mediated link confirmation. Retrieved that exact download separately: HTTP 200, `image/jpeg`, zero removable fields, and independent successful 32 × 24 pixel decoding.

The native attachment test uncovered a real import failure: ChatGPT supplied signed Azure Blob Storage links rather than `oaiusercontent.com`. Added the three exact storage account hosts observed in the native requests; successful import returned HTTP 200. Arbitrary Azure accounts, redirects, private network addresses, oversized files, and non-HTTPS links remain rejected. Other unobserved attachment hosts are not claimed as tested. Diagnostics log only the URL origin and HTTP status when `DEBUG_MCP=1`. No signed URLs or user photo data are stored in this report.

This remains a personal development connection backed by a temporary tunnel. Earlier sections record historical validation; native composer attachment import is now exercised, while Claude acceptance and a permanent deployment remain separate.


## Vercel custom domain — September 12, 2026

Deployed the MCP server as a Vercel container service in the Lucci MetaScraper project at `https://mcp.metascraper.luccilabs.xyz/mcp`. Vercel verified the exact CNAME and HTTPS configuration. The app uses the dedicated `metascraper-photos` Upstash Redis integration for expiring private photo data. Vercel's in-memory function instances are no longer the source of truth.

The local lint/build suite passes its 28 existing checks. Three additional Redis integration tests passed against the actual dedicated store, using isolated random prefixes: cross-instance inspection/cleanup/download/deletion, multipart uploads with missing/out-of-order rejection, and shared processing locks plus record/data expiry. These three tests are opt-in and skipped by the default offline suite.

Live public MCP testing verified all six tools and v6 resources, JPEG and HEIC full cleanup, and a 6,303,951-byte synthetic PNG sent in bounded parts. The PNG's 6,303,684-byte cleaned output streamed successfully with HTTP 200, contained zero removable fields, and independently decoded to identical pixels. Original and output test handles were deleted afterward. The hosted browser UI also uploaded the 6.3 MB PNG through its picker, displayed recorded metadata, and reached the cleaned-copy view. No personal photo was used for deployment testing.

ChatGPT successfully discovered the Vercel endpoint's tools and v6 widget in a new developer-mode connection. Production hosting is independent of this Mac and the prior Cloudflare quick tunnel. The runtime uses Vercel's container-image beta and metered Upstash storage; automatic storage-plan upgrades are disabled. Source changes were deployed from the working tree and are not yet committed.

Native Vercel acceptance exposed a fourth OpenAI attachment storage account, `oaisdmntprnorthcentralus.blob.core.windows.net`. Added that exact observed host and extended the allowlist regression test. The lint/build and 28 offline checks pass after the fix; temporary origin-only diagnostics are disabled in the production deployment.

A subsequent native test exposed model-side base64 corruption when ChatGPT selected the panel upload helper. `upload_photo` now uses MCP Apps `ui.visibility: ["app"]` and the ChatGPT private-visibility compatibility key; attachment imports remain model-visible. ChatGPT connection discovery was refreshed and the upload helper is absent from its public action list. The protocol test asserts both visibility keys. Deployment: `dpl_A2vtZceUf4b9t9dhHKxSwdHpZGDg`.

Native `import_photo` → `remove_metadata` → `open_photo` completed using the original ChatGPT attachment. The v6 card displayed “Hidden details removed”; its Save action opened ChatGPT’s external-link confirmation pointing at the custom domain. Independently downloaded that exact result: HTTP 200, 274-byte JPEG, zero removable fields, and successful 32 × 24 pixel decoding.

Final acceptance after refreshing discovery: a fresh ChatGPT conversation with only the synthetic JPEG and “Remove the hidden metadata from this photo” completed in one turn and rendered the verified cleaned-copy card. No second upload, base64 workaround, or tool-name instructions were needed. Native result: https://chatgpt.com/c/6aa5921b-dbc0-83ea-8173-29cf7b53af49 .

## Shared Lucci Labs endpoints and isolated sandbox — September 13, 2026

Canonical production endpoint: `https://mcp.luccilabs.xyz/metascraper`. Sandbox endpoint: `https://sandbox.mcp.luccilabs.xyz/metascraper`. The shared gateway projects (`lucci-mcp`, `lucci-mcp-sandbox`) own their respective domains and forward only the registered MetaScraper routes. Launch and Pilot are reserved slugs, with actual requests returning 404 until registered. Vercel manages valid HTTPS. The legacy MetaScraper `/mcp` endpoint remains functional.

Production uses the existing `metascraper` backend and `metascraper-photos` Redis database. Sandbox uses the new `metascraper-sandbox` backend and `metascraper-sandbox-photos` database (`store_QresXSVfJ338hE3X`). The production resource was disconnected/reconnected with production-only scope; no production Redis credentials remain in preview. Sandbox has its own credentials. Neither gateway has database credentials. Both storage plans remain pay-as-you-go with automatic upgrades disabled.

Backend changes support public product prefixes for output links and permit only explicitly configured gateway/backend origins. The v7 standalone panel retains the product path when calling upload/cleanup APIs. New checks cover public prefixed output URLs, private/foreign origins and gateway environment routing. The offline lint/build suite passed 30 tests, with the three external Redis tests skipped as designed.

`node mcp/scripts/verify-environments.mjs` passed against both public endpoints: MCP initialization and v7 discovery, synthetic JPEG metadata inspection/removal, canonical no-store downloads, independently identical decoded pixels, 405 for unsupported MCP GET, and cross-environment view/download rejection in both directions. A 6,303,684-byte cleaned PNG streamed through the production gateway after multipart upload, with unchanged decoded pixels and no removable metadata. All script-created photo handles were deleted afterward.

Native ChatGPT production connection: `asdk_app_6aa6c65f17048191b8d5f66961288d7b`, named MetaScraper. Sandbox: `asdk_app_6aa6c6f7ed308191841445363567f874`, named MetaScraper Sandbox. Both discovered v7 tools/resources and completed an original composer attachment → removal → cleaned-card flow using a synthetic JPEG. Production acceptance chat: https://chatgpt.com/c/6aa6c761-8af4-83ea-b4d1-7cbadd8bfeb6 . Sandbox acceptance chat: https://chatgpt.com/c/6aa6c7d1-f6fc-83ea-b1da-7aaab5f449f0 . The sandbox standalone `/metascraper/ui` picker and cleanup also reached “Hidden details removed.”

During setup, the CLI selected the parent product project for two initial gateway deployments despite nested project links. The legacy domain was promptly reassigned to the known working release, and the final backend release replaced those deployments. The new deployment helper stages an explicit allowlist outside the repository and pins `VERCEL_PROJECT_ID` and `VERCEL_ORG_ID`; its sandbox gateway deployment was exercised successfully. No user photos or secrets were included in the deployment sources.

Final backend deployments: production `dpl_DXdw5yMH7TC8oVZoXGogLfd7ByzS`; sandbox `dpl_9DfFPJDjpHYbnwimQ3rLLidBWgSJ`. Gateway production: `dpl_466UnNfTykTt2PiZ8zUQVgb7VVR5`. At deployment time, source changes remained uncommitted in the working tree. Shared conventions, the product registry and a reusable agent prompt are under `infra/mcp-gateway/` and linked from the root AGENTS.md and README.

## PR synchronization — September 14, 2026

Revalidated the accumulated native ChatGPT, shared storage, gateway and environment changes for PR #7. `npm --prefix mcp run check` passes lint, widget build and 30 offline tests; the three opt-in Redis integration tests are skipped without external credentials. The production dependency audit reports zero vulnerabilities. Live synthetic acceptance passes again for both canonical endpoints, cross-environment denial, and the 6,303,684-byte streamed cleaned PNG with identical decoded pixels.

CI now also triggers for gateway and deployment configuration changes and builds both the portable and Vercel Dockerfiles. The PR includes the deployment conventions and reusable agent prompt. Pre-existing root extension dependency edits remain outside this change.
# Historical validation record

This file records tests performed during the September 2026 feature branch. Current live status and shared route ownership are in [lucci-xyz/mcp](https://github.com/lucci-xyz/mcp/blob/main/HANDOFF.md). Re-run live acceptance after every production deployment; prior results do not prove a current endpoint works.

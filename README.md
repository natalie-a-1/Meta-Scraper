# Lucci Pay

Payment requests from participating apps, reviewed and paid inside ChatGPT.

This is a new project replacing the Meta-Scraper VS Code extension. The UI takes its cues from Wallet: a compact sheet, an identifiable merchant, an exact total, one primary action, and a clear receipt. The real checkout uses ChatGPT’s native payment sheet with Apple Pay requested as a supported method. Payment details and authentication belong to the host.

**Status: working local demo and implementation for a gated native-checkout pilot. Not a launched payment service.**

## What is possible today

| Capability                                                              | Status                                                                                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Merchant backend creates a payment request                              | Implemented with authentication, user binding and idempotency                                                    |
| Review request and receipt in ChatGPT                                   | Implemented with MCP Apps                                                                                        |
| Native ChatGPT payment sheet                                            | `window.openai.requestCheckout` integration; requires OpenAI’s private-beta enablement                           |
| Apple Pay                                                               | Declared in the native sheet’s supported methods; actual availability depends on OpenAI, PSP, account and device |
| Stripe payment processing                                               | Scoped shared payment token adapter implemented; requires PSP credentials and end-to-end partner testing         |
| Arbitrary plugin subscriptions, digital goods, credits, or service fees | Not enabled; current general commerce approval covers physical goods                                             |
| Universal access to other apps or automatic charges                     | Not available; requesting apps must integrate, and the buyer explicitly approves checkout                        |

OpenAI’s checkout reference lists Apple Pay in the native payment-provider schema. It does **not** establish that every ChatGPT installation can open Apple Pay. Its UI guide describes private-beta access, while the submission guidelines restrict embedded third-party checkout. This project therefore has **no external checkout fallback, embedded Stripe card form, ApplePaySession workaround, or simulated biometric prompt**. When native checkout is unavailable, the action is disabled.

The initial merchant contract supports **pre-priced physical-goods pickup orders**, with USD, CAD, GBP and EUR totals in minor units. Shipping/address changes, inventory reservation, subscriptions, refunds, payouts and an unrestricted payment network are outside this first implementation. See [platform limits](docs/platform-limits.md).

## Run the demo

Node.js 24 is required for the built-in SQLite store.

```sh
npm ci
npm run dev
```

Open [the local preview](http://localhost:4242/preview). Try a successful demo payment, a decline, retry and cancellation. Every simulated payment is labeled **Demo** and moves no money.

```sh
npm run demo:request  # an example requesting-app backend; keep the server running
npm run check         # type checking, payment/API tests and production build
npm start             # run the compiled app after npm run build
```

The demo binds to loopback. It uses fictional shared data and a public demo key. Never use demo mode for real orders or customer information.

## Connect to ChatGPT

1. Run the server and expose `/mcp` through an HTTPS tunnel for development. Set `PUBLIC_BASE_URL` to the tunnel origin and restart so the host allowlist matches. A tunnel pointing at loopback can still reach the demo server.
2. In ChatGPT’s app settings, enable Developer Mode and add the HTTPS MCP endpoint, such as `https://your-dev-domain/mcp`. Current plugin documentation uses the newer **Plugins → Connect and test** terminology; labels can vary by client.
3. In demo mode, ask: “Show me the Lucci Pay demo.” The `create_demo_payment_request` tool renders the sheet.
4. For a participating app’s request, enable both integrations and ask to review its returned request ID with Lucci Pay.
5. Refresh the app connection after changing tool descriptors or UI resource metadata.

This repository does not deploy a public endpoint or register a marketplace listing. ChatGPT’s actual native payment sheet, iOS behavior, Apple Pay, 3DS and Stripe sandbox settlement still need to be exercised in an enabled account.

## Native checkout setup

Use `.env.example` and `config/merchants.example.json`. Real credentials belong in environment variables or a secret manager; `config/merchants.json`, local databases and `.env` files are ignored by git.

- Obtain OpenAI approval for the intended marketplace and commerce category. `CHATGPT_CHECKOUT_ENABLED=true` records your deployment choice; it cannot grant beta access.
- Configure an OAuth 2.1 identity provider, public discovery, PKCE, a supported client registration method, JWKS and the resource audience. This server implements the protected resource side, not an authorization server. See [authentication](docs/integration.md#identity-and-account-linking).
- Register each merchant with its PSP-assigned native-checkout merchant identifier, optional Stripe Connect account, real policy URLs, and a hash of a strong merchant API key.
- Confirm with Stripe that the token format, preview API version and connected-account routing match your OpenAI integration. The adapter uses Stripe’s documented `shared_payment_granted_token` flow.
- Set `PAYMENT_MODE=test` with a **test** key before exercising the real host. This mode accepts only scoped SPT tokens and never exposes demo tools.
- Enable live mode only after the pilot is validated. It requires a live Stripe key, native checkout enabled and `LIVE_PAYMENTS_APPROVED=true`. These flags are deployment gates, not proof of commercial approval.

Initial account connection may require the identity provider’s sign-in flow. Once connected, the purchase flow itself stays in ChatGPT. The app does not read Apple Wallet contents or reuse a payment method from another app without an authorized provider token.

## Architecture

```text
server/    Merchant API, OAuth verification, MCP tools, payment lifecycle, SQLite, Stripe
web/       React payment sheet and standard MCP Apps bridge
shared/    Request schemas and checkout types
examples/  Small merchant-backend client and runnable request example
tests/     Lifecycle, processor, auth and HTTP/MCP integration checks
docs/      Integration contract, platform limits and validation notes
```

The primary app shape is `interactive-decoupled`: `show_payment_request` renders the widget; status and mutation tools update it without replacing the UI. Tool/resource wiring is adapted from OpenAI’s **MCP App Basics** example at commit `18cc38e78a968712c357bacdc3c79fead5bfc6b4`. The widget uses the core `App` bridge; `callServerTool` wraps standard `tools/call`. The `window.openai` extension is used only for native checkout and optional dismissal.

Prices are immutable once requested. The server calculates totals, binds the request to a payer and registered merchant, and persists each attempt before contacting Stripe. Retries reuse the same provider idempotency key. Unknown outcomes remain `processing`; only an authoritative matching payment result produces a receipt. Raw payment tokens and buyer details are not persisted or echoed into tool output.

Use one server instance with a persistent SQLite volume for the pilot. Run behind HTTPS with the configured Host preserved. Load balancing, identity-based distributed rate limiting, operator reconciliation, storage backups and fulfillment integration need an operational design before public launch.

## Documentation

- [Participating-app integration](docs/integration.md)
- [Platform limits and Apple Pay](docs/platform-limits.md)
- [Validation and remaining host checks](docs/validation.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

Primary references checked for this implementation:

- [OpenAI checkout API](https://developers.openai.com/plugins/build/monetization)
- [OpenAI MCP UI guide](https://developers.openai.com/plugins/build/chatgpt-ui)
- [OpenAI MCP server](https://developers.openai.com/plugins/build/mcp-server), [tool design](https://developers.openai.com/plugins/plan/tools), [UI reference](https://developers.openai.com/plugins/reference)
- [OpenAI plugin guidelines](https://developers.openai.com/plugins/app-guidelines) and [authentication](https://developers.openai.com/plugins/build/auth)
- [Stripe shared payment tokens](https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens?agent-seller=seller)
- [Apple Pay on the Web](https://developer.apple.com/documentation/applepayontheweb)

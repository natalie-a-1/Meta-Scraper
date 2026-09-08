# Validation

Checked September 8, 2026 on Node.js 24.19.0.

## Completed

`npm run check` passes:

- TypeScript checks for server, widget, examples and tests.
- **22 tests**, all passing.
- Self-contained React widget bundle and compiled MCP/HTTP server.

The tests cover authoritative amount calculation, tampering and invalid amounts, duplicate request keys, payer/merchant isolation, account-routing changes, cancellation, expiry, retry after decline, unknown payment outcomes, persistent recovery after restart, the provider idempotency retention window, concurrent confirmations, required 3DS state, demo isolation, signed JWT validation, missing scopes, token constraints and receipt verification. A delayed UI result cannot overwrite a newer paid receipt because state versions are monotonic.

A real MCP SDK client exercises initialization, discovery, resource retrieval, demo request creation, payment review, simulation, and receipt retrieval over a locally running HTTP server. A separate native-tool contract test verifies private tool metadata, scope checks, token-only inputs and output-schema conformance using a fake PSP. Stripe HTTP requests are tested through an injected transport; these tests never send a real payment.

The compiled demo server also started successfully. `git diff --check` passed.

## Not completed

- **Visual browser review:** this environment’s Cloud Browser policy blocked the local preview and local-file navigation. No screenshot or mobile browser verification is claimed. Open `/preview` locally to review the layout. `node scripts/build-preview-harness.mjs` also creates an offline UI fixture after a build; that fixture uses simulated browser responses and is not an end-to-end backend test.
- **ChatGPT host loop:** no enabled native-checkout account was available for validation. The MCP protocol and response schemas were tested locally, not in ChatGPT’s actual payment sheet.
- **Real PSP sandbox/live settlement:** no Stripe credentials or merchant account were supplied. The exact partner token/buyer envelope, pickup schema, Apple Pay eligibility, 3DS handling and Stripe account routing require validation with the enabled OpenAI/PSP integration.
- **Production:** no hosting, merchant registration, OAuth authorization server, public policy pages, marketplace approval or launch was performed.

Local validation reaches the working-server and MCP protocol levels. It does not establish native Apple Pay availability, payment-provider acceptance, visual readiness or public-launch readiness.

## Before enabling a real pilot

Run test-mode purchases inside the enabled ChatGPT app on the target iOS and web clients. Verify the genuine native sheet and Apple Pay availability; complete success, decline, cancellation and 3DS cases; repeat a confirmation during a timeout; verify matching Stripe and merchant receipts; then check keyboard navigation, narrow screens, dark mode and reduced motion. Confirm that an unsupported host disables checkout and that no purchase path opens an external site. Validate policy links separately.

Do not enable live funds solely because automated tests pass. The remaining checks need the actual host, processor and registered merchant context.

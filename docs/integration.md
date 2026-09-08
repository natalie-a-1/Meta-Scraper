# Participating-app integration

A requesting app creates the order using its own trusted backend and gives ChatGPT the returned `request_id`. ChatGPT can show the request through Lucci Pay when the user has enabled that integration and asks to pay. MCP Apps does not give an arbitrary plugin permission to call another app’s widget or access its credentials.

## Request an order

Authenticate with a **merchant backend key**, never a user’s access token. The registered merchant determines the seller name, policy URLs, PSP merchant ID and Stripe account. Callers cannot override those fields.

```http
POST /v1/payment-requests
Authorization: Bearer <merchant-backend-key>
Content-Type: application/json
Idempotency-Key: order-2026-123
```

```json
{
  "merchant_order_reference": "order-2026-123",
  "payer_subject": "linked-payer-subject",
  "currency": "USD",
  "line_items": [
    {
      "id": "cup-1",
      "name": "Everyday ceramic cup",
      "quantity": 1,
      "unit_amount": 2400,
      "discount": 0,
      "tax": 198
    }
  ],
  "fulfillment": {
    "type": "pickup",
    "title": "Pick up in store",
    "subtitle": "Your merchant location · Ready in 2 hours"
  },
  "expires_in_seconds": 900
}
```

`unit_amount` is per item. `discount` and `tax` are **whole-line** amounts, not per-unit amounts. Subtotal is `quantity × unit_amount − discount`; total is subtotal plus tax. Supply tax and pickup terms after validating inventory and fulfillment in the requesting merchant’s backend. Lucci Pay validates the arithmetic but is not a tax engine or inventory service. Maximum request size is 48 KB, 30 unique lines, 100 units per line and 10,000,000 minor units total. Expiry is 1–30 minutes. Use only the four supported two-decimal currencies.

```json
{
  "request_id": "pay_<opaque-id>",
  "mode": "test",
  "status": "pending",
  "expires_at": "<ISO timestamp>",
  "handoff": {
    "tool": "show_payment_request",
    "arguments": { "request_id": "pay_<opaque-id>" }
  }
}
```

The handoff is data for the host to use; it is not an automatic cross-plugin invocation protocol. Return it as part of your app’s MCP tool result after the user decides to review a purchase. Avoid sending the merchant API key or payer identity into chat. [merchant-client.ts](../examples/merchant-client.ts) is a small server-side integration example.

Retry transient request creation failures with the **same** idempotency key and payload. Changing the amount, currency, payer or other request data under the same key returns `409 idempotency_conflict`. To replace an expired quote, issue a new order revision/key. An existing request is never silently repriced.

## Identity and account linking

The `payer_subject` must come from a trusted account-link mapping established by the merchant and your OAuth identity provider. It must exactly match the authenticated `sub` claim on the buyer’s Lucci Pay access token. Do not accept a payer ID from arbitrary model text or let a merchant impersonate a buyer. Each read, cancel and completion verifies ownership. Merchant API keys cannot authenticate to user tools.

This initial repository does not provide merchant self-service onboarding or a turnkey account-linking UI. Configure merchants and establish trusted identity mappings before a pilot. For a public multi-tenant service, introduce a pairwise linking API instead of sharing global user identifiers across merchants.

The MCP server publishes RFC 9728 resource metadata at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`. The external authorization server must support the current MCP OAuth flow, PKCE, discovery and a supported registration mechanism. Configure its audience as `PUBLIC_BASE_URL/mcp`. User JWTs require a valid RS256/ES256 signature, issuer, audience, subject, issuance time and expiry. Scopes:

| Scope           | Purpose                            |
| --------------- | ---------------------------------- |
| `payments:read` | Review owned requests and receipts |
| `payments:pay`  | Confirm or cancel an owned request |

The SDK version used here exposes security metadata through `_meta.securitySchemes`. Read-only tools are model-visible; payment completion and cancellation are private/app-visible. **Visibility is not authorization:** OAuth, ownership and the scoped PSP token provide the server-side controls.

## Native confirmation

1. `show_payment_request` returns the immutable checkout session and review UI.
2. The user presses Pay. The widget calls the feature-detected `window.openai.requestCheckout(session)` directly from that gesture.
3. The host collects the payment method and confirmation, then calls `complete_checkout` with `checkout_session_id`, optional `buyer`, and `payment_data: { "token": "spt_...", "provider": "stripe" }`.
4. The server verifies the user, request, mode, merchant, token limits and expiry, persists an attempt, and submits the token to Stripe on the registered merchant account. It uses `payment_method_data[shared_payment_granted_token]`, exact server totals and a stable idempotency key.
5. The widget retrieves authoritative status after the host returns. A resolved browser promise alone never marks the order paid.

The optional buyer shape currently accepts `first_name`, `last_name`, and `email`, and the token envelope deliberately rejects unknown payment fields. Confirm the actual partner payload and pickup-session schema during the native pilot; adapt versioned schemas if the enabled host/PSP contract differs. Never loosen this into a raw-card endpoint.

No tokens or buyer details are stored in SQLite, logs or model-visible responses. Stripe API access uses the fixed provider origin, a timeout and API version `2026-04-22.preview`. Keep this version aligned with your granted-token integration.

## Fulfill after verified payment

```http
GET /v1/payment-requests/pay_<opaque-id>
Authorization: Bearer <merchant-backend-key>
```

The response contains the merchant order reference, status, environment and receipt, with no payer identity or payment credentials. Fulfill exactly once only when `status` is `paid`, the environment matches your order, and the receipt amount/currency match your merchant record. Use the stable receipt ID as your fulfillment idempotency key.

This version uses authenticated status retrieval instead of outbound webhooks. Retrieving a `processing` request with a known PaymentIntent refreshes its provider status. Do not treat a demo/test receipt as a live payment.

| State                   | Meaning / permitted next action                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| `pending`               | Awaiting the user; pay, cancel or expire                                                      |
| `processing`            | Provider result uncertain or authentication pending; check status, never start another charge |
| `paid`                  | Authoritative receipt; repeated completion returns the same receipt                           |
| `failed`                | Definite decline or invalid authorization; a new token may retry before expiry                |
| `cancelled` / `expired` | Closed; request a new quote                                                                   |

After a network timeout with no recorded provider ID, the native host can retry the original token and reuse the existing attempt/key for up to 23 hours. The server stores only the token hash. After the key retention window, operator reconciliation is required. Do not reset processing state or mint a new key to “fix” uncertainty. A `requires_3ds` response keeps the request locked; the host must resolve authentication, or the operator must reconcile it. No redirect fallback is implemented.

Refunds and fulfillment support belong to the merchant. This app does not custody money, maintain a stored balance, or provide peer-to-peer transfers.

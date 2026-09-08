// Wiring adapted from openai/openai-apps-sdk-examples, MCP App Basics
// commit 18cc38e78a968712c357bacdc3c79fead5bfc6b4. See THIRD_PARTY_NOTICES.md.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { paymentDataSchema, buyerSchema, type PaymentView } from '../shared/contracts.js';
import type { Payments } from './payments.js';
import { requireScope, type Identity } from './auth.js';
import { safeError } from './errors.js';

export const WIDGET_URI = 'ui://lucci-pay/payment-v1.html';
const requestId = z.string().regex(/^pay_[a-f0-9]{32}$/);
const paymentOutput = {
  payment: z
    .object({
      request_id: requestId,
      state_version: z.number().int().nonnegative(),
      status: z.string(),
      mode: z.enum(['demo', 'test', 'live']),
      session: z.record(z.string(), z.unknown()),
    })
    .passthrough(),
};
const read = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
};
const mutate = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
};

export function paymentResult(view: PaymentView) {
  return {
    content: [
      {
        type: 'text' as const,
        text:
          view.mode === 'demo'
            ? `Demo payment request: ${view.status}. No money moves.`
            : `Payment request from ${view.merchant.name}: ${view.status}.`,
      },
    ],
    structuredContent: { payment: view },
  };
}
export function createMcpServer(payments: Payments, identity: Identity, widgetHtml: string) {
  const server = new McpServer(
    { name: 'lucci-pay', version: '0.1.0' },
    {
      instructions:
        'Show a payment request only when the user asks to review or pay it. Creating or displaying a request never pays it. The user must confirm payment in the payment sheet. Read authoritative payment status before describing a purchase as paid. Never ask for payment credentials in chat.',
    },
  );
  const security = (scope: string) =>
    payments.config.mode === 'demo' ? [{ type: 'noauth' }] : [{ type: 'oauth2', scopes: [scope] }];
  const meta = (scope: string, render = false, privateTool = false) => ({
    ui: {
      ...(render ? { resourceUri: WIDGET_URI } : {}),
      visibility: privateTool ? ['app'] : ['model', 'app'],
    },
    securitySchemes: security(scope),
    ...(privateTool ? { 'openai/visibility': 'private', 'openai/widgetAccessible': true } : {}),
    ...(render
      ? {
          'openai/outputTemplate': WIDGET_URI,
          'openai/toolInvocation/invoking': 'Opening payment request',
          'openai/toolInvocation/invoked': 'Payment request ready',
        }
      : {}),
  });
  const guard = async <T>(scope: string, action: () => Promise<T>) => {
    try {
      requireScope(identity, scope);
      return await action();
    } catch (error) {
      const e = safeError(error);
      return {
        isError: true,
        content: [{ type: 'text' as const, text: e.message }],
        structuredContent: { error: { code: e.code, message: e.message } },
      };
    }
  };
  registerAppResource(
    server,
    'Lucci Pay payment sheet',
    WIDGET_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
          _meta: {
            ui: {
              prefersBorder: false,
              csp: { connectDomains: [], resourceDomains: [] },
              ...(payments.config.mode !== 'demo' ? { domain: payments.config.baseUrl } : {}),
            },
            'openai/widgetDescription':
              'A payment request showing the seller, items and exact total. Payment opens the native ChatGPT payment sheet after a user click.',
          },
        },
      ],
    }),
  );
  registerAppTool(
    server,
    'show_payment_request',
    {
      title: 'Review payment request',
      description:
        'Use this when the user wants to review or pay an existing Lucci Pay request created by a participating app. Requires the request ID returned by that app. Does not charge anyone.',
      inputSchema: { request_id: requestId },
      outputSchema: paymentOutput,
      annotations: read,
      _meta: meta('payments:read', true),
    },
    ({ request_id }) =>
      guard('payments:read', async () =>
        paymentResult(await payments.get(request_id, identity.subject)),
      ),
  );
  registerAppTool(
    server,
    'get_payment_status',
    {
      title: 'Check payment status',
      description:
        'Use this when the user wants the verified status or receipt for a Lucci Pay request. A processing result is not a completed purchase.',
      inputSchema: { request_id: requestId },
      outputSchema: paymentOutput,
      annotations: read,
      _meta: meta('payments:read'),
    },
    ({ request_id }) =>
      guard('payments:read', async () =>
        paymentResult(await payments.get(request_id, identity.subject)),
      ),
  );
  registerAppTool(
    server,
    'cancel_payment_request',
    {
      title: 'Cancel payment request',
      description:
        'Use this when the user presses Cancel on an unpaid request. Cannot cancel a payment in progress or issue refunds.',
      inputSchema: { request_id: requestId },
      outputSchema: paymentOutput,
      annotations: mutate,
      _meta: meta('payments:pay', false, true),
    },
    ({ request_id }) =>
      guard('payments:pay', async () =>
        paymentResult(await payments.cancel(request_id, identity.subject)),
      ),
  );
  if (payments.config.mode !== 'demo') {
    registerAppTool(
      server,
      'complete_checkout',
      {
        title: 'Complete checkout',
        description:
          'Finalize a checkout from the native ChatGPT payment sheet after the user confirms. Accepts a scoped Stripe shared payment token; never accepts raw card credentials. Reserved for the checkout host.',
        inputSchema: {
          checkout_session_id: requestId,
          buyer: buyerSchema.optional(),
          payment_data: paymentDataSchema,
        },
        outputSchema: z
          .object({
            id: requestId,
            status: z.enum(['completed', 'not_ready_for_payment']),
            currency: z.string(),
            line_items: z.array(z.record(z.string(), z.unknown())),
            totals: z.array(z.record(z.string(), z.unknown())),
            order: z
              .object({ id: z.string(), checkout_session_id: requestId, permalink_url: z.string() })
              .optional(),
          })
          .passthrough(),
        annotations: { ...mutate, destructiveHint: true, openWorldHint: true },
        _meta: meta('payments:pay', false, true),
      },
      ({ checkout_session_id, payment_data }) =>
        guard('payments:pay', async () => {
          try {
            const view = await payments.complete(
              checkout_session_id,
              identity.subject,
              payment_data.token,
            );
            return {
              content: [],
              structuredContent: {
                ...view.session,
                status: view.status === 'paid' ? 'completed' : 'not_ready_for_payment',
                order: view.receipt
                  ? { id: view.receipt.id, checkout_session_id, permalink_url: '' }
                  : undefined,
              },
            };
          } catch (error) {
            const e = safeError(error);
            return {
              isError: true,
              content: [{ type: 'text' as const, text: e.message }],
              structuredContent: {
                id: checkout_session_id,
                status: 'not_ready_for_payment',
                messages: [
                  { type: 'error', code: e.code, content_type: 'plain', content: e.message },
                ],
              },
            };
          }
        }),
    );
  } else {
    registerAppTool(
      server,
      'create_demo_payment_request',
      {
        title: 'Preview Lucci Pay',
        description:
          'Use this when the user explicitly wants to try the Lucci Pay demo. Creates a fictional payment request. No money moves.',
        inputSchema: {},
        outputSchema: paymentOutput,
        annotations: { ...mutate, idempotentHint: false },
        _meta: meta('payments:read', true),
      },
      () =>
        guard('payments:read', async () =>
          paymentResult(await payments.get(payments.demoRequest().id, identity.subject)),
        ),
    );
    registerAppTool(
      server,
      'simulate_payment',
      {
        title: 'Simulate demo payment',
        description:
          'Use this only for the demo payment button. Records a simulated outcome; cannot charge money.',
        inputSchema: { request_id: requestId, outcome: z.enum(['success', 'declined']) },
        outputSchema: paymentOutput,
        annotations: mutate,
        _meta: meta('payments:pay', false, true),
      },
      ({ request_id, outcome }) =>
        guard('payments:pay', async () =>
          paymentResult(await payments.simulate(request_id, identity.subject, outcome)),
        ),
    );
  }
  return server;
}

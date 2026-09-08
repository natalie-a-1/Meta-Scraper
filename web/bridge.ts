import type { App } from '@modelcontextprotocol/ext-apps';
import type { PaymentView } from '../shared/contracts.js';

export type PaymentAction = 'get_payment_status' | 'cancel_payment_request' | 'simulate_payment';
export function latestPayment(current: PaymentView, next: PaymentView): PaymentView {
  return next.request_id === current.request_id && next.state_version >= current.state_version
    ? next
    : current;
}
export function extractPayment(result: unknown): PaymentView | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const record = result as Record<string, unknown>;
  const content = (record.structuredContent ?? record) as { payment?: PaymentView };
  if (record.isError || !content.payment?.session?.line_items || !content.payment?.request_id)
    return undefined;
  return content.payment;
}
export async function invoke(
  app: App | null,
  action: PaymentAction,
  id: string,
  outcome?: string,
): Promise<PaymentView> {
  let result: unknown;
  if (window.parent === window) {
    const path =
      action === 'get_payment_status'
        ? ''
        : action === 'cancel_payment_request'
          ? '/cancel'
          : '/simulate';
    const response = await fetch(`/api/demo/${encodeURIComponent(id)}${path}`, {
      method: path ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: path ? JSON.stringify(outcome ? { outcome } : {}) : undefined,
    });
    if (!response.ok) throw new Error('Could not update this request. Please try again.');
    result = await response.json();
  } else {
    if (!app) throw new Error('The payment request is still connecting.');
    // callServerTool is the ext-apps wrapper for the standard tools/call bridge.
    result = await app.callServerTool({
      name: action,
      arguments: { request_id: id, ...(outcome ? { outcome } : {}) },
    });
  }
  const payment = extractPayment(result);
  if (!payment) throw new Error('Could not confirm the payment status. Please check again.');
  return payment;
}

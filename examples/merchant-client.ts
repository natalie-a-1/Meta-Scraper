import type { RequestInput } from '../shared/contracts.js';

export interface MerchantClientOptions {
  baseUrl: string;
  apiKey: string;
}
export interface PaymentHandoff {
  request_id: string;
  status: string;
  mode: string;
  expires_at: string;
  handoff: { tool: 'show_payment_request'; arguments: { request_id: string } };
}
/** Call from the requesting app's backend, using its authenticated order data. */
export async function createPaymentRequest(
  options: MerchantClientOptions,
  order: RequestInput,
): Promise<PaymentHandoff> {
  const response = await fetch(`${options.baseUrl.replace(/\/$/, '')}/v1/payment-requests`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': order.merchant_order_reference,
    },
    body: JSON.stringify(order),
    signal: AbortSignal.timeout(15_000),
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error(
      `Payment request failed (${response.status}). Retry the same order reference for transient failures.`,
    );
  return (await response.json()) as PaymentHandoff;
}

/** Fulfill only after this returns status=paid and mode matches your environment. */
export async function getPaymentStatus(options: MerchantClientOptions, requestId: string) {
  const response = await fetch(
    `${options.baseUrl.replace(/\/$/, '')}/v1/payment-requests/${encodeURIComponent(requestId)}`,
    {
      headers: { Authorization: `Bearer ${options.apiKey}` },
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    },
  );
  if (!response.ok) throw new Error(`Status lookup failed (${response.status}).`);
  return (await response.json()) as {
    request_id: string;
    status: string;
    mode: string;
    receipt?: unknown;
  };
}

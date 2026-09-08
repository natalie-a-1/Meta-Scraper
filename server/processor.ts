import { PaymentError } from './errors.js';
import type { Config, Merchant } from './config.js';
import type { StoredRequest } from './store.js';
import { totalAmount } from '../shared/contracts.js';
import { z } from 'zod';

export interface ChargeResult {
  id: string;
  status: 'succeeded' | 'processing' | 'failed';
  errorCode?: string;
}
export interface Processor {
  charge(
    request: StoredRequest,
    merchant: Merchant,
    token: string,
    fresh: boolean,
  ): Promise<ChargeResult>;
  retrieve(request: StoredRequest, merchant: Merchant): Promise<ChargeResult>;
}
const intentSchema = z.object({
  id: z.string().startsWith('pi_'),
  status: z.string(),
  amount: z.number().int(),
  amount_received: z.number().int(),
  currency: z.string(),
  livemode: z.boolean(),
  metadata: z.object({ lucci_request_id: z.string() }),
});

// Fixed origin and version. Requesting apps cannot select a PSP URL or account.
export class StripeProcessor implements Processor {
  constructor(
    private config: Config,
    private http: typeof fetch = fetch,
  ) {}

  private async call(
    path: string,
    merchant: Merchant,
    options?: { form: URLSearchParams; key: string },
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.stripeKey}`,
      'Stripe-Version': '2026-04-22.preview',
    };
    if (merchant.stripe_account) headers['Stripe-Account'] = merchant.stripe_account;
    if (options) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Idempotency-Key'] = options.key;
    }
    let response: Response;
    try {
      response = await this.http(`https://api.stripe.com/v1/${path}`, {
        method: options ? 'POST' : 'GET',
        headers,
        body: options?.form,
        signal: AbortSignal.timeout(12_000),
        redirect: 'error',
      });
    } catch {
      throw new PaymentError(
        'payment_pending',
        'Payment status is being checked. Please do not start another payment.',
        503,
      );
    }
    const body = (await response.json()) as { error?: { type?: string; code?: string } };
    if (!response.ok) {
      if (body.error?.type === 'card_error')
        throw new PaymentError(
          'payment_declined',
          'Your payment was declined. Choose another payment method.',
          402,
        );
      // Do not make an unknown provider response retryable with a new key.
      throw new PaymentError(
        'payment_pending',
        'We are checking the payment with the provider.',
        503,
      );
    }
    return body;
  }

  private result(raw: unknown, request: StoredRequest): ChargeResult {
    const intent = intentSchema.parse(raw);
    if (
      intent.amount !== totalAmount(request.session) ||
      intent.currency !== request.session.currency.toLowerCase() ||
      intent.livemode !== (request.mode === 'live') ||
      intent.metadata.lucci_request_id !== request.id ||
      (intent.status === 'succeeded' && intent.amount_received !== intent.amount)
    ) {
      throw new PaymentError(
        'provider_mismatch',
        'The payment details need to be reconciled before an order can be confirmed.',
        502,
      );
    }
    if (intent.status === 'succeeded') return { id: intent.id, status: 'succeeded' };
    if (['requires_payment_method', 'canceled'].includes(intent.status))
      return { id: intent.id, status: 'failed', errorCode: 'payment_declined' };
    // A requires_action intent might later complete. Keep it locked so a new
    // attempt cannot charge twice. The native host owns any 3DS authentication.
    return {
      id: intent.id,
      status: 'processing',
      errorCode: intent.status === 'requires_action' ? 'requires_3ds' : 'payment_pending',
    };
  }

  async charge(
    request: StoredRequest,
    merchant: Merchant,
    token: string,
    fresh: boolean,
  ): Promise<ChargeResult> {
    if (request.mode === 'demo')
      throw new PaymentError('invalid_mode', 'Demo requests cannot use Stripe.');
    if (request.provider_id) return this.retrieve(request, merchant);
    if (fresh) {
      const grant = z
        .object({
          id: z.string(),
          deactivated_at: z.number().nullable(),
          usage_limits: z.object({
            currency: z.string(),
            max_amount: z.number().int(),
            expires_at: z.number().int(),
          }),
        })
        .parse(
          await this.call(`shared_payment/granted_tokens/${encodeURIComponent(token)}`, merchant),
        );
      if (
        grant.id !== token ||
        grant.deactivated_at !== null ||
        grant.usage_limits.expires_at <= Date.now() / 1000 ||
        grant.usage_limits.currency !== request.session.currency.toLowerCase() ||
        grant.usage_limits.max_amount < totalAmount(request.session)
      ) {
        throw new PaymentError(
          'invalid_payment_token',
          'This payment authorization does not match the request.',
          400,
        );
      }
    }
    const form = new URLSearchParams({
      amount: String(totalAmount(request.session)),
      currency: request.session.currency.toLowerCase(),
      'payment_method_data[shared_payment_granted_token]': token,
      confirm: 'true',
      'metadata[lucci_request_id]': request.id,
    });
    return this.result(
      await this.call('payment_intents', merchant, {
        form,
        key: `lucci:${request.id}:${request.attempt}`,
      }),
      request,
    );
  }
  async retrieve(request: StoredRequest, merchant: Merchant): Promise<ChargeResult> {
    if (!request.provider_id)
      throw new PaymentError(
        'payment_pending',
        'Waiting for the provider to confirm this payment.',
        409,
      );
    return this.result(
      await this.call(`payment_intents/${encodeURIComponent(request.provider_id)}`, merchant),
      request,
    );
  }
}

export class DemoProcessor implements Processor {
  async charge(): Promise<ChargeResult> {
    throw new PaymentError('demo_only', 'Use the explicitly labeled demo flow.');
  }
  async retrieve(): Promise<ChargeResult> {
    throw new PaymentError('demo_only', 'No provider exists in demo mode.');
  }
}

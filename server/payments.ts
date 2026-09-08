import { randomUUID } from 'node:crypto';
import {
  requestInput,
  paymentDataSchema,
  totalAmount,
  type PaymentView,
  type RequestInput,
} from '../shared/contracts.js';
import { hash, type Config, type Merchant } from './config.js';
import { PaymentError } from './errors.js';
import type { ChargeResult, Processor } from './processor.js';
import { Store, type StoredRequest } from './store.js';

export class Payments {
  constructor(
    readonly config: Config,
    readonly store: Store,
    private processor: Processor,
  ) {}

  create(merchant: Merchant, raw: unknown, key: string): StoredRequest {
    if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(key))
      throw new PaymentError(
        'invalid_idempotency_key',
        'Supply an Idempotency-Key of 8–128 characters.',
      );
    const input = requestInput.parse(raw);
    if (this.config.mode === 'demo' && input.payer_subject !== 'demo-user')
      throw new PaymentError('demo_only', 'Demo requests must use the demo user.');
    if (new Set(input.line_items.map((i) => i.id)).size !== input.line_items.length)
      throw new PaymentError('duplicate_item', 'Line item IDs must be unique.');
    const lineItems = input.line_items.map((item) => {
      const base = item.unit_amount * item.quantity;
      if (item.discount > base)
        throw new PaymentError('invalid_discount', 'A discount cannot exceed the line amount.');
      return {
        id: item.id,
        item: { id: item.id, quantity: item.quantity },
        name: item.name,
        base_amount: base,
        discount: item.discount,
        subtotal: base - item.discount,
        tax: item.tax,
        total: base - item.discount + item.tax,
      };
    });
    const sum = (key: 'base_amount' | 'subtotal' | 'tax' | 'total') =>
      lineItems.reduce((n, i) => n + i[key], 0);
    if (sum('total') < 50 || sum('total') > 10_000_000)
      throw new PaymentError(
        'invalid_amount',
        'The total must be between 50 and 10,000,000 minor currency units.',
      );
    const id = `pay_${randomUUID().replaceAll('-', '')}`;
    const now = Date.now();
    return this.store.insert({
      state_version: 0,
      id,
      merchant_id: merchant.id,
      payer_subject: input.payer_subject,
      idempotency_key: key,
      fingerprint: hash(
        JSON.stringify({
          input,
          mode: this.config.mode,
          provider: merchant.provider_merchant_id,
          account: merchant.stripe_account,
        }),
      ),
      processor_account: merchant.stripe_account,
      mode: this.config.mode,
      status: 'pending',
      attempt: 0,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + input.expires_in_seconds * 1000).toISOString(),
      session: {
        id,
        payment_provider: {
          provider: 'stripe',
          merchant_id: merchant.provider_merchant_id,
          supported_payment_methods: [
            { type: 'apple_pay' },
            { type: 'card', allowed_card_brands: ['visa', 'mastercard', 'amex'] },
          ],
        },
        payment_mode: this.config.mode === 'live' ? 'live' : 'test',
        status: 'ready_for_payment',
        currency: input.currency,
        metadata: { merchant_order_reference: input.merchant_order_reference },
        line_items: lineItems,
        totals: [
          { type: 'items_base_amount', display_text: 'Items', amount: sum('base_amount') },
          { type: 'subtotal', display_text: 'Subtotal', amount: sum('subtotal') },
          { type: 'tax', display_text: 'Tax', amount: sum('tax') },
          { type: 'total', display_text: 'Total', amount: sum('total') },
        ],
        fulfillment_options: [
          { id: 'pickup', ...input.fulfillment, subtotal: 0, tax: 0, total: 0 },
        ],
        fulfillment_option_id: 'pickup',
        links: [
          { type: 'terms_of_use', url: merchant.terms_url },
          { type: 'privacy_policy', url: merchant.privacy_url },
          { type: 'refund_policy', url: merchant.refund_url },
          { type: 'support_url', url: merchant.support_url },
        ],
      },
    });
  }

  private merchant(request: StoredRequest): Merchant {
    const merchant = this.config.merchants.find((m) => m.id === request.merchant_id);
    if (!merchant)
      throw new PaymentError('merchant_unavailable', 'This merchant is unavailable.', 409);
    if (request.mode !== this.config.mode)
      throw new PaymentError(
        'mode_mismatch',
        'This request belongs to a different payment environment.',
        409,
      );
    if (
      request.session.payment_provider.merchant_id !== merchant.provider_merchant_id ||
      request.processor_account !== merchant.stripe_account
    )
      throw new PaymentError(
        'merchant_changed',
        'This merchant’s payment setup changed. Request a new checkout.',
        409,
      );
    return merchant;
  }
  private own(id: string, subject: string): StoredRequest {
    const request = this.store.get(id);
    if (request.payer_subject !== subject)
      throw new PaymentError('not_found', 'Payment request not found.', 404);
    this.merchant(request);
    return request;
  }
  private expire(id: string): StoredRequest {
    return this.store.update(id, (request) => {
      if (
        ['pending', 'failed'].includes(request.status) &&
        Date.parse(request.expires_at) <= Date.now()
      )
        request.status = 'expired';
    });
  }
  private view(request: StoredRequest): PaymentView {
    const m = this.merchant(request);
    return {
      state_version: request.state_version,
      request_id: request.id,
      merchant: { name: m.name, domain: m.domain },
      mode: request.mode,
      status: request.status,
      expires_at: request.expires_at,
      checkout_enabled: this.config.checkoutEnabled,
      session: request.session,
      receipt: request.receipt,
    };
  }
  async get(id: string, subject: string): Promise<PaymentView> {
    let request = this.own(id, subject);
    request = this.expire(id);
    if (request.status === 'processing' && request.provider_id) {
      try {
        request = this.record(
          request,
          await this.processor.retrieve(request, this.merchant(request)),
        );
      } catch {
        /* Retain processing until the provider's result is authoritative. */
      }
    }
    return this.view(request);
  }
  async merchantStatus(id: string, merchant: Merchant) {
    const request = this.store.get(id);
    if (request.merchant_id !== merchant.id)
      throw new PaymentError('not_found', 'Payment request not found.', 404);
    const view = await this.get(id, request.payer_subject);
    return {
      request_id: id,
      merchant_order_reference: request.session.metadata.merchant_order_reference,
      status: view.status,
      mode: view.mode,
      receipt: view.receipt,
    };
  }

  private record(request: StoredRequest, result: ChargeResult): StoredRequest {
    return this.store.update(request.id, (current) => {
      if (current.status === 'paid' || current.attempt !== request.attempt) return;
      current.provider_id = result.id;
      if (result.status === 'succeeded') {
        current.status = 'paid';
        current.session.status = 'completed';
        current.receipt = {
          id: `receipt_${current.id.slice(4)}`,
          checkout_session_id: current.id,
          amount: totalAmount(current.session),
          currency: current.session.currency,
          paid_at: new Date().toISOString(),
          mode: current.mode,
          merchant_name: this.merchant(current).name,
        };
      } else current.status = result.status === 'failed' ? 'failed' : 'processing';
    });
  }

  async complete(id: string, subject: string, token: string): Promise<PaymentView> {
    paymentDataSchema.parse({ token });
    this.own(id, subject);
    if (this.config.mode === 'demo' || !this.config.checkoutEnabled)
      throw new PaymentError(
        'checkout_unavailable',
        'Native checkout is not enabled for this app.',
        403,
      );
    this.expire(id);
    let fresh = false;
    const tokenHash = hash(token);
    const request = this.store.update(id, (current) => {
      if (current.status === 'paid') return;
      if (['cancelled', 'expired'].includes(current.status))
        throw new PaymentError('request_closed', 'This payment request is closed.', 409);
      if (current.status === 'processing') {
        if (current.token_hash !== tokenHash)
          throw new PaymentError(
            'payment_pending',
            'The previous payment is still being checked.',
            409,
          );
        // Stripe keys are retained at least 24 hours. Never replay after that window.
        if (
          Date.now() - Date.parse(current.attempt_started_at!) > 23 * 3600_000 &&
          !current.provider_id
        )
          throw new PaymentError(
            'reconciliation_required',
            'Contact support to reconcile this payment.',
            409,
          );
        return;
      }
      if (current.token_hash === tokenHash)
        throw new PaymentError('payment_declined', 'Choose a new payment method to retry.', 402);
      fresh = true;
      current.status = 'processing';
      current.attempt += 1;
      current.token_hash = tokenHash;
      current.attempt_started_at = new Date().toISOString();
      delete current.provider_id;
    });
    if (request.status === 'paid') return this.view(request);
    try {
      const result = await this.processor.charge(request, this.merchant(request), token, fresh);
      const updated = this.record(request, result);
      if (updated.status !== 'paid' && result.errorCode)
        throw new PaymentError(
          result.errorCode,
          result.errorCode === 'requires_3ds'
            ? 'Please authenticate this payment in the payment sheet.'
            : result.errorCode === 'payment_declined'
              ? 'Payment declined. Choose another method.'
              : 'Your payment is being confirmed.',
          402,
        );
      return this.view(updated);
    } catch (error) {
      if (
        error instanceof PaymentError &&
        ['payment_declined', 'invalid_payment_token'].includes(error.code)
      ) {
        this.store.update(id, (current) => {
          if (current.status === 'processing' && current.attempt === request.attempt)
            current.status = 'failed';
        });
      }
      throw error;
    }
  }
  async cancel(id: string, subject: string): Promise<PaymentView> {
    this.own(id, subject);
    const request = this.store.update(id, (current) => {
      if (current.status === 'processing' || current.status === 'paid')
        throw new PaymentError(
          'cannot_cancel',
          'A payment in progress or already paid cannot be cancelled here.',
          409,
        );
      if (current.status !== 'expired') current.status = 'cancelled';
    });
    return this.view(request);
  }
  async simulate(
    id: string,
    subject: string,
    outcome: 'success' | 'declined',
  ): Promise<PaymentView> {
    this.own(id, subject);
    if (this.config.mode !== 'demo')
      throw new PaymentError('demo_disabled', 'Simulation is disabled.', 403);
    this.expire(id);
    const request = this.store.update(id, (current) => {
      if (current.status === 'paid') return;
      if (['cancelled', 'expired'].includes(current.status))
        throw new PaymentError('request_closed', 'This demo request is closed.', 409);
      current.status = outcome === 'success' ? 'processing' : 'failed';
    });
    return this.view(
      outcome === 'success'
        ? this.record(request, { id: `demo_${id}`, status: 'succeeded' })
        : request,
    );
  }
  demoRequest(): StoredRequest {
    const input: RequestInput = {
      merchant_order_reference: `demo-${randomUUID()}`,
      payer_subject: 'demo-user',
      currency: 'USD',
      line_items: [
        {
          id: 'ceramic-cup',
          name: 'Everyday ceramic cup',
          quantity: 1,
          unit_amount: 2400,
          tax: 198,
          discount: 0,
        },
      ],
      fulfillment: {
        type: 'pickup',
        title: 'Pick up in store',
        subtitle: 'Studio Supply · Ready in 2 hours',
      },
      expires_in_seconds: 900,
    };
    if (this.config.mode !== 'demo')
      throw new PaymentError('demo_disabled', 'Simulation is disabled.', 403);
    return this.create(this.config.merchants[0]!, input, input.merchant_order_reference);
  }
}

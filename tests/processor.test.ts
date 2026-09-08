import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.js';
import { Payments } from '../server/payments.js';
import { StripeProcessor } from '../server/processor.js';
import { demoMerchant, type Config } from '../server/config.js';

const merchant = {
  ...demoMerchant,
  provider_merchant_id: 'profile_seller',
  stripe_account: 'acct_seller',
};
const config: Config = {
  mode: 'test',
  port: 4242,
  baseUrl: 'http://localhost:4242',
  databasePath: ':memory:',
  checkoutEnabled: true,
  merchants: [merchant],
  stripeKey: 'sk_test_fixture',
};
const fixture = (t: test.TestContext, http: typeof fetch) => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const service = new Payments(config, store, new StripeProcessor(config, http));
  const request = service.create(
    merchant,
    {
      merchant_order_reference: 'processor-order',
      payer_subject: 'customer-1',
      currency: 'USD',
      line_items: [{ id: 'cup', name: 'Cup', quantity: 1, unit_amount: 2400 }],
      fulfillment: { type: 'pickup', title: 'Pickup', subtitle: 'Ready now' },
    },
    'processor-order',
  );
  return { service, store, request };
};

test('Stripe receives a scoped SPT, exact amount, registered account and stable retry key', async (t) => {
  let id = '';
  const calls: { path: string; options?: RequestInit }[] = [];
  const http: typeof fetch = async (url, options) => {
    calls.push({ path: String(url), options });
    if (String(url).includes('granted_tokens'))
      return Response.json({
        id: 'spt_fixture',
        deactivated_at: null,
        usage_limits: {
          currency: 'usd',
          max_amount: 2400,
          expires_at: Math.floor(Date.now() / 1000) + 900,
        },
      });
    return Response.json({
      id: 'pi_fixture',
      status: 'succeeded',
      amount: 2400,
      amount_received: 2400,
      currency: 'usd',
      livemode: false,
      metadata: { lucci_request_id: id },
    });
  };
  const { service, request } = fixture(t, http);
  id = request.id;
  assert.equal((await service.complete(id, 'customer-1', 'spt_fixture')).status, 'paid');
  const options = calls[1]!.options!;
  const headers = new Headers(options.headers);
  assert.equal(headers.get('Stripe-Account'), 'acct_seller');
  assert.equal(headers.get('Stripe-Version'), '2026-04-22.preview');
  assert.equal(headers.get('Idempotency-Key'), `lucci:${id}:1`);
  const form = options.body as URLSearchParams;
  assert.equal(form.get('amount'), '2400');
  assert.equal(form.get('payment_method_data[shared_payment_granted_token]'), 'spt_fixture');
  assert.equal(form.get('confirm'), 'true');
  assert.equal(calls.length, 2);
});

test('invalid or expired token limits are rejected before a charge', async (t) => {
  let calls = 0;
  const { service, request } = fixture(t, async () => {
    calls++;
    return Response.json({
      id: 'spt_fixture',
      deactivated_at: null,
      usage_limits: { currency: 'eur', max_amount: 1, expires_at: 1 },
    });
  });
  await assert.rejects(service.complete(request.id, 'customer-1', 'spt_fixture'), {
    code: 'invalid_payment_token',
  });
  assert.equal(calls, 1);
});

test('provider amount, currency, mode, metadata and captured amount must match before receipt', async (t) => {
  for (const mismatch of [
    { amount: 1 },
    { currency: 'eur' },
    { livemode: true },
    { amount_received: 10 },
    { metadata: { lucci_request_id: 'other' } },
  ]) {
    let id = '';
    const { service, request, store } = fixture(t, async (url) => {
      if (String(url).includes('granted_tokens'))
        return Response.json({
          id: 'spt_fixture',
          deactivated_at: null,
          usage_limits: { currency: 'usd', max_amount: 2400, expires_at: (Date.now() / 1000) | 0 },
        });
      return Response.json({
        id: 'pi_fixture',
        status: 'succeeded',
        amount: 2400,
        amount_received: 2400,
        currency: 'usd',
        livemode: false,
        metadata: { lucci_request_id: id },
        ...mismatch,
      });
    });
    id = request.id;
    // Resume a persisted uncertain attempt to exercise provider response validation.
    const { hash } = await import('../server/config.js');
    store.update(id, (r) => {
      r.status = 'processing';
      r.attempt = 1;
      r.token_hash = hash('spt_fixture');
      r.attempt_started_at = new Date().toISOString();
    });
    await assert.rejects(service.complete(id, 'customer-1', 'spt_fixture'), {
      code: 'provider_mismatch',
    });
    assert.equal(store.get(id).receipt, undefined);
  }
});

test('concurrent confirmations share one Stripe idempotency key', async (t) => {
  let id = '';
  const keys: string[] = [];
  const { service, request } = fixture(t, async (url, options) => {
    if (String(url).includes('granted_tokens'))
      return Response.json({
        id: 'spt_fixture',
        deactivated_at: null,
        usage_limits: {
          currency: 'usd',
          max_amount: 2400,
          expires_at: Math.floor(Date.now() / 1000) + 900,
        },
      });
    keys.push(new Headers(options?.headers).get('Idempotency-Key')!);
    await new Promise((resolve) => setTimeout(resolve, 10));
    return Response.json({
      id: 'pi_fixture',
      status: 'succeeded',
      amount: 2400,
      amount_received: 2400,
      currency: 'usd',
      livemode: false,
      metadata: { lucci_request_id: id },
    });
  });
  id = request.id;
  const results = await Promise.all([
    service.complete(id, 'customer-1', 'spt_fixture'),
    service.complete(id, 'customer-1', 'spt_fixture'),
  ]);
  assert.equal(new Set(keys).size, 1);
  assert.ok(keys.length >= 1);
  assert.deepEqual(results[0]!.receipt, results[1]!.receipt);
});

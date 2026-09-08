import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.js';
import { Payments } from '../server/payments.js';
import { demoMerchant, loadConfig, hash, type Config } from '../server/config.js';
import { PaymentError } from '../server/errors.js';
import type { Processor } from '../server/processor.js';
import { requestInput, totalAmount } from '../shared/contracts.js';
import { latestPayment } from '../web/bridge.js';

test('late host results cannot regress a paid receipt to a pending request', async (t) => {
  const { service } = fixture(t);
  const request = service.create(merchant, input, 'versioned-order');
  const pending = await service.get(request.id, 'customer-1');
  const paid = await service.complete(request.id, 'customer-1', 'spt_versioned');
  assert.ok(paid.state_version > pending.state_version);
  assert.equal(latestPayment(paid, pending).status, 'paid');
  assert.equal(latestPayment(pending, paid).status, 'paid');
  assert.equal((await service.get(request.id, 'customer-1')).state_version, paid.state_version);
});

export const input = {
  merchant_order_reference: 'order-123',
  payer_subject: 'customer-1',
  currency: 'USD',
  line_items: [
    { id: 'cup', name: 'Ceramic cup', quantity: 2, unit_amount: 1500, discount: 200, tax: 231 },
  ],
  fulfillment: { type: 'pickup', title: 'Pickup', subtitle: 'Ready tomorrow' },
};
export const merchant = {
  ...demoMerchant,
  id: 'studio',
  name: 'Studio',
  provider_merchant_id: 'profile_studio',
};
export const testConfig = (): Config => ({
  mode: 'test',
  port: 4242,
  baseUrl: 'http://localhost:4242',
  databasePath: ':memory:',
  checkoutEnabled: true,
  merchants: [merchant],
});
const noop: Processor = {
  charge: async () => ({ id: 'pi_1', status: 'succeeded' }),
  retrieve: async () => ({ id: 'pi_1', status: 'succeeded' }),
};
function fixture(t: test.TestContext, processor: Processor = noop) {
  const store = new Store(':memory:');
  t.after(() => store.close());
  return { store, service: new Payments(testConfig(), store, processor) };
}
test('server computes totals in minor units, with line discounts and tax', (t) => {
  const { service } = fixture(t);
  const r = service.create(merchant, input, 'order-123');
  assert.equal(totalAmount(r.session), 3031);
  assert.equal(r.session.line_items[0]!.subtotal, 2800);
  assert.deepEqual(r.session.payment_provider.supported_payment_methods[0], { type: 'apple_pay' });
  assert.equal(r.session.payment_provider.merchant_id, 'profile_studio');
});
test('rejects fractions, negatives, caller totals and caller payment account overrides', (t) => {
  const { service } = fixture(t);
  for (const unit_amount of [-1, 0.3, 20_000_000])
    assert.throws(() =>
      service.create(
        merchant,
        { ...input, line_items: [{ ...input.line_items[0], unit_amount }] },
        'order-123',
      ),
    );
  assert.throws(() => service.create(merchant, { ...input, total: 1 }, 'order-123'));
  assert.throws(() =>
    service.create(
      merchant,
      { ...input, payment_provider: { merchant_id: 'attacker' } },
      'order-123',
    ),
  );
  assert.throws(() =>
    service.create(
      merchant,
      { ...input, line_items: [{ ...input.line_items[0], discount: 5000 }] },
      'order-123',
    ),
  );
  assert.throws(() =>
    service.create(
      merchant,
      { ...input, line_items: [input.line_items[0], input.line_items[0]] },
      'order-123',
    ),
  );
});
test('creation retries return the same request and changed payloads conflict', (t) => {
  const { service } = fixture(t);
  const first = service.create(merchant, input, 'order-123');
  assert.equal(service.create(merchant, input, 'order-123').id, first.id);
  assert.throws(() => service.create(merchant, { ...input, currency: 'EUR' }, 'order-123'), {
    code: 'idempotency_conflict',
  });
});
test('payer and merchant boundaries apply to every read and write', async (t) => {
  const { service } = fixture(t);
  const r = service.create(merchant, input, 'order-123');
  await assert.rejects(service.get(r.id, 'other-user'), { code: 'not_found' });
  await assert.rejects(service.complete(r.id, 'other-user', 'spt_token'), { code: 'not_found' });
  await assert.rejects(service.cancel(r.id, 'other-user'), { code: 'not_found' });
  await assert.rejects(service.merchantStatus(r.id, { ...merchant, id: 'another-merchant' }), {
    code: 'not_found',
  });
});
test('merchant configuration changes cannot redirect an existing payment', async (t) => {
  const { service } = fixture(t);
  const r = service.create(merchant, input, 'order-123');
  service.config.merchants = [{ ...merchant, stripe_account: 'acct_changed' }];
  await assert.rejects(service.complete(r.id, 'customer-1', 'spt_token'), {
    code: 'merchant_changed',
  });
});
test('cancel and expiry cannot be paid or turned into simulated success', async (t) => {
  const { service, store } = fixture(t);
  const r = service.create(merchant, input, 'order-123');
  await service.cancel(r.id, 'customer-1');
  await assert.rejects(service.complete(r.id, 'customer-1', 'spt_token'), {
    code: 'request_closed',
  });
  const expired = service.create(merchant, input, 'order-456');
  store.update(expired.id, (r) => {
    r.expires_at = '2000-01-01T00:00:00.000Z';
  });
  await assert.rejects(service.complete(expired.id, 'customer-1', 'spt_token'), {
    code: 'request_closed',
  });
  await assert.rejects(service.simulate(expired.id, 'customer-1', 'success'), {
    code: 'demo_disabled',
  });
});
test('paid retries are idempotent and cannot be cancelled', async (t) => {
  let charges = 0;
  const { service } = fixture(t, {
    ...noop,
    charge: async () => {
      charges++;
      return { id: 'pi_paid', status: 'succeeded' };
    },
  });
  const r = service.create(merchant, input, 'order-123');
  const one = await service.complete(r.id, 'customer-1', 'spt_token');
  const two = await service.complete(r.id, 'customer-1', 'spt_token');
  assert.equal(charges, 1);
  assert.deepEqual(one.receipt, two.receipt);
  assert.equal(one.receipt?.amount, 3031);
  await assert.rejects(service.cancel(r.id, 'customer-1'), { code: 'cannot_cancel' });
});
test('unknown provider outcomes remain locked; never accept another token', async (t) => {
  const { service, store } = fixture(t, {
    ...noop,
    charge: async () => {
      throw new PaymentError('payment_pending', 'Timeout');
    },
  });
  const r = service.create(merchant, input, 'order-123');
  await assert.rejects(service.complete(r.id, 'customer-1', 'spt_first'));
  assert.equal(store.get(r.id).status, 'processing');
  await assert.rejects(service.complete(r.id, 'customer-1', 'spt_other'), {
    code: 'payment_pending',
  });
  await assert.rejects(service.cancel(r.id, 'customer-1'), { code: 'cannot_cancel' });
  assert.equal((await service.get(r.id, 'customer-1')).receipt, undefined);
});
test('a declined attempt can retry with a new token but not reuse a failed token', async (t) => {
  let count = 0;
  const { service } = fixture(t, {
    ...noop,
    charge: async () => {
      if (++count === 1) throw new PaymentError('payment_declined', 'Declined');
      return { id: 'pi_second', status: 'succeeded' };
    },
  });
  const r = service.create(merchant, input, 'order-123');
  await assert.rejects(service.complete(r.id, 'customer-1', 'spt_first'));
  await assert.rejects(service.complete(r.id, 'customer-1', 'spt_first'), {
    code: 'payment_declined',
  });
  assert.equal((await service.complete(r.id, 'customer-1', 'spt_second')).status, 'paid');
});
test('provider processing and 3DS are not reported as paid', async (t) => {
  const { service, store } = fixture(t, {
    ...noop,
    charge: async () => ({ id: 'pi_auth', status: 'processing', errorCode: 'requires_3ds' }),
    retrieve: async () => ({ id: 'pi_auth', status: 'processing' }),
  });
  const r = service.create(merchant, input, 'order-123');
  await assert.rejects(service.complete(r.id, 'customer-1', 'spt_auth'), { code: 'requires_3ds' });
  assert.equal(store.get(r.id).status, 'processing');
  assert.equal((await service.get(r.id, 'customer-1')).receipt, undefined);
});
test('restart recovers the request and reuses the same attempt after an ambiguous timeout', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'lucci-pay-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'pay.sqlite');
  let store = new Store(path);
  const attempts: number[] = [];
  let first = true;
  const processor: Processor = {
    ...noop,
    charge: async (request) => {
      attempts.push(request.attempt);
      if (first) {
        first = false;
        throw new PaymentError('payment_pending', 'Timeout');
      }
      return { id: 'pi_recovered', status: 'succeeded' };
    },
  };
  let service = new Payments(testConfig(), store, processor);
  const r = service.create(merchant, input, 'order-123');
  await assert.rejects(service.complete(r.id, 'customer-1', 'spt_original'));
  assert.equal(store.get(r.id).token_hash, hash('spt_original'));
  assert.ok(!JSON.stringify(store.get(r.id)).includes('spt_original'));
  store.close();
  store = new Store(path);
  t.after(() => store.close());
  service = new Payments(testConfig(), store, processor);
  assert.equal((await service.complete(r.id, 'customer-1', 'spt_original')).status, 'paid');
  assert.deepEqual(attempts, [1, 1]);
});
test('stale ambiguous attempts do not replay after provider idempotency retention', async (t) => {
  const { service, store } = fixture(t);
  const r = service.create(merchant, input, 'order-123');
  store.update(r.id, (r) => {
    r.status = 'processing';
    r.token_hash = hash('spt_old');
    r.attempt_started_at = '2000-01-01T00:00:00Z';
  });
  await assert.rejects(service.complete(r.id, 'customer-1', 'spt_old'), {
    code: 'reconciliation_required',
  });
});
test('demo cannot reach a payment processor and production cannot simulate', async (t) => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const service = new Payments(loadConfig({ PAYMENT_MODE: 'demo' }), store, {
    ...noop,
    charge: async () => {
      throw new Error('Should never call provider');
    },
  });
  const r = service.demoRequest();
  await assert.rejects(service.complete(r.id, 'demo-user', 'spt_real'), {
    code: 'checkout_unavailable',
  });
  const result = await service.simulate(r.id, 'demo-user', 'success');
  assert.equal(result.receipt?.mode, 'demo');
  assert.equal(
    requestInput.safeParse({ ...input, fulfillment: { type: 'shipping' } }).success,
    false,
  );
});

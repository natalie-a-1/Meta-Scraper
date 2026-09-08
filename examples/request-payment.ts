import { randomUUID } from 'node:crypto';
import { createPaymentRequest } from './merchant-client.js';

const request = await createPaymentRequest(
  {
    baseUrl: process.env.LUCCI_PAY_URL ?? 'http://localhost:4242',
    apiKey: process.env.LUCCI_MERCHANT_KEY ?? 'demo-merchant-key',
  },
  {
    merchant_order_reference: `order-${randomUUID()}`,
    payer_subject: process.env.LUCCI_PAYER_SUBJECT ?? 'demo-user',
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
  },
);
console.log(JSON.stringify(request, null, 2));

import { z } from 'zod';

export const minorAmount = z.number().int().min(0).max(10_000_000);
export const currencySchema = z.enum(['USD', 'CAD', 'GBP', 'EUR']);
export const lineInput = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(160),
    quantity: z.number().int().min(1).max(100),
    unit_amount: minorAmount,
    discount: minorAmount.default(0),
    tax: minorAmount.default(0),
  })
  .strict();

export const requestInput = z
  .object({
    merchant_order_reference: z.string().min(1).max(128),
    payer_subject: z.string().min(1).max(256),
    currency: currencySchema,
    line_items: z.array(lineInput).min(1).max(30),
    // This first release accepts merchant-priced pickup orders. Delivery requires
    // an address/tax/fulfillment update flow before exposing shipping to buyers.
    fulfillment: z
      .object({
        type: z.literal('pickup'),
        title: z.string().min(1).max(100),
        subtitle: z.string().min(1).max(180),
      })
      .strict(),
    expires_in_seconds: z.number().int().min(60).max(1800).default(900),
  })
  .strict();

export type RequestInput = z.infer<typeof requestInput>;
export type PaymentMode = 'demo' | 'test' | 'live';
export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'cancelled' | 'expired' | 'failed';
export interface CheckoutSession {
  id: string;
  payment_provider: {
    provider: 'stripe';
    merchant_id: string;
    supported_payment_methods: (
      { type: 'apple_pay' } | { type: 'card'; allowed_card_brands: string[] }
    )[];
  };
  payment_mode: 'test' | 'live';
  status: 'ready_for_payment' | 'completed';
  currency: z.infer<typeof currencySchema>;
  metadata: Record<string, string>;
  line_items: {
    id: string;
    item: { id: string; quantity: number };
    name: string;
    base_amount: number;
    discount: number;
    subtotal: number;
    tax: number;
    total: number;
  }[];
  totals: { type: string; display_text: string; amount: number }[];
  fulfillment_options: {
    id: string;
    type: 'pickup';
    title: string;
    subtitle: string;
    subtotal: number;
    tax: number;
    total: number;
  }[];
  fulfillment_option_id: string;
  links: { type: string; url: string }[];
}
export interface Receipt {
  id: string;
  checkout_session_id: string;
  amount: number;
  currency: string;
  paid_at: string;
  mode: PaymentMode;
  merchant_name: string;
}
export interface PaymentView {
  state_version: number;
  request_id: string;
  merchant: { name: string; domain: string };
  mode: PaymentMode;
  status: PaymentStatus;
  expires_at: string;
  checkout_enabled: boolean;
  session: CheckoutSession;
  receipt?: Receipt;
}
export const paymentDataSchema = z
  .object({
    token: z
      .string()
      .regex(/^spt_[A-Za-z0-9_]+$/)
      .max(500),
    provider: z.literal('stripe').optional(),
  })
  .strict();
export const buyerSchema = z
  .object({
    first_name: z.string().max(100).optional(),
    last_name: z.string().max(100).optional(),
    email: z.string().email().max(254).optional(),
  })
  .strict();

export function totalAmount(session: CheckoutSession): number {
  const total = session.totals.find((t) => t.type === 'total');
  if (!total || !Number.isSafeInteger(total.amount) || total.amount < 1)
    throw new Error('Invalid checkout total');
  return total.amount;
}
export function money(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
}

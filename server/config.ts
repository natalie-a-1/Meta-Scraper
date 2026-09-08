import { readFileSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { PaymentMode } from '../shared/contracts.js';
import { PaymentError } from './errors.js';

const https = z
  .string()
  .url()
  .refine((v) => new URL(v).protocol === 'https:', 'HTTPS required');
export const merchantSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]{1,64}$/),
    name: z.string().min(1).max(80),
    domain: z.string().regex(/^[a-z0-9.-]+$/),
    api_key_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    provider_merchant_id: z.string().min(1).max(160),
    stripe_account: z
      .string()
      .regex(/^acct_[A-Za-z0-9]+$/)
      .optional(),
    category: z.literal('physical_goods'),
    terms_url: https,
    privacy_url: https,
    refund_url: https,
    support_url: https,
  })
  .strict();
export type Merchant = z.infer<typeof merchantSchema>;
export interface Config {
  mode: PaymentMode;
  port: number;
  baseUrl: string;
  databasePath: string;
  checkoutEnabled: boolean;
  merchants: Merchant[];
  stripeKey?: string;
  issuer?: string;
  jwksUrl?: string;
  audience?: string;
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const demoMerchant: Merchant = {
  id: 'studio-demo',
  name: 'Studio Supply',
  domain: 'studio.example',
  api_key_sha256: hash('demo-merchant-key'),
  provider_merchant_id: 'demo-only',
  category: 'physical_goods',
  terms_url: 'https://studio.example/terms',
  privacy_url: 'https://studio.example/privacy',
  refund_url: 'https://studio.example/refunds',
  support_url: 'https://studio.example/support',
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = z.enum(['demo', 'test', 'live']).parse(env.PAYMENT_MODE ?? 'demo');
  const baseUrl = z
    .string()
    .url()
    .parse(env.PUBLIC_BASE_URL ?? 'http://localhost:4242')
    .replace(/\/$/, '');
  const config: Config = {
    mode,
    baseUrl,
    port: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .parse(env.PORT ?? 4242),
    databasePath: env.DATABASE_PATH ?? './data/lucci-pay.sqlite',
    checkoutEnabled: mode !== 'demo' && env.CHATGPT_CHECKOUT_ENABLED === 'true',
    merchants:
      mode === 'demo'
        ? [demoMerchant]
        : z
            .array(merchantSchema)
            .min(1)
            .parse(
              JSON.parse(readFileSync(env.MERCHANTS_FILE ?? './config/merchants.json', 'utf8')),
            ),
  };
  if (
    new Set(config.merchants.map((m) => m.id)).size !== config.merchants.length ||
    new Set(config.merchants.map((m) => m.api_key_sha256)).size !== config.merchants.length
  )
    throw new Error('Merchant IDs and API keys must be unique');
  if (mode !== 'demo') {
    https.parse(baseUrl);
    config.issuer = https.parse(env.AUTH_ISSUER);
    config.jwksUrl = https.parse(env.AUTH_JWKS_URL);
    config.audience = https.parse(env.AUTH_AUDIENCE);
    if (config.audience !== `${baseUrl}/mcp`)
      throw new Error('AUTH_AUDIENCE must equal PUBLIC_BASE_URL/mcp');
    const prefix = mode === 'test' ? 'sk_test_' : 'sk_live_';
    if (!env.STRIPE_SECRET_KEY?.startsWith(prefix))
      throw new Error(`A ${mode} Stripe key is required`);
    config.stripeKey = env.STRIPE_SECRET_KEY;
    if (mode === 'live' && (!config.checkoutEnabled || env.LIVE_PAYMENTS_APPROVED !== 'true')) {
      throw new Error(
        'Live mode requires approved native checkout access and LIVE_PAYMENTS_APPROVED=true',
      );
    }
    if (
      config.merchants.some(
        (m) =>
          m.provider_merchant_id === 'demo-only' ||
          m.domain.endsWith('.example') ||
          m.api_key_sha256 === demoMerchant.api_key_sha256,
      )
    )
      throw new Error('Replace all demo merchant settings before native checkout');
  }
  return config;
}

export function authenticateMerchant(header: string | undefined, config: Config): Merchant {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || (config.mode !== 'demo' && token.length < 32))
    throw new PaymentError('unauthorized', 'Invalid merchant credentials.', 401);
  const digest = Buffer.from(hash(token));
  const merchant = config.merchants.find((m) =>
    timingSafeEqual(digest, Buffer.from(m.api_key_sha256)),
  );
  if (!merchant) throw new PaymentError('unauthorized', 'Invalid merchant credentials.', 401);
  return merchant;
}

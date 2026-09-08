import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ZodError, z } from 'zod';
import { authenticateMerchant, type Config } from './config.js';
import { createAuthenticator, type Authenticate } from './auth.js';
import { createMcpServer } from './mcp.js';
import type { Payments } from './payments.js';
import { safeError } from './errors.js';

export function createApp(
  config: Config,
  payments: Payments,
  widget: string,
  authenticate: Authenticate = createAuthenticator(config),
) {
  const app = express();
  app.disable('x-powered-by');
  const host = new URL(config.baseUrl).host;
  app.use((req, res, next) => {
    const allowedHosts = new Set([
      host,
      ...(config.mode === 'demo' ? [`localhost:${config.port}`, `127.0.0.1:${config.port}`] : []),
    ]);
    if (!allowedHosts.has(req.get('host') ?? '')) {
      res.status(403).json({ error: { code: 'invalid_host' } });
      return;
    }
    const origin = req.get('origin');
    if (
      origin &&
      ![config.baseUrl, 'https://chatgpt.com', 'https://chat.openai.com'].includes(origin)
    ) {
      res.status(403).json({ error: { code: 'invalid_origin' } });
      return;
    }
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });
  app.use(
    rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, mode: config.mode, native_checkout_enabled: config.checkoutEnabled });
  });
  app.get(
    ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'],
    (_req, res) => {
      if (config.mode === 'demo') {
        res.status(404).end();
        return;
      }
      res.json({
        resource: config.audience,
        authorization_servers: [config.issuer],
        scopes_supported: ['payments:read', 'payments:pay'],
        bearer_methods_supported: ['header'],
      });
    },
  );
  app.use(express.json({ limit: '48kb', strict: true }));
  app.post('/v1/payment-requests', async (req, res) => {
    const merchant = authenticateMerchant(req.get('authorization'), config);
    const request = payments.create(merchant, req.body, req.get('idempotency-key') ?? '');
    res.status(201).json({
      request_id: request.id,
      mode: request.mode,
      status: request.status,
      expires_at: request.expires_at,
      handoff: { tool: 'show_payment_request', arguments: { request_id: request.id } },
    });
  });
  app.get('/v1/payment-requests/:id', async (req, res) => {
    const merchant = authenticateMerchant(req.get('authorization'), config);
    res.json(await payments.merchantStatus(req.params.id, merchant));
  });
  app.all('/mcp', async (req, res) => {
    let identity;
    try {
      identity = await authenticate(req.get('authorization'));
    } catch (error) {
      const e = safeError(error);
      res.set(
        'WWW-Authenticate',
        `Bearer resource_metadata="${config.baseUrl}/.well-known/oauth-protected-resource", scope="payments:read payments:pay"`,
      );
      res.status(e.status).json({ error: { code: e.code, message: e.message } });
      return;
    }
    const server = createMcpServer(payments, identity, widget);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close().catch(() => {});
      void server.close().catch(() => {});
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  if (config.mode === 'demo') {
    app.get(['/', '/preview'], (_req, res) => {
      res.set(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
      );
      res.type('html').send(widget);
    });
    app.post('/api/demo', async (_req, res) => {
      res.json({ payment: await payments.get(payments.demoRequest().id, 'demo-user') });
    });
    app.get('/api/demo/:id', async (req, res) => {
      res.json({ payment: await payments.get(req.params.id, 'demo-user') });
    });
    app.post('/api/demo/:id/simulate', async (req, res) => {
      const { outcome } = z
        .object({ outcome: z.enum(['success', 'declined']) })
        .strict()
        .parse(req.body);
      res.json({ payment: await payments.simulate(req.params.id, 'demo-user', outcome) });
    });
    app.post('/api/demo/:id/cancel', async (req, res) => {
      res.json({ payment: await payments.cancel(req.params.id, 'demo-user') });
    });
  }
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (res.headersSent) return;
      const e = safeError(error);
      const malformed = error instanceof SyntaxError || error instanceof ZodError;
      if (
        error &&
        typeof error === 'object' &&
        'type' in error &&
        error.type === 'entity.too.large'
      ) {
        res
          .status(413)
          .json({ error: { code: 'request_too_large', message: 'The request is too large.' } });
        return;
      }
      res.status(malformed ? 400 : e.status).json({
        error: {
          code: malformed ? 'invalid_request' : e.code,
          message: malformed ? 'Check the request fields and try again.' : e.message,
        },
      });
    },
  );
  return app;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { Store } from '../server/store.js';
import { Payments } from '../server/payments.js';
import { DemoProcessor } from '../server/processor.js';
import { loadConfig } from '../server/config.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../server/mcp.js';
import { demoMerchant } from '../server/config.js';

test('native completion tool validates the token envelope, scope and completed output schema', async (t) => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const config = loadConfig({ PAYMENT_MODE: 'demo' });
  config.mode = 'test';
  config.checkoutEnabled = true;
  const payments = new Payments(config, store, {
    charge: async () => ({ id: 'pi_contract', status: 'succeeded' }),
    retrieve: async () => ({ id: 'pi_contract', status: 'succeeded' }),
  });
  const request = payments.create(
    demoMerchant,
    {
      merchant_order_reference: 'native-order',
      payer_subject: 'payer',
      currency: 'USD',
      line_items: [{ id: 'cup', name: 'Cup', quantity: 1, unit_amount: 2400 }],
      fulfillment: { type: 'pickup', title: 'Pickup', subtitle: 'Ready now' },
    },
    'native-order',
  );
  async function connect(scopes: string[]) {
    const server = createMcpServer(
      payments,
      { subject: 'payer', scopes: new Set(scopes) },
      '<html>Widget</html>',
    );
    const client = new Client({ name: 'native-contract', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    t.after(() => client.close());
    t.after(() => server.close());
    return client;
  }
  const reader = await connect(['payments:read']);
  const denied = await reader.callTool({
    name: 'complete_checkout',
    arguments: { checkout_session_id: request.id, payment_data: { token: 'spt_fixture' } },
  });
  assert.equal(denied.isError, true);
  const client = await connect(['payments:read', 'payments:pay']);
  const tools = (await client.listTools()).tools;
  assert.ok(!tools.some((t) => t.name === 'simulate_payment'));
  const tool = tools.find((t) => t.name === 'complete_checkout')!;
  assert.ok(tool.outputSchema);
  assert.deepEqual((tool._meta?.ui as { visibility: string[] }).visibility, ['app']);
  const invalid = await client.callTool({
    name: 'complete_checkout',
    arguments: {
      checkout_session_id: request.id,
      payment_data: { token: 'spt_fixture', card_number: '4242424242424242' },
    },
  });
  assert.equal(invalid.isError, true);
  const result = await client.callTool({
    name: 'complete_checkout',
    arguments: {
      checkout_session_id: request.id,
      buyer: { email: 'test@example.com' },
      payment_data: { token: 'spt_fixture', provider: 'stripe' },
    },
  });
  assert.equal(result.isError, undefined);
  assert.equal((result.structuredContent as { status: string }).status, 'completed');
  assert.ok(!JSON.stringify(result).includes('spt_fixture'));
  assert.ok(!JSON.stringify(result).includes('test@example.com'));
});

test('HTTP server and MCP client complete the request, simulation and receipt workflow', async (t) => {
  const config = loadConfig({ PAYMENT_MODE: 'demo' });
  const store = new Store(':memory:');
  const payments = new Payments(config, store, new DemoProcessor());
  const server = createApp(config, payments, '<html><body>Widget</body></html>').listen(
    0,
    '127.0.0.1',
  );
  await new Promise<void>((resolve) => server.on('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  config.port = address.port;
  config.baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(() => {
    server.close();
    store.close();
  });
  const health = await fetch(`${config.baseUrl}/healthz`);
  assert.equal(health.status, 200);
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${config.baseUrl}/mcp`));
  await client.connect(transport);
  t.after(() => client.close());
  const tools = (await client.listTools()).tools;
  assert.ok(tools.some((t) => t.name === 'show_payment_request'));
  assert.ok(!tools.some((t) => t.name === 'complete_checkout'));
  const simulate = tools.find((t) => t.name === 'simulate_payment')!;
  assert.deepEqual((simulate._meta?.ui as { visibility: string[] }).visibility, ['app']);
  const resource = await client.readResource({ uri: 'ui://lucci-pay/payment-v1.html' });
  assert.equal(resource.contents[0]?.mimeType, 'text/html;profile=mcp-app');
  const demo = await client.callTool({ name: 'create_demo_payment_request', arguments: {} });
  const id = (demo.structuredContent as { payment: { request_id: string } }).payment.request_id;
  assert.equal(
    (await client.callTool({ name: 'show_payment_request', arguments: { request_id: id } }))
      .isError,
    undefined,
  );
  const result = await client.callTool({
    name: 'simulate_payment',
    arguments: { request_id: id, outcome: 'success' },
  });
  const view = (
    result.structuredContent as { payment: { status: string; receipt: { mode: string } } }
  ).payment;
  assert.equal(view.status, 'paid');
  assert.equal(view.receipt.mode, 'demo');
  const foreignOrigin = await fetch(`${config.baseUrl}/healthz`, {
    headers: { Origin: 'https://attacker.example' },
  });
  assert.equal(foreignOrigin.status, 403);
  const noKey = await fetch(`${config.baseUrl}/v1/payment-requests/${id}`);
  assert.equal(noKey.status, 401);
  const status = await fetch(`${config.baseUrl}/v1/payment-requests/${id}`, {
    headers: { Authorization: 'Bearer demo-merchant-key' },
  });
  assert.equal(((await status.json()) as { status: string }).status, 'paid');
});

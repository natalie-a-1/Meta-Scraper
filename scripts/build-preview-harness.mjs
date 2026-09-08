// Offline browser fixture for visual and interaction checks. The shipped widget
// never includes this transport. Server/MCP integration is tested separately.
import { readFile, writeFile } from 'node:fs/promises';
import { loadConfig } from '../dist/server/config.js';
import { Store } from '../dist/server/store.js';
import { Payments } from '../dist/server/payments.js';
import { DemoProcessor } from '../dist/server/processor.js';
const store = new Store(':memory:');
const service = new Payments(loadConfig({ PAYMENT_MODE: 'demo' }), store, new DemoProcessor());
const request = service.demoRequest();
const fixture = await service.get(request.id, 'demo-user');
store.close();
const html = await readFile('dist/widget/payment.html', 'utf8');
const transport = `<script>
const fixture = ${JSON.stringify(fixture).replaceAll('<', '\\u003c')};
let current = structuredClone(fixture);
window.fetch = async (url, options) => {
  if (url === '/api/demo') current = structuredClone(fixture);
  else if (String(url).endsWith('/cancel')) current.status = 'cancelled';
  else if (String(url).endsWith('/simulate')) {
    const success = JSON.parse(options.body).outcome === 'success';
    current.status = success ? 'paid' : 'failed';
    if (success) current.receipt = { id: 'receipt_preview', checkout_session_id: current.request_id, amount: 2598, currency: 'USD', paid_at: new Date().toISOString(), mode: 'demo', merchant_name: current.merchant.name };
  }
  return new Response(JSON.stringify({payment: current}), {headers:{'Content-Type':'application/json'}});
};
</script>`;
await writeFile('dist/preview-harness.html', html.replace('<body>', `<body>${transport}`));
console.log('Built dist/preview-harness.html (offline demo fixture).');

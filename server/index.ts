import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { Store } from './store.js';
import { DemoProcessor, StripeProcessor } from './processor.js';
import { Payments } from './payments.js';
import { createApp } from './app.js';

const config = loadConfig();
const store = new Store(config.databasePath);
const payments = new Payments(
  config,
  store,
  config.mode === 'demo' ? new DemoProcessor() : new StripeProcessor(config),
);
const widget = readFileSync(resolve('dist/widget/payment.html'), 'utf8');
const app = createApp(config, payments, widget);
const listener = app.listen(config.port, config.mode === 'demo' ? '127.0.0.1' : '0.0.0.0', () => {
  console.log(`Lucci Pay · ${config.mode} · ${config.baseUrl}/mcp`);
  if (config.mode === 'demo') console.log(`Preview: ${config.baseUrl}/preview · No money moves.`);
});
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    listener.close(() => {
      store.close();
      process.exit(0);
    });
  });

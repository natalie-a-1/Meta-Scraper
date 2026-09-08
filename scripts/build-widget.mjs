import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
const result = await build({
  entryPoints: ['web/index.tsx'],
  bundle: true,
  write: false,
  outdir: 'dist/widget',
  minify: true,
  format: 'iife',
  target: 'es2022',
  define: { 'process.env.NODE_ENV': '"production"' },
});
const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
await mkdir('dist/widget', { recursive: true });
await writeFile(
  'dist/widget/payment.html',
  `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Lucci Pay</title><style>${css}</style></head>
<body><div id="root"></div><script>${js.replaceAll('</script', '<\\/script')}</script></body></html>`,
);
console.log('Built self-contained payment widget.');

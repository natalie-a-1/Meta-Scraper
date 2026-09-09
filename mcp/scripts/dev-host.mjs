// Local verification host using the official MCP Apps bridge. Never enabled by
// the production entry point; it exposes no additional photo APIs.
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { PhotoStore } from "../src/store.mjs";
import { createHttpApp } from "../src/http.mjs";
import { fileURLToPath } from "node:url";

const store = await new PhotoStore().init();
const html = await readFile(
  new URL("../dist/photo.html", import.meta.url),
  "utf8",
);
const port = Number(process.env.PORT || 3101);
const baseUrl = `http://127.0.0.1:${port}`;
const hostJs = await build({
  stdin: {
    contents: String.raw`
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
const client = new Client({ name: 'local-verification-host', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', location.href)));
const resource = await client.readResource({ uri: 'ui://meta-scraper/photo-v3.html' });
const result = await client.callTool({ name: 'open_photo', arguments: {} });
const frame = document.querySelector('iframe');
const bridge = new AppBridge(client, { name: 'local-verification-host', version: '1.0.0' },
  { serverTools: {}, openLinks: {}, updateModelContext: {} });
bridge.onopenlink = async ({ url }) => {
  const link = document.createElement('a'); link.href = url; link.download = ''; link.click(); return {};
};
bridge.onupdatemodelcontext = async () => { document.querySelector('#context').textContent = 'Photo context shared with host'; return {}; };
bridge.onsizechange = ({ height }) => { if (!frame.classList.contains('expanded')) frame.style.height = height + 'px'; };
bridge.onrequestdisplaymode = async ({ mode }) => {
  frame.classList.toggle('expanded', mode === 'fullscreen');
  bridge.setHostContext({ displayMode: mode });
  return { mode };
};
bridge.oninitialized = async () => {
  bridge.setHostContext({ theme: 'light', availableDisplayModes: ['inline', 'fullscreen'], displayMode: 'inline' });
  document.querySelector('#status').textContent = 'MCP Apps bridge connected';
  await bridge.sendToolInput({ arguments: {} }); await bridge.sendToolResult(result);
};
await bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
const csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; connect-src \'none\'; img-src blob:">';
frame.srcdoc = resource.contents[0].text.replace('<head>', '<head>' + csp);
document.querySelector('#theme').onclick = () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  bridge.setHostContext({ theme });
};
`,
    resolveDir: fileURLToPath(new URL("../", import.meta.url)),
    sourcefile: "verification-host.mjs",
  },
  bundle: true,
  minify: true,
  format: "esm",
  write: false,
  target: "es2022",
});
const app = createHttpApp({ store, html, getBaseUrl: () => baseUrl });
app.get("/host", (_req, res) =>
  res.type("html").send(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Photo details · Component preview</title><style>
:root{font:13px system-ui;color:#686868;background:#fafafa;color-scheme:light}*{box-sizing:border-box}body{margin:0;padding:32px 20px}.preview-bar{max-width:600px;margin:0 auto 24px;display:flex;justify-content:space-between;align-items:center;gap:16px}.preview-bar p{margin:4px 0;font-size:11px}button{font:inherit;color:inherit;border:1px solid #ddd;background:transparent;padding:8px 12px;border-radius:99px;cursor:pointer}iframe{display:block;border:1px solid #e4e4e4;border-radius:22px;margin:0 auto;width:100%;max-width:600px;height:420px;background:white}.expanded{position:fixed;inset:16px;z-index:5;width:calc(100% - 32px);height:calc(100% - 32px)!important;max-width:none}details{max-width:600px;margin:20px auto;font-size:11px}summary{cursor:pointer}[data-theme=dark]{color:#b4b4b4;background:#171717;color-scheme:dark}[data-theme=dark] iframe{background:#212121;border-color:#414141}[data-theme=dark] button{border-color:#414141}@media(max-width:480px){body{padding:20px 12px}.preview-bar{margin-bottom:16px}}
</style></head><body><div class="preview-bar"><div>Component preview<p>Local MCP host · not an authenticated ChatGPT session</p></div><button id="theme">Switch theme</button></div><iframe title="Meta-Scraper" sandbox="allow-scripts"></iframe><details><summary>Connection details</summary><p id="status">Connecting to MCP…</p><p id="context"></p></details><script type="module">${hostJs.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
  ),
);
const listener = app.listen(port, "127.0.0.1", () =>
  console.error(`Verification host: ${baseUrl}/host`),
);
async function close() {
  listener.close();
  await store.close();
}
process.once("SIGINT", close);
process.once("SIGTERM", close);

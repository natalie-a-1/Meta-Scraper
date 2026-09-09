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
const resource = await client.readResource({ uri: 'ui://meta-scraper/photo-v2.html' });
const result = await client.callTool({ name: 'open_photo', arguments: {} });
const frame = document.querySelector('iframe');
const bridge = new AppBridge(client, { name: 'local-verification-host', version: '1.0.0' },
  { serverTools: {}, openLinks: {}, updateModelContext: {} });
bridge.onopenlink = async ({ url }) => {
  const link = document.createElement('a'); link.href = url; link.download = ''; link.click(); return {};
};
bridge.onupdatemodelcontext = async () => { document.querySelector('#context').textContent = 'Photo context shared with host'; return {}; };
bridge.onsizechange = ({ height }) => { frame.style.height = height + 'px'; };
bridge.oninitialized = async () => {
  document.querySelector('#status').textContent = 'MCP Apps bridge connected';
  await bridge.sendToolInput({ arguments: {} }); await bridge.sendToolResult(result);
};
await bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
const csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; connect-src \'none\'; img-src \'none\'">';
frame.srcdoc = resource.contents[0].text.replace('<head>', '<head>' + csp);
document.querySelector('#theme').onclick = () => bridge.setHostContext({ theme: 'dark' });
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
  res
    .type("html")
    .send(
      `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>MCP Apps verification host</title></head><body style="margin:20px;background:#eef1ee;font-family:system-ui"><p id="status">Connecting to MCP…</p><p id="context"></p><button id="theme">Host dark theme</button><iframe title="Meta-Scraper" sandbox="allow-scripts" style="display:block;border:0;margin:20px auto;width:100%;max-width:720px;height:800px"></iframe><script type="module">${hostJs.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
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

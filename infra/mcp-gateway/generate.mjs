import { readFile, writeFile } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const registry = JSON.parse(await readFile(new URL("registry.json", root), "utf8"));
for (const environment of Object.keys(registry.environments)) {
  const rewrites = [];
  for (const [slug, product] of Object.entries(registry.products)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Invalid product slug");
    const deployment = product[environment];
    if (!deployment) continue;
    const origin = new URL(deployment.origin);
    if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password)
      throw new Error("Each upstream must be an explicit HTTPS origin");
    if (Object.values(registry.environments).some(({ host }) => host === origin.host))
      throw new Error("Gateway destinations cannot point back to a gateway");
    if (!/^\/[a-z0-9/-]+$/.test(product.upstreamMcpPath)) throw new Error("Invalid MCP route");
    rewrites.push(
      { source: `/${slug}`, destination: `${origin.origin}${product.upstreamMcpPath}` },
      { source: `/${slug}/:path*`, destination: `${origin.origin}/:path*` },
    );
  }
  const config = {
    $schema: "https://openapi.vercel.sh/vercel.json",
    framework: null,
    outputDirectory: "public",
    headers: [{ source: "/(.*)", headers: [
      { key: "Cache-Control", value: "no-store" },
      { key: "x-vercel-enable-rewrite-caching", value: "0" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ] }],
    rewrites,
  };
  await writeFile(new URL(`${environment}/vercel.json`, root), `${JSON.stringify(config, null, 2)}\n`);
}

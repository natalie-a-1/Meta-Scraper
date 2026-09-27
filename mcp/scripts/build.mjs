import { build } from "esbuild";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const result = await build({
  entryPoints: [fileURLToPath(new URL("web/photo.mjs", root))],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2022",
  write: false,
  legalComments: "inline",
});
const css = await readFile(new URL("web/photo.css", root), "utf8");
const template = await readFile(new URL("web/photo.html", root), "utf8");
const html = template
  .replace("/*__STYLE__*/", () => css)
  .replace("/*__SCRIPT__*/", () =>
    result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script"),
  );
await mkdir(new URL("dist/", root), { recursive: true });
await writeFile(new URL("dist/photo.html", root), html);
console.log("Built the self-contained photo panel.");

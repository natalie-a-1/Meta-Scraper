import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

const text = readFileSync(new URL("../skills/photo-metadata/SKILL.md", import.meta.url), "utf8");
const [, header, body] = /^---\n([\s\S]+?)\n---\n([\s\S]*)$/.exec(text);
// This maintained skill has two plain-string frontmatter entries, no YAML objects.
const frontmatter = Object.fromEntries(header.split("\n").map((line) => {
  const colon = line.indexOf(":");
  return [line.slice(0, colon), line.slice(colon + 1).trim()];
}));
export const photoWorkflow = body.trim();
const uri = "skill://metascraper/photo-metadata/SKILL.md";
const skill = {
  uri,
  frontmatter,
  resources: [{ uri, digest: `sha256:${createHash("sha256").update(text).digest("hex")}` }],
};

export function registerPhotoSkill(server) {
  server.registerResource("Photo metadata workflow", uri, { mimeType: "text/markdown" }, async () => ({
    contents: [{ uri, mimeType: "text/markdown", text }],
  }));
  server.server.setRequestHandler(z.object({ method: z.literal("skills/list"), params: z.object({ cursor: z.string().optional() }).optional() }), async ({ params }) => {
    if (params?.cursor) throw new McpError(ErrorCode.InvalidParams, "Unknown skill cursor.");
    return { skills: [skill] };
  });
  server.server.setRequestHandler(z.object({ method: z.literal("skills/get"), params: z.object({ uri: z.string() }) }), async ({ params }) => {
    if (params.uri !== uri) throw new McpError(ErrorCode.InvalidParams, "Unknown skill.");
    return { skill };
  });
}

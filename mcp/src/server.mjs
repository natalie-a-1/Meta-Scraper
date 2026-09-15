import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { toolDefinitions, invokeTool, UI_URI } from "./tools.mjs";
import { photoWorkflow, registerPhotoSkill } from "./skill.mjs";

export function createMcpServer(store, baseUrl, html) {
  const server = new McpServer(
    { name: "meta-scraper", version: "0.1.0" },
    {
      capabilities: { extensions: { "io.modelcontextprotocol/skills": {} } },
      instructions: photoWorkflow,
    },
  );
  for (const { name, run: _run, ...definition } of toolDefinitions(
    store,
    baseUrl,
  )) {
    server.registerTool(name, definition, (args) =>
      invokeTool({ name, ...definition, run: _run }, args),
    );
  }
  registerAppResource(
    server,
    "Photo metadata panel",
    UI_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [
        {
          uri: UI_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: {
            ui: {
              prefersBorder: true,
              csp: { connectDomains: [], resourceDomains: [] },
            },
            "openai/widgetDescription":
              "A compact result for the photo supplied in ChatGPT: actual recorded details focused on the user's question, or a verified cleaned copy with a save action. The original is unchanged. Avoid repeating the card contents in chat.",
          },
        },
      ],
    }),
  );
  registerPhotoSkill(server);
  return server;
}

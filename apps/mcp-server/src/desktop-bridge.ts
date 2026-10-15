// Claude Desktop bridge (§13, "verify the same server in Claude Desktop").
//
// The Recollect server needs a bearer token on every request. Claude Desktop launches this file as
// a local stdio MCP server; it forwards every request to the real Recollect server over Streamable
// HTTP with the token added. Real MCP on both ends: nothing is answered here, only passed through.
//
//   MCP_SERVER_URL=http://localhost:8787/mcp  RECOLLECT_TOKEN=<elder or family token>
//   tsx apps/mcp-server/src/desktop-bridge.ts
//
// stdout is the MCP channel, so this file never logs to it; errors go to stderr.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema, ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const url = new URL(process.env.MCP_SERVER_URL ?? "http://localhost:8787/mcp");
const token = process.env.RECOLLECT_TOKEN;
if (!token) {
  console.error("Set RECOLLECT_TOKEN to the elder or family token of the Recollect server.");
  process.exit(1);
}

const upstream = new Client({ name: "recollect-desktop-bridge", version: "0.1.0" });
await upstream.connect(new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { authorization: `Bearer ${token}` } },
}));
const caps = upstream.getServerCapabilities() ?? {};

const server = new Server(
  { name: "recollect", version: "0.1.0" },
  { capabilities: { tools: {}, ...(caps.resources ? { resources: {} } : {}) }, instructions: upstream.getInstructions() },
);
server.setRequestHandler(ListToolsRequestSchema, (req) => upstream.listTools(req.params));
server.setRequestHandler(CallToolRequestSchema, (req) => upstream.callTool(req.params));
if (caps.resources) {
  server.setRequestHandler(ListResourcesRequestSchema, (req) => upstream.listResources(req.params));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, (req) => upstream.listResourceTemplates(req.params));
  server.setRequestHandler(ReadResourceRequestSchema, (req) => upstream.readResource(req.params));
}
await server.connect(new StdioServerTransport());
console.error(`Recollect bridge: stdio ↔ ${url.href}`);

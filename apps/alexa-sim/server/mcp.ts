import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// One real MCP client per role (§1.8). The browser never sees the bearer tokens.

export type Role = "elder" | "family";

export const MCP_URL = process.env.MCP_SERVER_URL ?? "http://localhost:8787/mcp";
export const MCP_ORIGIN = new URL(MCP_URL).origin;

export function tokenFor(role: Role): string {
  const t = role === "elder" ? process.env.ELDER_TOKEN : process.env.FAMILY_TOKEN;
  if (!t) throw new Error(`${role === "elder" ? "ELDER_TOKEN" : "FAMILY_TOKEN"} is not set`);
  return t;
}

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  resourceUri: string | null;
}

interface Conn { client: Client; tools: ToolInfo[]; protocol: string | undefined }

const conns = new Map<Role, Promise<Conn>>();

async function open(role: Role): Promise<Conn> {
  const client = new Client({ name: "recollect-alexa-sim", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { authorization: `Bearer ${tokenFor(role)}` } },
  });
  await client.connect(transport);
  const { tools } = await client.listTools();
  const conn: Conn = {
    client,
    protocol: transport.protocolVersion,
    tools: tools.map((t) => ({
      name: t.name,
      ...(t.description ? { description: t.description } : {}),
      inputSchema: t.inputSchema as Record<string, unknown>,
      resourceUri: (t._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri ?? null,
    })),
  };
  console.log(JSON.stringify({ msg: "mcp connected", role, protocol: conn.protocol, tools: conn.tools.map((t) => t.name) }));
  return conn;
}

export function conn(role: Role): Promise<Conn> {
  let c = conns.get(role);
  if (!c) {
    c = open(role);
    c.catch(() => conns.delete(role));
    conns.set(role, c);
  }
  return c;
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  ms: number; // simulator → MCP server round trip
  serverMs: number | null; // _meta["recollect/latencyMs"]
  ok: boolean;
  say: string | null;
  structuredContent: Record<string, unknown> | null;
  resourceUri: string | null;
  result: unknown;
}

export async function callTool(role: Role, name: string, args: Record<string, unknown>): Promise<ToolCallRecord> {
  const c = await conn(role);
  const t0 = performance.now();
  let result: { isError?: boolean; structuredContent?: Record<string, unknown>; _meta?: Record<string, unknown> };
  try {
    result = (await c.client.callTool({ name, arguments: args })) as typeof result;
  } catch (e) {
    conns.delete(role); // reconnect on the next call
    throw e;
  }
  const ms = Math.round((performance.now() - t0) * 10) / 10;
  const sc = result.structuredContent ?? null;
  const serverMs = result._meta?.["recollect/latencyMs"];
  return {
    name, args, ms,
    serverMs: typeof serverMs === "number" ? serverMs : null,
    ok: !result.isError,
    say: typeof sc?.say === "string" && sc.say ? sc.say : null,
    structuredContent: sc,
    resourceUri: c.tools.find((t) => t.name === name)?.resourceUri ?? null,
    result,
  };
}

export async function readResource(role: Role, uri: string): Promise<{ html: string; mimeType: string | undefined }> {
  const c = await conn(role);
  const r = await c.client.readResource({ uri });
  const first = r.contents[0] as { text?: string; mimeType?: string } | undefined;
  if (!first?.text) throw new Error(`resource ${uri} has no text`);
  return { html: first.text, mimeType: first.mimeType };
}

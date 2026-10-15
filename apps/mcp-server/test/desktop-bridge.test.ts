// The Claude Desktop bridge, launched the way Claude Desktop launches it: a stdio child process,
// driven by a real MCP client, forwarding to a real Recollect server with the bearer token added.
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { DemoClock, HashEmbedder, LexicalReranker, MemoryGraph, phrases, seed } from "@recollect/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type App } from "../src/app.ts";

const tokens = { elder: "bridge-elder", family: "bridge-family" };
const bridge = fileURLToPath(new URL("../src/desktop-bridge.ts", import.meta.url));
const tsx = fileURLToPath(new URL("../../../node_modules/tsx/dist/cli.mjs", import.meta.url));
let app: App, url: string;

beforeAll(async () => {
  const clock = new DemoClock();
  clock.set(new Date("2026-10-13T09:00:00+05:30"));
  const ctx = await seed(new MemoryGraph(), clock, new HashEmbedder(), new LexicalReranker());
  app = createApp({ ctx, tokens, log: () => {} });
  await new Promise<void>((r) => app.http.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(app.http.address() as AddressInfo).port}/mcp`;
});
afterAll(async () => { await new Promise((r) => app.http.close(r)); });

async function viaBridge(token: string): Promise<Client> {
  const client = new Client({ name: "claude-desktop-stand-in", version: "0.0.0" });
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: [tsx, bridge],
    env: { ...process.env, MCP_SERVER_URL: url, RECOLLECT_TOKEN: token } as Record<string, string>,
    stderr: "ignore",
  }));
  return client;
}

describe("Claude Desktop bridge", () => {
  it("lists the role's tools and passes a tool call through unchanged", async () => {
    const family = await viaBridge(tokens.family);
    try {
      const names = (await family.listTools()).tools.map((t) => t.name);
      expect(names).toContain("recall_memory");
      expect(names).not.toContain("log_dose");
      const r = await family.callTool({ name: "recall_memory", arguments: { question: "my brother Jagdish bicycle fields" } });
      const say = (r.structuredContent as { say: string }).say;
      expect(say.startsWith("Gurdev said on 17 August 2026: \"")).toBe(true);
      expect((r.content as { text: string }[])[0]?.text).toBe(say);
      expect(typeof r._meta?.["recollect/latencyMs"]).toBe("number");
    } finally { await family.close(); }
  });

  it("serves the MCP Apps card resources", async () => {
    const elder = await viaBridge(tokens.elder);
    try {
      const uris = (await elder.listResources()).resources.map((r) => r.uri);
      expect(uris).toContain("ui://recollect/story-card");
      const card = await elder.readResource({ uri: "ui://recollect/story-card" });
      expect(JSON.stringify(card.contents)).toContain("<html");
      expect((await elder.callTool({ name: "where_is", arguments: { person: "Aman" } })).structuredContent)
        .toMatchObject({ say: phrases.personStatus("Aman", "is in London and calls you on Sundays") });
    } finally { await elder.close(); }
  });
});

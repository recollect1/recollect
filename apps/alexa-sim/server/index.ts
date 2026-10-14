import { existsSync } from "node:fs";
import * as P from "@recollect/core/phrases";
import express from "express";
import { z } from "zod";
import { BedrockNotConfigured, CHAT_MODEL, resetHistory, turn } from "./converse.ts";
import { callTool, conn, MCP_ORIGIN, MCP_URL, readResource, tokenFor, type Role } from "./mcp.ts";

// Simulator backend (§13): holds AWS credentials and MCP tokens; the browser talks only to this.

const PORT = Number(process.env.SIM_PORT ?? 8788);
const app = express();
app.use(express.json({ limit: "1mb" }));

const RoleSchema = z.enum(["elder", "family"]);

const handle = (fn: (req: express.Request, res: express.Response) => Promise<unknown>) =>
  (req: express.Request, res: express.Response) => {
    fn(req, res).catch((e) => {
      if (e instanceof z.ZodError) return res.status(400).json({ error: "bad_request", issues: e.issues });
      if (e instanceof BedrockNotConfigured) return res.status(503).json({ error: "bedrock_not_configured", message: e.message });
      console.error(JSON.stringify({ msg: "sim error", path: req.path, error: String(e?.stack ?? e) }));
      res.status(502).json({ error: "upstream", message: String(e?.message ?? e) });
    });
  };

app.get("/api/status", handle(async (_req, res) => {
  const out: Record<string, unknown> = { mcpUrl: MCP_URL, chatModel: CHAT_MODEL || null };
  for (const role of ["elder", "family"] as Role[]) {
    try {
      const c = await conn(role);
      out[role] = { ok: true, protocol: c.protocol, tools: c.tools.map((t) => t.name) };
    } catch (e) {
      out[role] = { ok: false, error: String((e as Error).message) };
    }
  }
  res.json(out);
}));

app.post("/api/turn", handle(async (req, res) => {
  const body = z.object({ role: RoleSchema, text: z.string().min(1).max(2000), shortReplies: z.boolean().optional() }).parse(req.body);
  res.json(await turn(body.role, body.text, { shortReplies: body.shortReplies ?? false }));
}));

// Story mode: the verbatim transcript goes straight to remember_story — no model in between.
app.post("/api/story", handle(async (req, res) => {
  const body = z.object({ text: z.string().max(8000) }).parse(req.body);
  const text = body.text.trim();
  if (!text) return res.json({ reply: P.didNotCatchStory(), source: "say", calls: [], card: null });
  const rec = await callTool("elder", "remember_story", { text });
  res.json({ reply: rec.say ?? P.storySaved(), source: "say", calls: [rec], card: null });
}));

// Called by MCP Apps cards through AppBridge.oncalltool.
app.post("/api/tool", handle(async (req, res) => {
  const body = z.object({ role: RoleSchema, name: z.string(), args: z.record(z.unknown()).default({}) }).parse(req.body);
  res.json(await callTool(body.role, body.name, body.args));
}));

// Direct tool call shaped like a turn: debug panel (?debug) and the home panel. Real MCP, no model.
app.post("/api/direct", handle(async (req, res) => {
  const body = z.object({ role: RoleSchema, name: z.string(), args: z.record(z.unknown()).default({}) }).parse(req.body);
  const rec = await callTool(body.role, body.name, body.args);
  res.json({
    reply: rec.say ?? "", source: "say", calls: [rec],
    card: rec.resourceUri && rec.structuredContent
      ? { toolName: rec.name, resourceUri: rec.resourceUri, args: rec.args, result: rec.result } : null,
  });
}));

app.get("/api/resource", handle(async (req, res) => {
  const q = z.object({ role: RoleSchema, uri: z.string().startsWith("ui://") }).parse(req.query);
  res.json(await readResource(q.role, q.uri));
}));

app.post("/api/reset", handle(async (req, res) => {
  resetHistory(RoleSchema.optional().parse(req.body?.role));
  res.json({ ok: true });
}));

// Demo clock (scenarios I and K): proxied to the MCP server's /demo/clock with the family token.
app.post("/api/clock", handle(async (req, res) => {
  const body = z.object({ at: z.string().regex(/^\d{1,2}:\d{2}$/).optional() }).parse(req.body ?? {});
  const r = await fetch(`${MCP_ORIGIN}/demo/clock`, {
    method: "POST",
    headers: { authorization: `Bearer ${tokenFor("family")}`, "content-type": "application/json" },
    body: JSON.stringify(body.at ? { at: body.at } : {}),
  });
  if (r.status === 404) return res.status(409).json({ error: "demo_clock_off", message: "Start the MCP server with DEMO_CLOCK=1." });
  res.status(r.status).json(await r.json());
}));

const dist = new URL("../dist/", import.meta.url).pathname;
if (process.env.NODE_ENV === "production" && existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(`${dist}index.html`));
}

app.listen(PORT, () => {
  console.log(JSON.stringify({ msg: "alexa-sim server ready", port: PORT, mcp: MCP_URL, chatModel: CHAT_MODEL || "(not set)" }));
});

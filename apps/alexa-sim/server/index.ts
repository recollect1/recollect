import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import * as P from "@recollect/core/phrases";
import express from "express";
import { z } from "zod";
import { BedrockNotConfigured, CHAT_MODEL, resetHistory, turn } from "./converse.ts";
import { callTool, conn, MCP_ORIGIN, MCP_URL, readResource, tokenFor, type Role } from "./mcp.ts";

// Simulator backend (§13): holds AWS credentials and MCP tokens; the browser talks only to this.

const PORT = Number(process.env.SIM_PORT ?? 8788);
const app = express();
// Story uploads can carry a consented WAV (full-voice mode): ~2 MB a minute at 16 kHz mono.
app.use(express.json({ limit: "24mb" }));
/** Shared with the markers agent, which deletes each file after measuring it (§1.6). */
const AUDIO_DIR = process.env.AUDIO_DIR ?? new URL("../../../.audio/", import.meta.url).pathname;
// Backstop for §1.6: if the worker is not running, no recording outlives this, analysed or not.
const AUDIO_TTL_MS = Number(process.env.AUDIO_TTL_MIN ?? 60) * 60_000;
setInterval(() => {
  if (!existsSync(AUDIO_DIR)) return;
  for (const f of readdirSync(AUDIO_DIR)) {
    const path = `${AUDIO_DIR}${f}`;
    try { if (Date.now() - statSync(path).mtimeMs > AUDIO_TTL_MS) unlinkSync(path); } catch { /* already gone */ }
  }
}, 60_000).unref();

const RoleSchema = z.enum(["elder", "family"]);

app.get("/healthz", (_req, res) => { res.json({ ok: true }); });

// Production (§13): this one "web" service serves the simulator and the family page, and holds the
// tokens and AWS keys. Neither page may be public, so everything sits behind a password.
const WEB_PASSWORD = process.env.WEB_PASSWORD;
if (process.env.NODE_ENV === "production" && !WEB_PASSWORD) {
  console.error("Set WEB_PASSWORD: in production the simulator and family page require a password.");
  process.exit(1);
}
if (WEB_PASSWORD) {
  app.use((req, res, next) => {
    const [user, pass] = Buffer.from((req.headers.authorization ?? "").replace(/^Basic /, ""), "base64").toString().split(":");
    if (pass === WEB_PASSWORD && user) return next();
    res.set("WWW-Authenticate", 'Basic realm="Recollect"').status(401).send("Password required");
  });
}

// The family page calls /api/family/* and /report/doctor; add the family token here (server side).
async function toMcpAsFamily(req: express.Request, res: express.Response) {
  const r = await fetch(`${MCP_ORIGIN}${req.originalUrl}`, {
    method: req.method,
    headers: { authorization: `Bearer ${tokenFor("family")}`, ...(req.method === "POST" ? { "content-type": "application/json" } : {}) },
    ...(req.method === "POST" ? { body: JSON.stringify(req.body ?? {}) } : {}),
  });
  res.status(r.status).type(r.headers.get("content-type") ?? "application/json").send(Buffer.from(await r.arrayBuffer()));
}

const handle = (fn: (req: express.Request, res: express.Response) => Promise<unknown>) =>
  (req: express.Request, res: express.Response) => {
    fn(req, res).catch((e) => {
      if (e instanceof z.ZodError) return res.status(400).json({ error: "bad_request", issues: e.issues });
      if (e instanceof BedrockNotConfigured) return res.status(503).json({ error: "bedrock_not_configured", message: e.message });
      console.error(JSON.stringify({ msg: "sim error", path: req.path, error: String(e?.stack ?? e) }));
      res.status(502).json({ error: "upstream", message: String(e?.message ?? e) });
    });
  };

app.all(/^\/api\/family\//, handle(toMcpAsFamily));
app.get("/report/doctor", handle(toMcpAsFamily));

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
  const body = z.object({ text: z.string().max(8000), audio: z.string().max(23_000_000).optional() }).parse(req.body);
  const text = body.text.trim();
  if (!text) return res.json({ reply: P.didNotCatchStory(), source: "say", calls: [], card: null });
  let audioRef: string | undefined;
  // Only when the family has full-voice consent on; otherwise the browser never records.
  if (body.audio && (await fullVoiceOn())) {
    const wav = Buffer.from(body.audio, "base64");
    if (wav.subarray(0, 4).toString("ascii") !== "RIFF") return res.status(400).json({ error: "audio must be WAV" });
    mkdirSync(AUDIO_DIR, { recursive: true });
    audioRef = `${randomUUID()}.wav`;
    writeFileSync(`${AUDIO_DIR}${audioRef}`, wav);
  }
  const rec = await callTool("elder", "remember_story", { text, ...(audioRef ? { audioRef } : {}) });
  res.json({ reply: rec.say ?? P.storySaved(), source: "say", calls: [rec], card: null });
}));

async function fullVoiceOn(): Promise<boolean> {
  const r = await fetch(`${MCP_ORIGIN}/api/family/overview`, { headers: { authorization: `Bearer ${tokenFor("family")}` } });
  if (!r.ok) return false;
  const o = (await r.json()) as { consent?: { trackingOn?: boolean; fullVoiceOn?: boolean } | null };
  return Boolean(o.consent?.trackingOn && o.consent?.fullVoiceOn);
}

app.get("/api/full-voice", handle(async (_req, res) => {
  res.json({ on: await fullVoiceOn() });
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

// Live graph panel: proxied to the MCP server's /api/graph with the elder token.
app.get("/api/graph", handle(async (_req, res) => {
  const r = await fetch(`${MCP_ORIGIN}/api/graph`, { headers: { authorization: `Bearer ${tokenFor("elder")}` } });
  res.status(r.status).json(await r.json());
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
const familyDist = new URL("../../family/dist/", import.meta.url).pathname;
if (process.env.NODE_ENV === "production") {
  if (existsSync(familyDist)) {
    app.use("/family", express.static(familyDist));
    app.get(/^\/family(\/.*)?$/, (_req, res) => res.sendFile(`${familyDist}index.html`));
  }
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(`${dist}index.html`));
  }
}

app.listen(PORT, () => {
  console.log(JSON.stringify({ msg: "alexa-sim server ready", port: PORT, mcp: MCP_URL, chatModel: CHAT_MODEL || "(not set)" }));
});

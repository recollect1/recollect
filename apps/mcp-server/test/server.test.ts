// A real MCP client over Streamable HTTP against the real server (§1.8), on the in-memory graph
// with offline stand-ins for the two local models.
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { DemoClock, HashEmbedder, LexicalReranker, MemoryGraph, phrases, seed, type Ctx } from "@recollect/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, type App } from "../src/app.ts";

const tokens = { elder: "test-elder", family: "test-family" };
const ELDER_TOOLS = [
  "check_dose", "keep_private", "log_dose", "memory_lane", "night_reassure", "pause_tracking", "photo_moment",
  "recall_memory", "remember_story", "routine_state", "story_prompt", "talk_about_today", "whats_today", "where_is",
  "who_is",
];
const FAMILY_TOOLS = [
  "care_follow_through", "carer_coach", "family_summary", "memory_fidelity", "recall_memory", "routine_state",
  "share_family_memory", "speech_trend", "story_prompt", "this_is_me", "who_is",
];

let app: App, url: URL, ctx: Ctx, clock: DemoClock;
const logs: Record<string, unknown>[] = [];
const clients: Client[] = [];

async function connect(token: string): Promise<Client> {
  const client = new Client({ name: "recollect-test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  }));
  clients.push(client);
  return client;
}
interface Result { say: string; meta: Record<string, unknown>; data: Record<string, unknown>; isError: boolean }
async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<Result> {
  const r = await client.callTool({ name, arguments: args });
  const data = (r.structuredContent ?? {}) as Record<string, unknown>;
  const text = (r.content as { type: string; text: string }[])[0]?.text ?? "";
  return { say: text, meta: r._meta ?? {}, data, isError: Boolean(r.isError) };
}

beforeEach(async () => {
  clock = new DemoClock();
  clock.set(new Date("2026-10-13T09:00:00+05:30"));
  ctx = await seed(new MemoryGraph(), clock, new HashEmbedder(), new LexicalReranker());
  logs.length = 0;
  app = createApp({ ctx, tokens, demoClock: clock, log: (l) => logs.push(l as Record<string, unknown>) });
  await new Promise<void>((r) => app.http.listen(0, "127.0.0.1", r));
  url = new URL(`http://127.0.0.1:${(app.http.address() as AddressInfo).port}/mcp`);
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await new Promise((r) => app.http.close(r));
});

describe("MCP server (§10)", () => {
  it("rejects a missing or unknown token", async () => {
    const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: {} };
    const attempts: Record<string, string>[] = [{}, { authorization: "Bearer nope" }];
    for (const headers of attempts) {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(init) });
      expect(res.status).toBe(401);
    }
    expect((await fetch(new URL("/healthz", url))).status).toBe(200);
  });

  it("negotiates the protocol and lists tools by role", async () => {
    const elder = await connect(tokens.elder);
    const family = await connect(tokens.family);
    expect(logs.find((l) => l.mcp === "initialize")).toMatchObject({ role: "elder", negotiated: "2025-11-25" });
    const elderTools = (await elder.listTools()).tools;
    expect(elderTools.map((t) => t.name).sort()).toEqual(ELDER_TOOLS);
    expect((await family.listTools()).tools.map((t) => t.name).sort()).toEqual(FAMILY_TOOLS);
    for (const t of elderTools) expect(t.description, t.name).toMatch(/Read the `say` field exactly as written\.$/);
  });

  it("declares MCP Apps cards and serves them as single-file HTML (§10)", async () => {
    const want: Record<string, string> = {
      recall_memory: "ui://recollect/story-card", whats_today: "ui://recollect/today-card",
      who_is: "ui://recollect/who-card", photo_moment: "ui://recollect/photo-card",
      memory_lane: "ui://recollect/lane-card",
    };
    const elder = await connect(tokens.elder);
    const tools = (await elder.listTools()).tools;
    for (const [name, uri] of Object.entries(want)) {
      const meta = tools.find((t) => t.name === name)?._meta as { ui?: { resourceUri?: string } } | undefined;
      expect(meta?.ui?.resourceUri, name).toBe(uri);
    }
    const family = await connect(tokens.family);
    const familyTools = (await family.listTools()).tools;
    expect(familyTools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name).sort())
      .toEqual(["carer_coach", "family_summary", "memory_fidelity", "speech_trend", "this_is_me"]);
    // Every elder tool writes something (an ask, a session, routine state) except Memory Lane.
    expect(tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name)).toEqual(["memory_lane"]);
    const trend = familyTools.find((t) => t.name === "speech_trend");
    expect((trend?._meta as { ui?: { resourceUri?: string } }).ui?.resourceUri).toBe("ui://recollect/trend-card");
    for (const uri of [...Object.values(want), "ui://recollect/trend-card"]) {
      const r = await elder.readResource({ uri });
      const c = r.contents[0] as { mimeType?: string; text?: string };
      expect(c.mimeType, uri).toBe("text/html;profile=mcp-app");
      expect(c.text).toMatch(/^<!doctype html>/i);
      expect(c.text).not.toMatch(/<script[^>]+src=|<link[^>]+href="http/); // no network inside a card
    }
  });

  it("family page REST: family token only; delete-everything needs a typed confirmation", async () => {
    const base = url.origin;
    const get = (path: string, token: string) => fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } });
    const post = (path: string, token: string, body: unknown) => fetch(`${base}${path}`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    expect((await get("/api/family/overview", tokens.elder)).status).toBe(401);
    const overview = await (await get("/api/family/overview", tokens.family)).json() as { people: { id: string }[] };
    expect(overview.people.map((p) => p.id)).toContain("p-aman");
    expect((await post("/api/family/status", tokens.family, { personId: "p-aman", statusLine: "is home for Diwali" })).status).toBe(200);
    expect((await call(await connect(tokens.elder), "where_is", { person: "Aman" })).say).toBe("Aman is home for Diwali.");
    expect((await post("/api/family/delete-everything", tokens.family, {})).status).toBe(400);
    expect((await post("/api/family/medicine", tokens.family, { name: "X", times: ["99:00"] })).status).toBe(400);
  });

  it("scenario K: 03:00 market twice → reassured both times, one family alert", async () => {
    clock.set(new Date("2026-10-14T03:00:00+05:30"));
    const elder = await connect(tokens.elder);
    const a = await call(elder, "night_reassure", { text: "I need to go to the market" });
    const b = await call(elder, "night_reassure", { text: "I need to go to the market" });
    expect(a.say).toBe(b.say);
    expect(a.say).toContain("The market opens in the morning.");
    expect([a.data.alerted, b.data.alerted]).toEqual([false, true]);
    const alerts = await (await fetch(`${url.origin}/api/family/alerts`, { headers: { authorization: `Bearer ${tokens.family}` } })).json() as { say: string }[];
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.say).toContain("not an emergency service");
  });

  it("GET /api/graph needs a token and returns stories with what they name", async () => {
    expect((await fetch(`${url.origin}/api/graph`)).status).toBe(401);
    const g = await (await fetch(`${url.origin}/api/graph`, { headers: { authorization: `Bearer ${tokens.family}` } })).json() as
      { stories: unknown[]; entities: { name: string }[]; mentions: unknown[] };
    expect(g.stories.length).toBe(7); // six stories and the seeded retelling of the well story
    expect(g.entities.map((e) => e.name)).toContain("Patiala");
  });

  it("a family token cannot call elder tools", async () => {
    const family = await connect(tokens.family);
    const r = await family.callTool({ name: "log_dose", arguments: { medicine: "BP tablet" } }).catch((e) => ({ isError: true, e }));
    expect(r.isError).toBe(true);
    expect(await ctx.graph.find("DoseEvent")).toHaveLength(0);
  });

  it("scenario A: dose logged at 8:10, then 'did I take my BP tablet?'", async () => {
    const elder = await connect(tokens.elder);
    expect((await call(elder, "log_dose", { medicine: "BP tablet", at: "8:10" })).say).toBe("Noted, BP tablet at 8:10.");
    const r = await call(elder, "check_dose", { medicine: "BP tablet" });
    expect(r.say).toBe("Yes, you took your BP tablet at 8:10 today.");
    expect(r.data.say).toBe(r.say);
    expect(typeof r.meta["recollect/latencyMs"]).toBe("number");
    expect(logs).toContainEqual(expect.objectContaining({ tool: "check_dose", ok: true }));
  });

  it("scenario B: where_is × 3 is identical, and the family sees the count", async () => {
    const elder = await connect(tokens.elder);
    const says = [];
    for (let i = 0; i < 3; i++) says.push((await call(elder, "where_is", { person: "Aman" })).say);
    expect(says).toEqual(Array(3).fill("Aman is in London and calls you on Sundays."));
    const summary = await call(await connect(tokens.family), "family_summary");
    expect(summary.data.repeatedQuestions).toEqual([{ label: "where Aman is", count: 3 }]);
  });

  it("scenarios C–E: a story told now is recalled in her words; private ones stay hers", async () => {
    const elder = await connect(tokens.elder);
    const family = await connect(tokens.family);
    const text = "Our neighbour Kamla kept three goats on her roof. Every Sunday she sent us fresh goat milk in a steel jug.";
    expect((await call(elder, "remember_story", { text })).say).toBe(phrases.storySaved());
    await app.idle();
    const asked = await call(family, "recall_memory", { question: "Who kept three goats on her roof?" });
    expect(asked.say).toBe(`Gurdev said on 13 October 2026: "${text}"`);
    expect((await call(elder, "keep_private")).say).toBe(phrases.privateKept());
    expect((await call(family, "recall_memory", { question: "Who kept three goats on her roof?" })).say).toBe(phrases.nothingRecorded("that"));
    expect((await call(elder, "recall_memory", { question: "Who kept three goats on her roof?" })).say).toBe(`You told me on 13 October 2026: "${text}"`);
    expect((await call(elder, "recall_memory", { question: "zebra submarine" })).say).toBe(phrases.nothingRecorded("that"));
  });

  it("scenario H: who_is returns the who's-who card", async () => {
    const r = await call(await connect(tokens.elder), "who_is", { name: "Aman" });
    expect(r.say).toBe("That's Aman, your grandson, Simran's son. Aman is in London and calls you on Sundays.");
    expect(r.data.card).toMatchObject({ name: "Aman", relationToElder: "grandson, Simran's son" });
  });

  it("scenario I: the demo clock moves the home into the evening routine", async () => {
    const elder = await connect(tokens.elder);
    expect((await call(elder, "routine_state")).data.routine).toBe("none");
    const auth = { authorization: `Bearer ${tokens.family}`, "content-type": "application/json" };
    const res = await fetch(new URL("/demo/clock", url), { method: "POST", headers: auth, body: JSON.stringify({ at: "2026-10-13T17:00:00+05:30" }) });
    expect(res.status).toBe(200);
    const evening = await call(elder, "routine_state");
    expect(evening.data).toMatchObject({ routine: "evening", shortReplies: true });
    expect(evening.say).toBe("It's evening, Gurdev. Shall we have some tea and talk about your mother's saag?");
  });

  it("scenario J: photo_moment prompts, then saves her description", async () => {
    const elder = await connect(tokens.elder);
    const ask = await call(elder, "photo_moment");
    expect(ask.say).toBe(phrases.weeklyPhotoPrompt("Gurdev"));
    expect(ask.data.photo).toMatchObject({ id: "ph-family" });
    expect((await call(elder, "photo_moment", { text: "That is our courtyard at Diwali, with all the lamps lit." })).say).toBe(phrases.photoThanks());
    await app.idle();
    expect(await ctx.graph.find("Session", { mode: "photo_desc" })).toHaveLength(1);
  });

  it("family tools: speech_trend, this_is_me; elder tools: pause_tracking, story_prompt, whats_today", async () => {
    const elder = await connect(tokens.elder);
    const family = await connect(tokens.family);
    const trend = await call(family, "speech_trend");
    expect(trend.say).toMatch(/^Since August, Gurdev pauses longer.*This is not a medical assessment.$/);
    expect(trend.data.card).toMatchObject({ simulated: true });
    const report = new URL("/report/doctor", url);
    expect((await fetch(report, { headers: { authorization: `Bearer ${tokens.elder}` } })).status).toBe(401);
    const html = await (await fetch(report, { headers: { authorization: `Bearer ${tokens.family}` } })).text();
    expect(html).toContain("Simulated data");
    expect(html).toContain(phrases.NOT_MEDICAL);
    expect((await call(family, "this_is_me")).data.card).toMatchObject({ name: "Gurdev" });
    expect((await call(elder, "whats_today")).say).toMatch(/^It's Tuesday, 13 October\. Harpreet comes at 10:00\./);
    expect((await call(elder, "story_prompt")).say).toBe("You mentioned your sister Nimmo. Would you like to tell me more?");
    expect((await call(elder, "pause_tracking")).say).toBe(phrases.trackingPaused("Simran"));
    expect((await call(family, "speech_trend")).say).toBe(phrases.trackingOff("Gurdev"));
  });

  it("memory fidelity: a chat about her day is thanked the same way, and the family sees the comparison", async () => {
    const elder = await connect(tokens.elder);
    const family = await connect(tokens.family);
    expect((await call(elder, "talk_about_today")).say).toBe(phrases.todayChatPrompt("Gurdev"));
    clock.set(new Date("2026-10-13T11:00:00+05:30"));
    const a = await call(elder, "talk_about_today", { answer: "Harpreet came and we had tea." });
    const b = await call(elder, "talk_about_today", { answer: "Nobody came today." });
    expect(a.say).toBe(phrases.todayChatThanks());
    expect(b.say).toBe(a.say);
    const f = await call(family, "memory_fidelity");
    expect(f.say).toContain(phrases.RIBOT_NOTE);
    expect((f.data.retells as { storyKey: string }[])[0]?.storyKey).toBe("well");
  });

  it("Memory Lane returns slides of her own stories with the lane card", async () => {
    const r = await call(await connect(tokens.elder), "memory_lane");
    expect(r.say).toBe(phrases.memoryLaneIntro("Gurdev"));
    expect((r.data.slides as unknown[]).length).toBeGreaterThan(2);
  });

  it("family memory network: a shared memory is linked to her story and attributed when recalled", async () => {
    const family = await connect(tokens.family);
    const r = await call(family, "share_family_memory", {
      from: "Simran", text: "Biji kept Jagdish's letters in a biscuit tin with a picture of a peacock on the lid.",
      about: "my brother Jagdish bicycle fields",
    });
    expect(r.data.linked).toBe(true);
    expect(r.say).toBe(phrases.familyMemorySaved("Gurdev"));
    const unknown = await call(family, "share_family_memory", { from: "Kuldeep", text: "hello" });
    expect(unknown.say).toBe(phrases.whoIsUnknown("Simran"));
  });

  it("carer coach and care follow-through for the family; the calendar and memory book need the family token", async () => {
    const family = await connect(tokens.family);
    const coach = await call(family, "carer_coach");
    expect((coach.data.tips as unknown[]).length).toBe(4);
    const care = await call(family, "care_follow_through");
    expect(care.say).toBe(phrases.careReady("Gurdev", 5));
    const steps = care.data.steps as { id: string; kind: string; planId: string }[];
    const auth = (t: string) => ({ headers: { authorization: `Bearer ${t}` } });
    const ics = new URL(`/report/care-calendar.ics?plan=${steps[0]!.planId}`, url);
    expect((await fetch(ics, auth(tokens.family))).status).toBe(400);
    const decide = await fetch(new URL("/api/family/care-decision", url), {
      method: "POST", headers: { ...auth(tokens.family).headers, "content-type": "application/json" },
      body: JSON.stringify({ id: steps.find((s) => s.kind === "appointment")!.id, approve: true }),
    });
    expect(decide.status).toBe(200);
    const cal = await fetch(ics, auth(tokens.family));
    expect(cal.headers.get("content-type")).toContain("text/calendar");
    expect(await cal.text()).toContain("BEGIN:VEVENT");
    const book = new URL("/report/memory-book", url);
    expect((await fetch(book, auth(tokens.elder))).status).toBe(401);
    expect(await (await fetch(book, auth(tokens.family))).text()).toContain("My mother made sarson ka saag every winter.");
  });

  it("a family message set on the family page is read after where-is", async () => {
    const res = await fetch(new URL("/api/family/message", url), {
      method: "POST", headers: { authorization: `Bearer ${tokens.family}`, "content-type": "application/json" },
      body: JSON.stringify({ personId: "p-aman", text: "Hello Biji, I'll call you on Sunday." }),
    });
    expect(res.status).toBe(200);
    const r = await call(await connect(tokens.elder), "where_is", { person: "Aman" });
    expect(r.say).toBe('Aman is in London and calls you on Sundays. Aman left you a message: "Hello Biji, I\'ll call you on Sunday."');
  });

  it("her language: the family switches to Hindi, she hears Hindi, the family still reads English", async () => {
    const set = (lang: string) => fetch(new URL("/api/family/language", url), {
      method: "POST", headers: { authorization: `Bearer ${tokens.family}`, "content-type": "application/json" },
      body: JSON.stringify({ lang }),
    });
    expect((await set("hi")).status).toBe(200);
    const elder = await connect(tokens.elder);
    const a = await call(elder, "where_is", { person: "Aman" });
    expect(a.say).toBe("Aman लंदन में हैं और रविवार को आपको फ़ोन करते हैं।");
    expect((await call(elder, "where_is", { person: "Aman" })).say).toBe(a.say);
    const family = await call(await connect(tokens.family), "who_is", { name: "Aman" });
    expect(family.say.startsWith("That's Aman, your grandson")).toBe(true);
    expect((await set("fr")).status).toBe(400);
    expect((await set("en")).status).toBe(200);
  });
});

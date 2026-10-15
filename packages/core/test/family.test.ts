// Family page operations (§13). In-memory graph; FalkorDB (graph "recollect_test") when FALKORDB_URL is set.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Ctx } from "../src/ctx.ts";
import { speechTrend, thisIsMe, whereIs } from "../src/daily.ts";
import { HashEmbedder } from "../src/embed.ts";
import * as F from "../src/family.ts";
import { FalkorGraph, MemoryGraph, type Graph } from "../src/graph.ts";
import { LexicalReranker } from "../src/rerank.ts";
import { recall } from "../src/recall.ts";
import { seed } from "../src/seed/index.ts";
import { keepPrivate, rememberStory } from "../src/stories.ts";
import { DemoClock } from "../src/time.ts";

let ctx: Ctx;
let graph: Graph;
beforeEach(async () => {
  const clock = new DemoClock();
  clock.set(new Date("2026-10-13T09:00:00+05:30"));
  const url = process.env.FALKORDB_URL;
  graph = url ? await FalkorGraph.connect(url, "recollect_test") : new MemoryGraph();
  await graph.clear();
  ctx = await seed(graph, clock, new HashEmbedder(), new LexicalReranker());
});
afterEach(async () => {
  await graph.close();
});

describe("consent (§1.6)", () => {
  it("needs both steps to switch tracking on; either side switches it off", async () => {
    let c = await F.changeConsent(ctx, { off: true });
    expect(c.trackingOn).toBe(false);
    expect((await speechTrend(ctx)).card).toBeUndefined();
    c = await F.changeConsent(ctx, { elderAgreed: true });
    expect(c.trackingOn).toBe(false);
    c = await F.changeConsent(ctx, { familyAgreed: true, fullVoice: true });
    expect(c).toMatchObject({ trackingOn: true, fullVoiceOn: true });
    c = await F.changeConsent(ctx, { off: true });
    expect(c).toMatchObject({ trackingOn: false, fullVoiceOn: false });
    expect(c.byElderAt).toBeUndefined();
  });
  it("full-voice mode cannot be on while tracking is off", async () => {
    await F.changeConsent(ctx, { off: true });
    expect((await F.changeConsent(ctx, { fullVoice: true })).fullVoiceOn).toBe(false);
  });
});

describe("stories for the family", () => {
  it("never shows private stories, only counts them", async () => {
    await rememberStory(ctx, { text: "I hid my gold bangles in the wheat sack. Nobody knows." });
    await keepPrivate(ctx);
    const { stories, privateCount } = await F.familyStories(ctx);
    expect(privateCount).toBe(1);
    expect(stories.flatMap((s) => s.quotes).join(" ")).not.toContain("wheat sack");
    expect(stories.length).toBeGreaterThan(0);
  });
});

describe("setup", () => {
  it("a status line the family writes is what she hears", async () => {
    await F.setStatusLine(ctx, "p-aman", "is flying home and lands on Friday.");
    expect((await whereIs(ctx, "Aman")).say).toBe("Aman is flying home and lands on Friday.");
  });
  it("saves a medicine with aliases and times; rejects a bad time", async () => {
    const id = await F.saveMedicine(ctx, { name: "Vitamin D", purpose: "Bones", aliases: ["sunshine tablet"], times: ["9:00"] });
    const med = (await F.familyOverview(ctx)).medicines.find((m) => m.id === id)!;
    expect(med).toMatchObject({ aliases: ["sunshine tablet"], times: ["09:00"] });
    await expect(F.saveMedicine(ctx, { name: "X", purpose: "", aliases: [], times: ["25:00"] })).rejects.toThrow(F.FamilyError);
  });
});

describe("This is me (§9.5)", () => {
  it("shows a story-derived fact only after the family approves it", async () => {
    const candidates = await F.factCandidates(ctx);
    expect(candidates.length).toBeGreaterThan(0);
    const fact = candidates[0]!;
    expect((await thisIsMe(ctx)).card?.profile.approvedFacts).not.toContain(fact);
    await F.approveFact(ctx, fact);
    expect((await thisIsMe(ctx)).card?.profile.approvedFacts).toContain(fact);
    await expect(F.approveFact(ctx, "Was a famous singer")).rejects.toThrow(F.FamilyError);
  });
});

describe("delete everything (§1.6)", () => {
  it("removes her stories, markers and trends, keeps the household working, switches tracking off", async () => {
    const { removed } = await F.deleteEverything(ctx);
    expect(removed).toBeGreaterThan(0);
    expect((await recall(ctx, "How did I come to Patiala?", "elder")).found).toBe(false);
    expect((await F.familyStories(ctx)).stories).toEqual([]);
    expect((await F.familyOverview(ctx)).consent?.trackingOn).toBe(false);
    for (const label of F.PERSONAL_LABELS) expect(await ctx.graph.find(label), label).toEqual([]);
    expect((await whereIs(ctx, "Aman")).say).toContain("Aman");
  });
});

describe("graph view (§13 live panel)", () => {
  it("shows her stories and what they name; hides private stories from the family", async () => {
    const { graphView } = await import("../src/graph-view.ts");
    const v = await graphView(ctx, "family");
    expect(v.stories.length).toBe(6);
    expect(v.entities.map((e) => e.name)).toContain("Patiala");
    expect(v.mentions.length).toBeGreaterThan(v.stories.length);
    await rememberStory(ctx, { text: "Secret about the tin box under the bed." });
    await keepPrivate(ctx);
    expect((await graphView(ctx, "family")).stories.length).toBe(6);
    expect((await graphView(ctx, "elder")).stories.length).toBe(7);
  });
});

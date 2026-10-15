// Runs offline on the in-memory graph with the hashing embedder. Recall quality on the real
// embedding model is measured separately by `pnpm eval:recall`.
// With FALKORDB_URL set, the same suite runs against FalkorDB (graph "recollect_test").
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Ctx } from "../src/ctx.ts";
import * as D from "../src/daily.ts";
import { HashEmbedder } from "../src/embed.ts";
import { FalkorGraph, MemoryGraph, type Graph } from "../src/graph.ts";
import * as P from "../src/phrases.ts";
import { LexicalReranker } from "../src/rerank.ts";
import { recall } from "../src/recall.ts";
import { PEOPLE, STORIES } from "../src/seed/data.ts";
import { seed } from "../src/seed/index.ts";
import { keepPrivate, photoMoment, processSession, rememberStory, storyPrompt } from "../src/stories.ts";
import { splitQuotes, wordCount } from "../src/text.ts";
import { DemoClock, isoWeek, localDayBounds } from "../src/time.ts";
import type { AskEvent, Consent, Device, Entity, Quote, RoutineEvent, Session } from "../src/types.ts";

// Tuesday 13 October 2026, household time (IST = UTC+5:30).
const ist = (hhmm: string, day = "2026-10-13") => new Date(`${day}T${hhmm}:00+05:30`);

let ctx: Ctx;
let clock: DemoClock;
let graph: Graph;
beforeEach(async () => {
  clock = new DemoClock();
  clock.set(ist("09:00"));
  const url = process.env.FALKORDB_URL;
  graph = url ? await FalkorGraph.connect(url, "recollect_test") : new MemoryGraph();
  await graph.clear();
  ctx = await seed(graph, clock, new HashEmbedder(), new LexicalReranker());
});
afterEach(async () => {
  await graph.close();
});

describe("seed (§5)", () => {
  it("has six stories of 60–150 words", () => {
    expect(STORIES).toHaveLength(6);
    for (const s of STORIES) {
      expect(wordCount(s.text), s.key).toBeGreaterThanOrEqual(60);
      expect(wordCount(s.text), s.key).toBeLessThanOrEqual(150);
    }
  });
  it("stores quotes verbatim: joined quotes equal the told story", async () => {
    for (const s of STORIES) expect(splitQuotes(s.text).join(" ")).toBe(s.text);
  });
  it("every MENTIONS span is a substring of its quote (§6 invariant)", async () => {
    let edges = 0;
    for (const e of await ctx.graph.find<Entity>("Entity")) {
      for (const m of await ctx.graph.into<Quote>(["Entity", e.id], "MENTIONS")) {
        expect(m.node.text).toContain(m.edge.span as string);
        edges++;
      }
    }
    expect(edges).toBeGreaterThan(25);
  });
  it("every declared mention was linked at least once", () => {
    for (const s of STORIES) for (const [span] of s.mentions) expect(s.text, `${s.key}: ${span}`).toContain(span);
  });
  it("seed text never trips the banned lists", () => {
    for (const s of STORIES) expect(P.findBanned(s.text, P.BANNED_CLAIMS), s.key).toEqual([]);
  });
});

describe("doses (scenario A)", () => {
  it("answers yes with the logged time after an 8:10 log", async () => {
    expect((await D.checkDose(ctx, "BP tablet")).say).toBe("Your BP tablet is due at 8:00. It isn't marked as taken yet.");
    clock.set(ist("08:10"));
    expect((await D.logDose(ctx, "bp")).say).toBe("Noted, BP tablet at 8:10.");
    clock.set(ist("09:00"));
    expect((await D.checkDose(ctx, "my blood pressure tablet")).say).toBe("Yes, you took your BP tablet at 8:10 today.");
  });
  it("does not log the same slot twice, and points to the family admin", async () => {
    clock.set(ist("08:10"));
    await D.logDose(ctx, "BP tablet");
    clock.set(ist("08:40"));
    const again = await D.logDose(ctx, "BP tablet");
    expect(again).toEqual({
      say: "Your BP tablet was already marked at 8:10 today. If you're unsure, please ask Simran.", logged: false,
    });
  });
  it("treats the evening BP slot separately", async () => {
    clock.set(ist("08:10"));
    await D.logDose(ctx, "BP tablet");
    clock.set(ist("20:05"));
    expect((await D.checkDose(ctx, "BP tablet")).say).toBe("Your BP tablet is due at 20:00. It isn't marked as taken yet.");
    expect((await D.logDose(ctx, "BP tablet")).logged).toBe(true);
    expect((await D.checkDose(ctx, "BP tablet")).say).toBe("Yes, you took your BP tablet at 20:05 today.");
  });
  it("starts fresh the next day", async () => {
    clock.set(ist("08:10"));
    await D.logDose(ctx, "BP tablet");
    clock.set(ist("09:00", "2026-10-14"));
    expect((await D.checkDose(ctx, "BP tablet")).taken).toBe(false);
  });
  it("an unknown tablet is referred to the family admin, with no advice", async () => {
    const r = await D.checkDose(ctx, "heart tablet");
    expect(r.say).toBe(P.medicineUnknown("Simran"));
  });
  it("no medicine response contains a banned word (§1.5)", async () => {
    clock.set(ist("08:10"));
    const says = [
      (await D.checkDose(ctx)).say, (await D.logDose(ctx, "sugar")).say, (await D.logDose(ctx, "sugar")).say,
      (await D.checkDose(ctx, "calcium")).say, (await D.whatsToday(ctx)).say, (await D.familySummary(ctx)).say,
    ];
    for (const s of says) expect(P.findBanned(s, P.BANNED_MEDICINE), s).toEqual([]);
  });
});

describe("same calm answer every time (scenario B, §1.4)", () => {
  it("where_is × 5 gives an identical say and logs each ask silently", async () => {
    const says = [];
    for (let i = 0; i < 5; i++) says.push((await D.whereIs(ctx, i % 2 ? "my grandson" : "Aman")).say);
    expect(new Set(says).size).toBe(1);
    expect(says[0]).toBe("Aman is in London and calls you on Sundays.");
    const { from, to } = localDayBounds(clock.now(), "Asia/Kolkata");
    expect(await ctx.graph.findRange<AskEvent>("AskEvent", "at", from, to)).toHaveLength(5);
  });
  it("the family page sees the count; the elder never hears it", async () => {
    for (let i = 0; i < 3; i++) await D.whereIs(ctx, "Aman");
    const summary = await D.familySummary(ctx);
    expect(summary.repeatedQuestions).toEqual([{ label: "where Aman is", count: 3 }]);
    expect(summary.say).toContain("where Aman is (asked 3 times today)");
    expect(summary.note).toBe(P.REPEATS_NORMAL);
  });
  it("whats_today, check_dose and who_is are word-for-word stable too", async () => {
    for (const ask of [() => D.whatsToday(ctx), () => D.checkDose(ctx, "calcium"), () => D.whoIs(ctx, { name: "Simran" }, "elder")]) {
      const a = (await ask()).say;
      expect((await ask()).say).toBe(a);
      expect((await ask()).say).toBe(a);
    }
  });
});

describe("today", () => {
  it("gives the date, visitor and next tablet", async () => {
    const r = await D.whatsToday(ctx);
    expect(r.say).toBe("It's Tuesday, 13 October. Harpreet comes at 10:00. Your next tablet is your BP tablet, at 8:00.");
    expect(r.card.doses).toHaveLength(4);
  });
  it("never names a long-missed dose as the next tablet (§1.5)", async () => {
    clock.set(ist("17:30"));
    expect((await D.whatsToday(ctx)).say).toContain("Your next tablet is your BP tablet, at 20:00.");
    clock.set(ist("20:45"));
    expect((await D.whatsToday(ctx)).say).toContain("Your next tablet is your BP tablet, at 20:00.");
    clock.set(ist("21:30"));
    expect((await D.whatsToday(ctx)).say).toContain(P.noMoreDoses());
    // The missed morning doses still show, unmarked, on the card and the family page.
    expect((await D.whatsToday(ctx)).card.doses.filter((d) => !d.taken)).toHaveLength(4);
  });
  it("on Sunday the helper is off and Aman calls", async () => {
    clock.set(ist("09:00", "2026-10-18"));
    expect((await D.whatsToday(ctx)).say).toContain("It's Sunday, 18 October. Aman calls today.");
  });
});

describe("who's who (scenario H)", () => {
  it("returns the right relation for every seeded person", async () => {
    for (const p of PEOPLE.filter((x) => x.role !== "elder")) {
      const r = await D.whoIs(ctx, { name: p.name }, "elder");
      expect(r.card).toMatchObject({ name: p.name, relationToElder: p.relationToElder });
      expect(r.say.startsWith(`That's ${p.name}, your ${p.relationToElder}.`)).toBe(true);
    }
  });
  it("resolves a photo of one person, and the spoken relation", async () => {
    expect((await D.whoIs(ctx, { photoId: "ph-aman" }, "elder")).card?.name).toBe("Aman");
    expect((await D.whoIs(ctx, { name: "my grandson" }, "elder")).say)
      .toBe("That's Aman, your grandson, Simran's son. Aman is in London and calls you on Sundays.");
  });
  it("unknown people get whoIsUnknown, never a guess", async () => {
    expect((await D.whoIs(ctx, { name: "Kuldeep" }, "elder")).say).toBe(P.whoIsUnknown("Simran"));
    expect((await D.whoIs(ctx, { photoId: "ph-family" }, "elder")).say).toBe(P.whoIsUnknown("Simran"));
    expect((await D.whereIs(ctx, "Kuldeep")).say).toBe(P.whoIsUnknown("Simran"));
  });
});

describe("stories", () => {
  const RADIO = STORIES.find((s) => s.key === "radio")!;
  it("saves a story instantly as verbatim quotes and queues it for the agents (scenario C)", async () => {
    const before = ctx.index.size;
    const text = "We had a black dog called Moti. He followed me to the well every single morning.";
    const { say, sessionId } = await rememberStory(ctx, { text });
    expect(say).toBe("Thank you, I've kept that.");
    const quotes = (await ctx.graph.out<Quote>(["Session", sessionId], "HAS_QUOTE")).map((q) => q.node);
    expect(quotes.sort((a, b) => a.seq - b.seq).map((q) => q.text).join(" ")).toBe(text);
    expect(await ctx.graph.find("Job", { sessionId, done: false })).toHaveLength(1);
    await processSession(ctx, sessionId);
    expect(ctx.index.size).toBe(before + 2);
  });
  it("a retold story gets the same thanks and a silent RETELLS marker (scenario F)", async () => {
    const { say, sessionId } = await rememberStory(ctx, { text: RADIO.text });
    expect(say).toBe(P.storySaved());
    const { retells } = await processSession(ctx, sessionId);
    expect(retells).toBe(splitQuotes(RADIO.text).length);
  });
  it("keep_private hides the last story from family recall but not from her", async () => {
    const text = "I hid my gold bangles inside the flour tin during the bad year.";
    const { sessionId } = await rememberStory(ctx, { text });
    await processSession(ctx, sessionId);
    expect((await keepPrivate(ctx)).say).toBe("Alright, I'll keep that just for you.");
    expect((await ctx.graph.get<Session>("Session", sessionId))?.private).toBe(true);
    const asFamily = await recall(ctx, "I hid my gold bangles inside the flour tin", "family");
    expect(asFamily.quotes.map((q) => q.text)).not.toContain(text);
    const asElder = await recall(ctx, "I hid my gold bangles inside the flour tin", "elder");
    expect(asElder.quotes[0]?.text).toBe(text);
  });
  it("offers the open story prompt once, then a general one", async () => {
    expect((await storyPrompt(ctx)).say).toBe("You mentioned your sister Nimmo. Would you like to tell me more?");
    expect((await storyPrompt(ctx)).say).toBe(P.storyPromptOpen());
  });
});

describe("grounded recall (§11)", () => {
  it("answers only with stored words, in the right frame for each role", async () => {
    const r = await recall(ctx, "my brother Jagdish bicycle fields", "elder");
    expect(r.found).toBe(true);
    expect(r.quotes[0]?.storyKey).toBe("jagdish");
    const spoken = r.quotes.map((q) => q.text).join(" ");
    expect(STORIES.find((s) => s.key === "jagdish")!.text).toContain(spoken);
    expect(r.say).toBe(`You told me on 17 August 2026: "${spoken}"`);
    expect(wordCount(spoken)).toBeLessThanOrEqual(45);
    const fam = await recall(ctx, "my brother Jagdish bicycle fields", "family");
    expect(fam.say).toBe(`Gurdev said on 17 August 2026: "${spoken}"`);
  });
  it("says nothingRecorded when nothing relevant is stored (scenario E)", async () => {
    const r = await recall(ctx, "zebra submarine", "elder");
    expect(r).toMatchObject({ found: false, quotes: [], say: P.nothingRecorded("that") });
  });
  it("matches the longest alias first", () => {
    expect([...ctx.index.entitiesIn("What did my mother-in-law do?")]).toEqual(["e-mother-in-law"]);
    expect([...ctx.index.entitiesIn("What did my mother cook?")]).toEqual(["e-mother"]);
    expect([...ctx.index.entitiesIn("Tell me about Simran's wedding")].sort()).toEqual(["e-simran", "e-wedding"]);
  });
});

describe("weekly photo (scenario J)", () => {
  it("prompts with the chosen photo, then saves a photo_desc session outside recall", async () => {
    const ask = await photoMoment(ctx);
    expect(ask).toMatchObject({ saved: false, say: "Gurdev, would you tell me about this photo? There's no right or wrong answer." });
    expect(ask.photo?.id).toBe("ph-family");
    const before = ctx.index.size;
    const told = await photoMoment(ctx, "That is our courtyard at Diwali. Aman is holding the sparklers and laughing.");
    expect(told).toMatchObject({ saved: true, say: "Thank you, I loved hearing that." });
    const sessions = await ctx.graph.find<Session>("Session", { mode: "photo_desc" });
    expect(sessions).toHaveLength(1);
    await processSession(ctx, sessions[0]!.id);
    expect(ctx.index.size).toBe(before);
    expect(await ctx.graph.get("WeeklyPhoto", `wp-${isoWeek(clock.now(), "Asia/Kolkata")}`)).toMatchObject({ sessionId: sessions[0]!.id });
  });
});

describe("weekly photo scheduling (§9.4)", () => {
  // 13 October 2026 is a Tuesday; ISO week 2026-W42 runs Monday 12 to Sunday 18 October.
  it("is due only in the calm 11:00–12:00 window", async () => {
    for (const [at, due] of [["10:59", false], ["11:00", true], ["11:45", true], ["12:00", false], ["17:30", false], ["03:00", false]] as const) {
      clock.set(ist(at));
      expect((await D.routineState(ctx)).photoDue, at).toBe(due);
    }
    clock.set(ist("11:15"));
    expect((await D.routineState(ctx)).week).toBe("2026-W42");
  });
  it("stops being due once this week's description is saved, and is due again next week", async () => {
    clock.set(ist("11:15"));
    await photoMoment(ctx, "That is our courtyard at Diwali, with all the little lamps lit.");
    expect((await D.routineState(ctx)).photoDue).toBe(false);
    clock.set(ist("11:15", "2026-10-15"));
    expect((await D.routineState(ctx)).photoDue).toBe(false);
    clock.set(ist("11:15", "2026-10-19"));
    expect((await D.routineState(ctx)).photoDue).toBe(true);
  });
  it("only offering the photo, without a description, leaves it due", async () => {
    clock.set(ist("11:15"));
    await photoMoment(ctx);
    expect((await D.routineState(ctx)).photoDue).toBe(true);
  });
  it("is not due when no photo has been chosen", async () => {
    clock.set(ist("11:15"));
    for (const w of await ctx.graph.find<{ id: string }>("WeeklyPhoto")) await ctx.graph.remove("WeeklyPhoto", w.id);
    expect((await D.routineState(ctx)).photoDue).toBe(false);
  });
});

describe("routines (scenario I)", () => {
  it("daytime: nothing running", async () => {
    const s = await D.routineState(ctx);
    expect(s).toMatchObject({ routine: "none", shortReplies: false, localTime: "9:00" });
    expect(s.devices.every((d) => d.state === "off" || d.state === "idle")).toBe(true);
  });
  it("17:00: evening RoutineEvent, lights on, music, short replies, eveningHello", async () => {
    clock.set(ist("17:00"));
    const s = await D.routineState(ctx);
    expect(s.routine).toBe("evening");
    expect(s.shortReplies).toBe(true);
    expect(s.greeting).toBe("It's evening, Gurdev. Shall we have some tea and talk about your mother's saag?");
    const byId = Object.fromEntries((await ctx.graph.find<Device>("Device")).map((d) => [d.id, d.state]));
    expect(byId).toMatchObject({ "d-living-light": "on", "d-speaker": "playing familiar music" });
    await D.routineState(ctx);
    const events = await ctx.graph.find<RoutineEvent>("RoutineEvent");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "evening", at: ist("17:00").toISOString() });
  });
  it("03:00: night state with a dim bedroom light", async () => {
    clock.set(ist("03:00"));
    const s = await D.routineState(ctx);
    expect(s.routine).toBe("night");
    expect(s.devices.find((d) => d.id === "d-bedroom-light")?.state).toBe("dim");
  });
});

describe("consent and family views", () => {
  it("pause_tracking turns tracking off and speech_trend then shows nothing", async () => {
    await ctx.graph.remove("TrendCard", "tc-2026-10-12");
    expect((await D.speechTrend(ctx)).say).toBe(P.trendNotReady("Gurdev"));
    expect((await D.pauseTracking(ctx)).say).toBe("Okay, I've stopped tracking your speech. You can turn it back on with Simran any time.");
    expect((await ctx.graph.find<Consent>("Consent"))[0]).toMatchObject({ trackingOn: false });
    expect((await D.speechTrend(ctx)).say).toBe(P.trackingOff("Gurdev"));
  });
  it("scenario G: the seeded trend card is the simulated history, labelled as such", async () => {
    const r = await D.speechTrend(ctx);
    expect(r.card).toMatchObject({ kind: "change", simulated: true, since: "August", weeks: 12 });
    expect(r.say).toBe(P.trendChange("Gurdev", ["mean_pause_s", "mattr", "named_recall", "retell_rate"], "August"));
    const sets = await ctx.graph.find<{ simulated: boolean }>("MarkerSet");
    expect(sets).toHaveLength(72);
    expect(sets.every((s) => s.simulated)).toBe(true);
  });
  it("speech_trend returns the stored card verbatim", async () => {
    const say = P.trendChange("Gurdev", ["mean_pause_s", "named_recall"], "August");
    await ctx.graph.upsert("TrendCard", {
      id: "tc-1", personId: "p-gurdev", createdAt: "2026-10-13T00:00:00.000Z", kind: "change", say,
      changes: ["mean_pause_s", "named_recall"], since: "August", weeks: 8, simulated: true,
    });
    const r = await D.speechTrend(ctx);
    expect(r.say).toBe(say);
    expect(r.card?.simulated).toBe(true);
  });
  it("This is me holds only family-written fields and approved facts", async () => {
    const r = await D.thisIsMe(ctx);
    expect(r.card?.profile.approvedFacts).toEqual([]);
    expect(r.card?.people.map((p) => p.name).sort()).toEqual(["Aman", "Harpreet", "Simran"]);
    expect(JSON.stringify(r.card)).not.toContain("Jagdish");
  });
  it("family summary counts stories but carries no story text", async () => {
    await rememberStory(ctx, { text: "My secret is that I never liked the well at all, truly." });
    const s = await D.familySummary(ctx);
    expect(s.storiesToday).toBe(1);
    expect(JSON.stringify(s)).not.toContain("secret");
  });
});

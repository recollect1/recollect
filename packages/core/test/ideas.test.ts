// Memory Fidelity Engine, family memory network, carer coach, Memory Lane and care follow-through.
// Offline: in-memory graph, hashing embedder, word-overlap reranker.
import { beforeEach, describe, expect, it } from "vitest";
import { careCalendar, decideCare, ensureCarePlan, memoryBookHtml } from "../src/care.ts";
import { carerCoach } from "../src/coach.ts";
import type { Ctx } from "../src/ctx.ts";
import * as D from "../src/daily.ts";
import { HashEmbedder } from "../src/embed.ts";
import { deleteEverything, familyStories } from "../src/family.ts";
import { recentVsOld, retellComparisons, todayChat } from "../src/fidelity.ts";
import { MemoryGraph } from "../src/graph.ts";
import { memoryLane } from "../src/lane.ts";
import { familyVoices, setFamilyMessage, shareFamilyMemory } from "../src/network.ts";
import * as P from "../src/phrases.ts";
import { recall } from "../src/recall.ts";
import { LexicalReranker } from "../src/rerank.ts";
import { FAMILY_MEMORIES, RETELLINGS, STORIES } from "../src/seed/data.ts";
import { seed } from "../src/seed/index.ts";
import { keepPrivate, processSession, rememberStory } from "../src/stories.ts";
import { wordCount } from "../src/text.ts";
import { DemoClock } from "../src/time.ts";
import type { CareAction, Consent, RecentRecall, Session } from "../src/types.ts";

// Tuesday 13 October 2026, household time (IST). Harpreet visits at 10:00 Monday to Saturday.
const ist = (hhmm: string, day = "2026-10-13") => new Date(`${day}T${hhmm}:00+05:30`);
const clean = (s: string) => {
  expect(P.findBanned(s, P.BANNED_CLAIMS), s).toEqual([]);
  expect(s).not.toMatch(/undefined|null|NaN|\{|\}/);
};

let ctx: Ctx;
let clock: DemoClock;
beforeEach(async () => {
  clock = new DemoClock();
  clock.set(ist("11:00"));
  ctx = await seed(new MemoryGraph(), clock, new HashEmbedder(), new LexicalReranker());
});

describe("Memory Fidelity Engine: retell consistency", () => {
  it("compares the retold well story with her first telling: kept, dropped, added, a likely swap", async () => {
    const [well] = await retellComparisons(ctx);
    expect(well).toMatchObject({
      storyKey: "well", kept: ["Rampur", "well"], dropped: ["Nimmo", "father"], added: ["Jagdish"],
      possibleSwaps: [["Nimmo", "Jagdish"]], consistency: 0.5, years: null,
    });
    expect(well!.first.date).toBe("10 August 2026");
    expect(well!.retold.date).toBe("28 September 2026");
    expect(well!.say).toBe("When Gurdev told this story again, 2 of 4 details from her earlier telling were the same.");
    clean(well!.say);
  });

  it("notices a changed year", async () => {
    const a = await rememberStory(ctx, { text: "We bought our first scooter in 1971. It was green.", at: ist("11:00", "2026-09-01"), storyKey: "scooter", queued: false });
    const b = await rememberStory(ctx, { text: "We bought our first scooter in 1975. It was green.", at: ist("11:00", "2026-10-01"), storyKey: "scooter", queued: false });
    await processSession(ctx, a.sessionId); await processSession(ctx, b.sessionId);
    const scooter = (await retellComparisons(ctx)).find((r) => r.storyKey === "scooter")!;
    expect(scooter.years).toEqual({ first: ["1971"], retold: ["1975"] });
  });

  it("leaves private stories out of the family view", async () => {
    const { sessionId } = await rememberStory(ctx, { text: "In Rampur there was one well. I went there alone.", storyKey: "well", queued: false });
    await keepPrivate(ctx);
    expect((await retellComparisons(ctx)).some((r) => r.retold.sessionId === sessionId)).toBe(false);
  });
});

describe("Memory Fidelity Engine: a chat about her day, never a quiz", () => {
  it("asks gently, and thanks her the same way whatever she says", async () => {
    expect((await todayChat(ctx)).say).toBe("Gurdev, tell me about your day. Did anyone come to see you?");
    const right = await todayChat(ctx, "Harpreet came this morning and we had tea.");
    const wrong = await todayChat(ctx, "Nobody came today, it was very quiet.");
    expect(right.say).toBe(P.todayChatThanks());
    expect(wrong.say).toBe(right.say);
    const live = (await ctx.graph.find<RecentRecall>("RecentRecall")).filter((r) => !r.simulated)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(live.map((r) => r.matched).sort()).toEqual([false, true]);
    expect(live.every((r) => r.expected.join() === "Harpreet")).toBe(true);
  });

  it("records nothing while change tracking is off, and never adds the chat to her life stories", async () => {
    const consent = (await ctx.graph.find<Consent>("Consent"))[0]!;
    await ctx.graph.upsert("Consent", { id: consent.id, trackingOn: false });
    const before = (await ctx.graph.find("RecentRecall")).length;
    await todayChat(ctx, "Harpreet came this morning.");
    expect((await ctx.graph.find("RecentRecall")).length).toBe(before);
    expect((await familyStories(ctx)).stories.some((s) => s.quotes.join(" ").includes("Harpreet came"))).toBe(false);
  });

  it("before the helper is due, there is nothing to compare", async () => {
    clock.set(ist("08:30"));
    const before = (await ctx.graph.find("RecentRecall")).length;
    await todayChat(ctx, "Nobody yet.");
    expect((await ctx.graph.find("RecentRecall")).length).toBe(before);
  });

  it("recent vs long ago, on the simulated history: labelled, compared only with herself", async () => {
    const v = await recentVsOld(ctx);
    expect(v).toMatchObject({ ready: true, simulated: true, recent: { named: 5, chats: 12 } });
    expect(v.perStory).toBeGreaterThan(3);
    expect(v.weekly).toHaveLength(12);
    expect(v.say).toContain(P.RIBOT_NOTE);
    expect(v.say).toContain(P.NOT_MEDICAL);
    clean(v.say);
  });
});

describe("family memory network", () => {
  it("links a family member's memory to her story, verbatim and attributed", async () => {
    const voices = await familyVoices(ctx);
    const saag = [...voices.values()].flat().find((v) => v.name === "Aman")!;
    expect(saag.quotes.join(" ")).toBe(FAMILY_MEMORIES[0]!.text);
    expect(saag.relation).toBe("grandson, Simran's son");
  });

  it("recall prefers her own words, and attributes a family memory when only that answers", async () => {
    const hers = await recall(ctx, "my mother sarson ka saag winter", "elder");
    expect(hers.speaker).toBe("Gurdev");
    expect(hers.say.startsWith("You told me on")).toBe(true);
    const asked = "I still remember the white butter melting on top, and how she would not let anyone else stir the pot.";
    const his = await recall(ctx, asked, "elder");
    expect(his.speaker).toBe("Aman");
    expect(his.say).toBe(P.fromFamilyWords(his.quotes.map((q) => q.text).join(" "), "Aman", "20 September 2026"));
    const toFamily = await recall(ctx, asked, "family");
    expect(toFamily.say.startsWith("Aman said on 20 September 2026:")).toBe(true);
  });

  it("only real, non-private stories of hers can be linked; the elder cannot be a family voice", async () => {
    const story = (await ctx.graph.find<Session>("Session", { storyKey: "jagdish" }))[0]!;
    const ok = await shareFamilyMemory(ctx, { personId: "p-simran", text: "Biji still has the biscuit tin.", aboutSessionId: story.id });
    expect(ok.say).toBe("Thank you. I've kept your memory with Gurdev's stories.");
    expect(await ctx.graph.find("Job", { sessionId: ok.sessionId, done: false })).toHaveLength(1);
    await expect(shareFamilyMemory(ctx, { personId: "p-gurdev", text: "x" })).rejects.toThrow("no such family member");
    await expect(shareFamilyMemory(ctx, { personId: "p-aman", text: "x", aboutSessionId: "nope" })).rejects.toThrow("no such story");
  });

  it("a family message is read after where-is, the same way every time, until it changes", async () => {
    const plain = (await D.whereIs(ctx, "Aman")).say;
    await setFamilyMessage(ctx, "p-aman", "Hello Biji, I'll call you on Sunday.");
    const withMessage = (await D.whereIs(ctx, "Aman")).say;
    expect(withMessage).toBe(`${plain} Aman left you a message: "Hello Biji, I'll call you on Sunday."`);
    expect((await D.whereIs(ctx, "my grandson")).say).toBe(withMessage);
    await setFamilyMessage(ctx, "p-aman", "");
    expect((await D.whereIs(ctx, "Aman")).say).toBe(plain);
    await expect(setFamilyMessage(ctx, "p-aman", "x".repeat(201))).rejects.toThrow("under 200");
  });
});

describe("carer coach", () => {
  it("pairs fixed guidance with a starter in her own words", async () => {
    const tips = await carerCoach(ctx);
    expect(tips.map((t) => t.situation)).toEqual(["parent", "going_out", "repeats", "evening"]);
    const parent = tips[0]!;
    expect(parent.starter).toMatchObject({ topic: expect.stringMatching(/^her (mother|father)$/) });
    const allText = STORIES.map((s) => s.text).join(" ") + RETELLINGS.map((s) => s.text).join(" ");
    for (const t of tips) {
      clean(t.title); clean(t.guidance);
      if (t.starter) { expect(allText).toContain(t.starter.quote); clean(t.starter.say); }
    }
    expect(tips[3]!.calm).toBe("Shall we have some tea and talk about your mother's saag?");
    expect(parent.guidance).toContain("Don't correct her");
  });
});

describe("Memory Lane", () => {
  it("builds slides from her own stories: verbatim, at most 45 words, one telling per story", async () => {
    const lane = await memoryLane(ctx);
    expect(lane.say).toBe(P.memoryLaneIntro("Gurdev"));
    expect(lane.slides.length).toBeGreaterThan(2);
    expect(lane.slides.length).toBeLessThanOrEqual(5);
    const texts = [...STORIES, ...RETELLINGS].map((s) => s.text);
    for (const s of lane.slides) {
      expect(texts.some((t) => t.includes(s.words)), s.words).toBe(true);
      expect(wordCount(s.words)).toBeLessThanOrEqual(45);
      expect(s.prompt).toBe(P.memoryLanePrompt(s.topic));
      clean(s.prompt);
    }
    expect(new Set(lane.slides.map((s) => s.sessionId)).size).toBe(lane.slides.length);
    expect(lane.slides.some((s) => s.photo)).toBe(true);
    expect(lane.music).toBe("old Hindi and Punjabi film songs");
  });

  it("shows Aman's memory beside her saag story", async () => {
    const saag = (await memoryLane(ctx)).slides.find((s) => s.words.includes("saag"));
    expect(saag?.voice).toMatchObject({ name: "Aman" });
  });
});

describe("care follow-through: prepared for approval, never acted on alone", () => {
  it("prepares five steps from the change card, once", async () => {
    const plan = await ensureCarePlan(ctx);
    expect(plan.map((a) => a.kind)).toEqual(["summary", "questions", "appointment", "memory_book", "tablet_check"]);
    expect(plan.every((a) => a.status === "proposed" && a.simulated)).toBe(true);
    expect(plan[1]!.items).toHaveLength(4);
    expect(plan[4]!.items).toContain("BP tablet · 8:00, 20:00");
    for (const a of plan) {
      clean(a.title); clean(a.detail); a.items.forEach(clean);
      expect(P.findBanned([a.detail, ...a.items].join(" "), P.BANNED_MEDICINE), a.kind).toEqual([]);
    }
    expect((await ensureCarePlan(ctx)).map((a) => a.id)).toEqual(plan.map((a) => a.id));
  });

  it("offers the calendar invitation only after the family approves the check-up", async () => {
    const plan = await ensureCarePlan(ctx);
    await expect(careCalendar(ctx, plan[0]!.planId)).rejects.toThrow("approve the check-up step first");
    await decideCare(ctx, plan[2]!.id, true);
    const ics = await careCalendar(ctx, plan[0]!.planId);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Check-up for Gurdev (bring the Recollect report)");
    expect(ics).toContain("DTSTART:20261014T050000Z"); // Wednesday 10:30 in Patiala
    expect((await ctx.graph.get<CareAction>("CareAction", plan[2]!.id))?.status).toBe("approved");
  });

  it("the memory book holds her non-private words, escaped, with family memories beside them", async () => {
    await rememberStory(ctx, { text: "A <b>secret</b> about the tin box.", queued: false });
    await keepPrivate(ctx);
    const html = await memoryBookHtml(ctx);
    expect(html).toContain("My mother made sarson ka saag every winter.");
    expect(html).toContain("Every winter Biji made saag for all of us.");
    expect(html).not.toContain("secret");
  });

  it("there is no plan without a change card, and delete everything removes it", async () => {
    await ensureCarePlan(ctx);
    await deleteEverything(ctx);
    expect(await ctx.graph.find("CareAction")).toEqual([]);
    expect(await ctx.graph.find("RecentRecall")).toEqual([]);
    expect(await ensureCarePlan(ctx)).toEqual([]);
  });
});

describe("new wording", () => {
  it("passes the banned lists", () => {
    const all = [
      P.fromFamilyWords("q", "Aman", "1 May 2026"), P.familyMemorySaved("Gurdev"), P.messageFrom("Aman", "hi"),
      P.messageSaved("Gurdev"), P.todayChatPrompt("Gurdev"), P.todayChatThanks(), P.memoryLaneIntro("Gurdev"),
      P.memoryLanePrompt("Patiala"), P.memoryLaneEmpty(), P.recentVsOld("Gurdev", 5, 12, 4.4), P.recentNotReady("Gurdev"),
      P.retellSummary("Gurdev", 2, 4), P.coachStarter("her mother", "q", "1 May 2026"),
      ...Object.values(P.COACH).flatMap((c) => [c.title, c.guidance]), ...Object.values(P.CARE_TITLES),
      P.careSummary("Gurdev", "x", 72, 12), P.careAppointment("Gurdev"), P.careMemoryBook("Gurdev", 6),
      P.careTabletCheck("Simran"),
    ];
    for (const s of all) clean(s);
    for (const s of [P.careTabletCheck("Simran"), P.careAppointment("Gurdev")])
      expect(P.findBanned(s, P.BANNED_MEDICINE)).toEqual([]);
  });
});

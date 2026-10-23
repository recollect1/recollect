// Ask Biji (family questions), good morning, missed tablets, weekly digest, carer check-in and the
// life timeline. Offline: in-memory graph, hashing embedder, word-overlap reranker.
import { beforeEach, describe, expect, it } from "vitest";
import type { Ctx } from "../src/ctx.ts";
import * as D from "../src/daily.ts";
import { carerCheckin, carerView, missedDoses, weeklyDigest } from "../src/digest.ts";
import { HashEmbedder } from "../src/embed.ts";
import { deleteEverything, FamilyError } from "../src/family.ts";
import { MemoryGraph } from "../src/graph.ts";
import { setLanguage } from "../src/lang.ts";
import { BANNED_MEDICINE_HI, HI } from "../src/phrases-hi.ts";
import * as P from "../src/phrases.ts";
import { askQuestion, familyQuestion, familyQuestions, questionDue, removeQuestion } from "../src/questions.ts";
import { LexicalReranker } from "../src/rerank.ts";
import { seed } from "../src/seed/index.ts";
import { keepPrivate, rememberStory } from "../src/stories.ts";
import { DemoClock } from "../src/time.ts";
import { lifeTimeline, setStoryEra } from "../src/timeline.ts";

// Tuesday 13 October 2026, household time (IST).
const ist = (hhmm: string, day = "2026-10-13") => new Date(`${day}T${hhmm}:00+05:30`);
const clean = (s: string) => {
  expect(P.findBanned(s, P.BANNED_CLAIMS), s).toEqual([]);
  expect(s).not.toMatch(/undefined|null|NaN|\{|\}/);
};

let ctx: Ctx;
let clock: DemoClock;
beforeEach(async () => {
  clock = new DemoClock();
  clock.set(ist("09:00"));
  ctx = await seed(new MemoryGraph(), clock, new HashEmbedder(), new LexicalReranker());
});

describe("Ask Biji: questions from the family", () => {
  it("is asked once, in the afternoon window, and her answer is kept verbatim, linked to the question", async () => {
    const { say } = await askQuestion(ctx, "Aman", "What was your wedding day like?");
    expect(say).toBe(P.questionQueued("Gurdev"));
    expect(await questionDue(ctx)).toBe(false); // 09:00: not the calm afternoon window
    clock.set(ist("15:20"));
    expect(await questionDue(ctx)).toBe(true);
    expect((await D.routineState(ctx)).questionDue).toBe(true);

    const asked = await familyQuestion(ctx);
    expect(asked.say).toBe(P.familyQuestionPrompt("Aman", "What was your wedding day like?"));
    expect(await questionDue(ctx)).toBe(false); // at most once a day

    const text = "It rained all morning. My mother tied my dupatta twice because her hands were shaking.";
    const answered = await familyQuestion(ctx, text);
    expect(answered.say).toBe(P.familyQuestionThanks("Aman"));
    const [q] = await familyQuestions(ctx);
    expect(q).toMatchObject({ status: "answered", askerName: "Aman" });
    expect(q!.answer).toEqual([
      "It rained all morning.", "My mother tied my dupatta twice because her hands were shaking.",
    ]);
    // It is one of her stories now, titled with the question, and on her timeline.
    const t = await lifeTimeline(ctx, "family");
    const ev = t.events.find((e) => e.id === answered.sessionId)!;
    expect(ev.title).toBe("What was your wedding day like?");
    expect(ev.answers).toEqual({ question: "What was your wedding day like?", asker: "Aman" });
  });

  it("'not now' leaves the question for another day; a kept-private answer is not shown to the family", async () => {
    await askQuestion(ctx, "p-aman", "Who taught you to cook?");
    clock.set(ist("15:20"));
    await familyQuestion(ctx); // asked, she said not now (the simulator then says questionLater)
    clock.set(ist("15:20", "2026-10-14"));
    expect(await questionDue(ctx)).toBe(true);
    await familyQuestion(ctx);
    await familyQuestion(ctx, "My mother taught me, standing next to her at the chulha every winter.");
    await keepPrivate(ctx);
    const [q] = await familyQuestions(ctx);
    expect(q!.status).toBe("answered");
    expect(q!.answer).toEqual([]);
  });

  it("checks who is asking and what; removes unanswered questions; Hindi prompt", async () => {
    await expect(askQuestion(ctx, "Gurdev", "Hello there")).rejects.toBeInstanceOf(FamilyError);
    await expect(askQuestion(ctx, "Aman", "?")).rejects.toBeInstanceOf(FamilyError);
    await expect(askQuestion(ctx, "Aman", "x".repeat(201))).rejects.toBeInstanceOf(FamilyError);
    const { question } = await askQuestion(ctx, "Simran", "Where did you go to school?");
    await removeQuestion(ctx, question.id);
    expect(await familyQuestions(ctx)).toEqual([]);
    expect((await familyQuestion(ctx)).say).toBe(P.noFamilyQuestion());
    await setLanguage(ctx, "hi");
    await askQuestion(ctx, "Aman", "आपकी शादी का दिन कैसा था?");
    expect((await familyQuestion(ctx)).say).toBe(HI.familyQuestionPrompt("Aman", "आपकी शादी का दिन कैसा था?"));
  });
});

describe("Good morning", () => {
  it("greets her with today's sentence in the morning window, the same words every time, without logging an ask", async () => {
    const a = await D.routineState(ctx);
    const b = await D.routineState(ctx);
    expect(a.greeting).toBe(P.goodMorning("Gurdev", (await D.whatsToday(ctx)).say));
    expect(b.greeting).toBe(a.greeting);
    expect((await D.familySummary(ctx)).repeatedQuestions).toEqual([]); // one whats_today ask, from the line above
    clock.set(ist("13:00"));
    expect((await D.routineState(ctx)).greeting).toBeUndefined();
    await setLanguage(ctx, "hi");
    clock.set(ist("08:30"));
    expect((await D.routineState(ctx)).greeting!.startsWith("सुप्रभात, Gurdev जी। आज मंगलवार है")).toBe(true);
  });
});

describe("Family: missed tablets, weekly digest, carer check-in", () => {
  it("lists a tablet as not marked only an hour after its time, never advising", async () => {
    clock.set(ist("08:30"));
    expect(await missedDoses(ctx)).toEqual([]);
    clock.set(ist("09:05"));
    const missed = await missedDoses(ctx);
    expect(missed.map((m) => `${m.medicine} ${m.time}`)).toEqual(["BP tablet 8:00", "sugar tablet 8:00"]);
    for (const m of missed) {
      clean(m.say);
      expect(P.findBanned(m.say, P.BANNED_MEDICINE)).toEqual([]);
    }
    clock.set(ist("08:10"));
    await D.logDose(ctx, "BP tablet");
    clock.set(ist("09:05"));
    expect((await missedDoses(ctx)).map((m) => m.medicine)).toEqual(["sugar tablet"]);
  });

  it("weekly digest: stories, family memories, answered questions, tablets and top repeats", async () => {
    clock.set(ist("10:00", "2026-09-30")); // the week of the seeded retelling of the well story (28 Sep)
    for (let i = 0; i < 3; i++) await D.whereIs(ctx, "Aman");
    const d = await weeklyDigest(ctx);
    expect(d.stories).toBe(1); // the well story, told again on 28 Sep
    expect(d.topQuestions).toEqual([{ label: "where Aman is", count: 3 }]);
    expect(d.say).toContain("This week Gurdev told 1 story.");
    expect(d.say).toContain("where Aman is (asked 3 times this week)");
    expect(d.taken).toBeLessThanOrEqual(d.scheduled);
    clean(d.say);
  });

  it("carer check-in: once a week, fixed replies, no medical claims", async () => {
    expect((await carerView(ctx)).due).toBe(true);
    const v = await carerCheckin(ctx, "tired");
    expect(v.due).toBe(false);
    expect(v.reply).toBe(P.CARER_REPLIES.tired);
    await expect(carerCheckin(ctx, "fine")).rejects.toBeInstanceOf(FamilyError);
    for (const r of Object.values(P.CARER_REPLIES)) clean(r);
    clock.set(ist("09:00", "2026-10-20"));
    expect((await carerView(ctx)).due).toBe(true);
  });
});

describe("Life timeline", () => {
  it("places stories by her own year, else the family's, never a guess; quotes are verbatim", async () => {
    const t = await lifeTimeline(ctx, "family");
    const by = (k: string) => t.events.filter((e) => e.storyKey === k);
    expect(by("patiala")[0]).toMatchObject({ year: 1966, yearSource: "said", title: "Arriving in Patiala after the wedding" });
    expect(by("patiala")[0]!.yearQuote).toBe("I came to Patiala in 1966, two days after my wedding.");
    expect(by("radio")[0]).toMatchObject({ year: 1968, yearSource: "said" });
    expect(by("saag")[0]).toMatchObject({ year: 1954, yearSource: "family", yearBy: "Simran" });
    // The retold well story sits with the first telling and points at it.
    const [first, again] = by("well");
    expect(again!.retellOf).toBe(first!.id);
    expect(again!.year).toBe(first!.year);
    // Aman's memory hangs off the saag story, in his words.
    expect(by("saag")[0]!.voices[0]).toMatchObject({ name: "Aman" });
    // Threads: things named in more than one story.
    expect(t.threads.some((th) => th.name === "Patiala")).toBe(true);
    expect(t.from).toBe(1954);
    for (const e of t.events) for (const q of e.quotes) expect(typeof q).toBe("string");
  });

  it("a new live story appears undated until the family confirms a year; private stories stay hidden from the family", async () => {
    const { sessionId } = await rememberStory(ctx, { text: "We had a big peepal tree in the village and we sat under it in summer." });
    let ev = (await lifeTimeline(ctx, "family")).events.find((e) => e.id === sessionId)!;
    expect(ev).toMatchObject({ year: null, yearSource: null, title: "We had a big peepal tree in…" });
    await setStoryEra(ctx, sessionId, { year: 1957, title: "The peepal tree" });
    ev = (await lifeTimeline(ctx, "family")).events.find((e) => e.id === sessionId)!;
    expect(ev).toMatchObject({ year: 1957, yearSource: "family", yearBy: "Simran", title: "The peepal tree" });
    await setStoryEra(ctx, sessionId, { year: null });
    expect((await lifeTimeline(ctx, "family")).events.find((e) => e.id === sessionId)!.year).toBeNull();
    await expect(setStoryEra(ctx, sessionId, { year: 2099 })).rejects.toBeInstanceOf(FamilyError);
    await keepPrivate(ctx);
    expect((await lifeTimeline(ctx, "family")).events.some((e) => e.id === sessionId)).toBe(false);
    expect((await lifeTimeline(ctx, "elder")).events.some((e) => e.id === sessionId)).toBe(true);
  });

  it("delete everything removes questions and check-ins too", async () => {
    await askQuestion(ctx, "Aman", "What was your wedding day like?");
    await carerCheckin(ctx, "ok");
    await deleteEverything(ctx);
    expect(await familyQuestions(ctx)).toEqual([]);
    expect((await carerView(ctx)).due).toBe(true);
    expect((await lifeTimeline(ctx, "family")).events).toEqual([]);
  });

  it("new spoken templates are free of banned claims (English and Hindi)", () => {
    for (const s of [
      P.familyQuestionPrompt("Aman", "q"), P.familyQuestionThanks("Aman"), P.questionLater(), P.noFamilyQuestion(),
      P.goodMorning("Gurdev", "It's Tuesday."), HI.familyQuestionPrompt("Aman", "q"), HI.familyQuestionThanks("Aman"),
      HI.questionLater(), HI.noFamilyQuestion(), HI.goodMorning("Gurdev", "आज मंगलवार है।"),
      P.questionQueued("Gurdev"), P.questionAnswered("Gurdev", "Aman"), P.CARER_PROMPT("Simran"),
    ]) {
      clean(s);
      expect(P.findBanned(s, BANNED_MEDICINE_HI)).toEqual([]);
    }
  });
});

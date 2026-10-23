// Her first language: what she hears in Hindi. Same rules as English: fixed wording, the same
// answer every time, no medicine advice, quotes never translated, family views stay English.
import { beforeEach, describe, expect, it } from "vitest";
import type { Ctx } from "../src/ctx.ts";
import * as D from "../src/daily.ts";
import { HashEmbedder } from "../src/embed.ts";
import { todayChat } from "../src/fidelity.ts";
import { MemoryGraph } from "../src/graph.ts";
import { langOf, setLanguage } from "../src/lang.ts";
import { nightReassure } from "../src/night.ts";
import { BANNED_MEDICINE_HI, HI } from "../src/phrases-hi.ts";
import * as P from "../src/phrases.ts";
import { recall } from "../src/recall.ts";
import { LexicalReranker } from "../src/rerank.ts";
import { seed } from "../src/seed/index.ts";
import { keepPrivate, rememberStory } from "../src/stories.ts";
import { DemoClock } from "../src/time.ts";
import type { Household } from "../src/types.ts";

// Tuesday 13 October 2026, household time (IST).
const ist = (hhmm: string, day = "2026-10-13") => new Date(`${day}T${hhmm}:00+05:30`);
const clean = (s: string) => {
  expect(P.findBanned(s, P.BANNED_CLAIMS), s).toEqual([]);
  expect(s).not.toMatch(/undefined|null|NaN|\{|\}/);
};
const medicineSafe = (s: string) => {
  clean(s);
  expect(P.findBanned(s, P.BANNED_MEDICINE), s).toEqual([]);
  expect(P.findBanned(s, BANNED_MEDICINE_HI), s).toEqual([]);
};

let ctx: Ctx;
let clock: DemoClock;
beforeEach(async () => {
  clock = new DemoClock();
  clock.set(ist("09:00"));
  ctx = await seed(new MemoryGraph(), clock, new HashEmbedder(), new LexicalReranker());
  await setLanguage(ctx, "hi");
});

describe("Hindi: what she hears", () => {
  it("is a household setting, kept in the graph, English by default", async () => {
    expect(langOf(ctx)).toBe("hi");
    expect((await ctx.graph.get<Household>("Household", ctx.household.id))?.lang).toBe("hi");
    await setLanguage(ctx, "en");
    expect((await D.whatsToday(ctx)).say).toMatch(/^It's Tuesday, 13 October\./);
  });

  it("dose check and log use fixed Hindi wording, never advice, and understand Hindi names", async () => {
    clock.set(ist("08:10"));
    const logged = await D.logDose(ctx, "बीपी की गोली");
    expect(logged.say).toBe(HI.doseLogged("BP की गोली", "8:10"));
    clock.set(ist("09:00"));
    const taken = await D.checkDose(ctx, "BP tablet");
    expect(taken.say).toBe(HI.doseTaken("BP की गोली", "8:10"));
    const again = await D.logDose(ctx, "bp ki goli");
    expect(again.say).toBe(HI.doseAlreadyLogged("BP की गोली", "8:10", "Simran"));
    const sugar = await D.checkDose(ctx, "शुगर की गोली");
    expect(sugar.say).toBe(HI.doseNotYet("शुगर की गोली", "8:00"));
    const unknown = await D.checkDose(ctx, "vitamin");
    for (const s of [logged.say, taken.say, again.say, sugar.say, unknown.say]) medicineSafe(s);
    for (const s of [HI.nextDose("BP की गोली", "20:00"), HI.noMoreDoses(), HI.medicineUnknown("Simran")]) medicineSafe(s);
  });

  it("what's today: Hindi day and month names, visitors and the next tablet", async () => {
    const { say, card } = await D.whatsToday(ctx);
    expect(say).toBe("आज मंगलवार है, 13 अक्तूबर। 10:00 बजे Harpreet आने वाले हैं। आपकी अगली गोली BP की गोली है, 8:00 बजे।");
    expect(card.weekday).toBe("Tuesday"); // the card on screen stays as before
    medicineSafe(say);
  });

  it("where is Aman: the same calm Hindi answer every time, with his message", async () => {
    const answers = await Promise.all([1, 2, 3].map(() => D.whereIs(ctx, "अमन")));
    expect(new Set(answers.map((a) => a.say)).size).toBe(1);
    expect(answers[0]!.say).toBe("Aman लंदन में हैं और रविवार को आपको फ़ोन करते हैं।");
    clean(answers[0]!.say);
  });

  it("who is: Hindi for her, English for the family", async () => {
    expect((await D.whoIs(ctx, { name: "Aman" }, "elder")).say)
      .toBe("ये Aman हैं, आपका पोता, सिमरन का बेटा। Aman लंदन में हैं और रविवार को आपको फ़ोन करते हैं।");
    expect((await D.whoIs(ctx, { name: "Aman" }, "family")).say).toBe(
      P.whoIs("Aman", "grandson, Simran's son", P.personStatus("Aman", "is in London and calls you on Sundays")));
    expect((await D.whoIs(ctx, { name: "Kuldeep" }, "elder")).say).toBe(HI.whoIsUnknown("Simran"));
  });

  it("memory answers: a Hindi frame around her exact words, never translated; nothing saved in Hindi", async () => {
    const r = await recall(ctx, "My mother made sarson ka saag every winter.", "elder");
    expect(r.found).toBe(true);
    expect(r.say.startsWith("आपने 14 सितंबर 2026 को मुझे बताया था: \"My mother made sarson ka saag every winter.")).toBe(true);
    const fam = await recall(ctx, "My mother made sarson ka saag every winter.", "family");
    expect(fam.say.startsWith("Gurdev said on 14 September 2026:")).toBe(true);
    expect((await recall(ctx, "What was my school like?", "elder")).say).toBe(HI.nothingRecorded("that"));
  });

  it("a story told in Hindi is kept word for word, split at the danda", async () => {
    const text = "हमारे गाँव में एक बड़ा पीपल का पेड़ था। गर्मियों में हम सब उसके नीचे बैठते थे।";
    const saved = await rememberStory(ctx, { text });
    expect(saved.say).toBe(HI.storySaved());
    const quotes = await ctx.graph.find<{ text: string; sessionId: string }>("Quote", { sessionId: saved.sessionId });
    expect(quotes.map((q) => q.text).sort()).toEqual(["गर्मियों में हम सब उसके नीचे बैठते थे।", "हमारे गाँव में एक बड़ा पीपल का पेड़ था।"]);
    expect((await keepPrivate(ctx)).say).toBe(HI.privateKept());
  });

  it("evening greeting, night reassurance with a Hindi place, day chat and pausing tracking", async () => {
    clock.set(ist("17:05"));
    expect((await D.routineState(ctx)).greeting)
      .toBe("शाम हो गई है, Gurdev जी। चलिए चाय पीते हैं और आपकी माँ के साग की बातें करते हैं?");
    clock.set(ist("03:00"));
    const night = await nightReassure(ctx, "मुझे बाज़ार जाना है");
    expect(night.say).toBe(`${HI.nightReassure("Gurdev")} ${HI.nightPlaceReassure("बाज़ार")}`);
    clean(night.say);
    const out = await nightReassure(ctx, "मैं बाहर जा रही हूँ");
    expect(out.alert).toBeTruthy(); // "I'm going out" in Hindi alerts the family at once
    clock.set(ist("11:00"));
    expect((await todayChat(ctx)).say).toBe(HI.todayChatPrompt("Gurdev"));
    expect((await todayChat(ctx, "हरप्रीत आई थी, हमने चाय पी")).say).toBe(HI.todayChatThanks());
    expect((await D.pauseTracking(ctx)).say).toBe(HI.trackingPaused("Simran"));
  });

  it("Hindi medicine templates never advise; no Hindi template makes a banned claim", () => {
    const outs = [
      HI.doseTaken("BP की गोली", "8:10"), HI.doseNotYet("BP की गोली", "20:00"), HI.doseLogged("BP की गोली", "8:10"),
      HI.doseAlreadyLogged("BP की गोली", "8:10", "Simran"), HI.medicineUnknown("Simran"), HI.nextDose("BP की गोली", "20:00"),
      HI.noMoreDoses(),
    ];
    for (const s of outs) medicineSafe(s);
    const other = [
      HI.storySaved(), HI.privateKept(), HI.nothingRecorded("that"), HI.trackingPaused("Simran"),
      HI.eveningHello("Gurdev", "चलिए चाय पीते हैं?"), HI.nightReassure("Gurdev"), HI.goingOutDaytime("Simran"),
      HI.nightPlaceReassure("बाज़ार"), HI.todayChatPrompt("Gurdev"), HI.todayChatThanks(),
      HI.messageFrom("Aman", "नमस्ते बीजी"), HI.fromTheirWords("q", "Gurdev", "3 अगस्त 2026"),
    ];
    for (const s of other) clean(s);
  });
});

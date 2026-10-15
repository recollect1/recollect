// Night reassurance and family alert (§9.4 P1, §15 routine tests, scenario K).
import { beforeEach, describe, expect, it } from "vitest";
import type { Ctx } from "../src/ctx.ts";
import { familySummary, routineState } from "../src/daily.ts";
import { HashEmbedder } from "../src/embed.ts";
import { MemoryGraph } from "../src/graph.ts";
import { familyAlerts, nightReassure, placeIn } from "../src/night.ts";
import * as P from "../src/phrases.ts";
import { LexicalReranker } from "../src/rerank.ts";
import { seed } from "../src/seed/index.ts";
import { DemoClock } from "../src/time.ts";
import type { Device } from "../src/types.ts";

let ctx: Ctx;
let clock: DemoClock;
const ist = (hhmm: string) => new Date(`2026-10-14T${hhmm}:00+05:30`);
beforeEach(async () => {
  clock = new DemoClock();
  clock.set(ist("03:00"));
  ctx = await seed(new MemoryGraph(), clock, new HashEmbedder(), new LexicalReranker());
});

describe("night reassurance", () => {
  it("finds the place she names", () => {
    expect(placeIn("I need to go to the market")).toBe("market");
    expect(placeIn("I have to go home to the village")).toBe("home");
    expect(placeIn("what time is it")).toBeUndefined();
  });

  it("03:00, 'I need to go to the market': calm reassurance, night light dim, no alert yet", async () => {
    const r = await nightReassure(ctx, "I need to go to the market");
    expect(r.say).toBe(`${P.nightReassure("Gurdev")} ${P.nightPlaceReassure("market")}`);
    expect(r.alert).toBeUndefined();
    const light = (await ctx.graph.find<Device>("Device", { room: "bedroom", kind: "light" }))[0];
    expect(light?.state).toBe("dim");
  });

  it("two such asks within 30 minutes raise exactly one family alert", async () => {
    await nightReassure(ctx, "I need to go to the market");
    clock.set(ist("03:10"));
    const second = await nightReassure(ctx, "I must go to the market now");
    expect(second.alert?.say).toContain("wanted to go to the market");
    expect(second.alert?.say).toContain(P.NOT_EMERGENCY);
    clock.set(ist("03:15"));
    expect((await nightReassure(ctx, "the market, I need the market")).alert).toBeUndefined();
    expect(await familyAlerts(ctx)).toHaveLength(1);
    // She hears the same calm words every time (§1.4).
    expect(second.say).toBe(`${P.nightReassure("Gurdev")} ${P.nightPlaceReassure("market")}`);
  });

  it("escalates even when the demo clock is frozen (two asks at the same instant)", async () => {
    await nightReassure(ctx, "I need to go to the market");
    expect((await nightReassure(ctx, "I need to go to the market")).alert).toBeDefined();
  });

  it("asks more than 30 minutes apart do not escalate", async () => {
    await nightReassure(ctx, "I need to go to the market");
    clock.set(ist("03:45"));
    expect((await nightReassure(ctx, "I need to go to the market")).alert).toBeUndefined();
  });

  it("'I'm going out' alerts the family at once", async () => {
    const r = await nightReassure(ctx, "I'm going out");
    expect(r.alert?.say).toContain("wanted to go out");
  });

  it("in the daytime there is no night wording and no alert", async () => {
    clock.set(ist("11:00"));
    const r = await nightReassure(ctx, "I'm going out to the market");
    expect(r).toEqual({ say: P.goingOutDaytime("Simran"), night: false });
    expect(await familyAlerts(ctx)).toEqual([]);
  });

  it("the routine is 'night' at 03:00 and the asks reach the family summary", async () => {
    expect((await routineState(ctx)).routine).toBe("night");
    await nightReassure(ctx, "I need to go to the market");
    await nightReassure(ctx, "I need to go to the market");
    const s = await familySummary(ctx);
    expect(s.repeatedQuestions).toContainEqual({ label: "about going out at night", count: 2 });
  });
});

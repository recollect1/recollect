import { describe, expect, it } from "vitest";
import * as P from "../src/phrases.ts";

const medicine = [
  P.doseTaken("BP tablet", "8:10"),
  P.doseNotYet("BP tablet", "20:00"),
  P.doseLogged("BP tablet", "8:10"),
  P.doseAlreadyLogged("BP tablet", "8:10", "Simran"),
  P.medicineUnknown("Simran"),
  P.nextDose("calcium tablet", "14:00"),
  P.noMoreDoses(),
  P.today("Tuesday", 13, "October", P.visitorComes("Harpreet", "10:00"), P.nextDose("BP tablet", "20:00")),
  P.familySummary("Gurdev", 2, 4, 1, [P.repeatLine("where Aman is", 3)]),
];
const allMetrics = Object.keys(P.CHANGE_PHRASES);
const everything = [
  ...medicine,
  P.fromTheirWords("I came to Patiala in 1966.", "Gurdev", "3 August 2026"),
  P.fromTheirWords("I came to Patiala in 1966.", "Gurdev", "3 August 2026", "family"),
  P.nothingRecorded("that"),
  P.storySaved(), P.privateKept(), P.storyPromptFor("your brother Jagdish"), P.storyPromptOpen(),
  P.today("Sunday", 18, "October", P.visitorCalls("Aman"), P.noMoreDoses()),
  P.today("Sunday", 18, "October", P.noVisitors(), P.noMoreDoses()),
  P.personStatus("Aman", "is in London and calls you on Sundays"),
  P.whoIs("Aman", "grandson, Simran's son", "Aman is in London."), P.whoIs("Aman", "grandson"),
  P.whoIsUnknown("Simran"), P.trackingPaused("Simran"),
  P.eveningHello("Gurdev", "Shall we put on your music?"), P.nightReassure("Gurdev"),
  P.nightPlaceReassure("market"), P.weeklyPhotoPrompt("Gurdev"), P.photoThanks(), P.noPhotoYet("Simran"),
  P.trendStable("Gurdev", 8), P.trendChange("Gurdev", allMetrics, "August"),
  P.trendNotReady("Gurdev"), P.trackingOff("Gurdev"), P.REPEATS_NORMAL,
  P.thisIsMeReady("Gurdev"), P.thisIsMeMissing("Gurdev"),
];

describe("phrases", () => {
  it("never uses a banned claim (§1.2)", () => {
    for (const s of everything) expect(P.findBanned(s, P.BANNED_CLAIMS), s).toEqual([]);
  });
  it("medicine wording never uses a banned word (§1.5)", () => {
    for (const s of medicine) expect(P.findBanned(s, P.BANNED_MEDICINE), s).toEqual([]);
  });
  it("trend lines carry the not-a-medical-assessment line", () => {
    for (const s of [P.trendStable("G", 8), P.trendChange("G", ["mattr"], "August"), P.trendNotReady("G")])
      expect(s).toContain(P.NOT_MEDICAL);
  });
  it("matches the spec wording", () => {
    expect(P.doseTaken("BP tablet", "8:10")).toBe("Yes, you took your BP tablet at 8:10 today.");
    expect(P.nothingRecorded("that")).toBe(
      "I don't have anything saved about that yet. Would you like to tell me about it?");
    expect(P.trendChange("Gurdev", ["mean_pause_s", "named_recall"], "August")).toBe(
      "Since August, Gurdev pauses longer and names familiar people less often. " +
      "Worth mentioning at the next check-up. This is not a medical assessment.");
  });
  it("produces no empty placeholders", () => {
    for (const s of everything) expect(s).not.toMatch(/undefined|null|\{|\}|  /);
  });
});

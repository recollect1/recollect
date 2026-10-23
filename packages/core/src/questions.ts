// "Ask Biji": family members leave questions; Recollect asks her one at a calm time of day, at most
// once a day, and keeps her answer verbatim as a story linked to the question (state across
// sessions). The question is the family's own words, read to her with their name; nothing is
// generated. She is never pressed: "not now" leaves it for another day.
import type { Ctx } from "./ctx.ts";
import { findPerson } from "./daily.ts";
import { FamilyError } from "./family.ts";
import { voice } from "./lang.ts";
import * as P from "./phrases.ts";
import { rememberStory } from "./stories.ts";
import { newId } from "./text.ts";
import { localDayBounds, minutesOfDay, parseHHMM } from "./time.ts";
import type { FamilyQuestion, Person, Quote } from "./types.ts";

/** A calm part of the afternoon, before the evening routine starts at 17:00. */
export const QUESTION_WINDOW = ["15:00", "16:30"] as const;
const MAX_QUESTION = 200;

export interface QuestionView extends FamilyQuestion {
  askerName: string; askerRelation: string;
  /** Her answer, verbatim sentences, once she has answered. */
  answer?: string[];
}

export async function askQuestion(ctx: Ctx, from: string, text: string): Promise<{ say: string; question: FamilyQuestion }> {
  const asker = (await ctx.graph.get<Person>("Person", from)) ?? (await findPerson(ctx, from));
  if (!asker || asker.id === ctx.elder.id) throw new FamilyError("Choose a family member to ask the question.");
  const clean = text.trim();
  if (clean.length < 3) throw new FamilyError("Write the question you would like to ask.");
  if (clean.length > MAX_QUESTION) throw new FamilyError(`Keep the question under ${MAX_QUESTION} characters.`);
  const question: FamilyQuestion = {
    id: newId("fq"), askedById: asker.id, text: clean, createdAt: ctx.clock.now().toISOString(), status: "open",
  };
  await ctx.graph.upsert("FamilyQuestion", { ...question });
  await ctx.graph.link(["Person", asker.id], "WANTS_TO_KNOW", ["FamilyQuestion", question.id]);
  return { say: P.questionQueued(ctx.elder.name), question };
}

export async function familyQuestions(ctx: Ctx): Promise<QuestionView[]> {
  const [questions, people] = await Promise.all([
    ctx.graph.find<FamilyQuestion>("FamilyQuestion"), ctx.graph.find<Person>("Person"),
  ]);
  const out: QuestionView[] = [];
  for (const q of questions.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))) {
    const asker = people.find((p) => p.id === q.askedById);
    const view: QuestionView = { ...q, askerName: asker?.name ?? "Someone", askerRelation: asker?.relation ?? "" };
    if (q.answerSessionId) {
      const quotes = (await ctx.graph.find<Quote>("Quote", { sessionId: q.answerSessionId }))
        .filter((x) => !x.private).sort((a, b) => a.seq - b.seq);
      view.answer = quotes.map((x) => x.text);
    }
    out.push(view);
  }
  return out;
}

export async function removeQuestion(ctx: Ctx, id: string): Promise<void> {
  const q = await ctx.graph.get<FamilyQuestion>("FamilyQuestion", id);
  if (!q) throw new FamilyError("That question no longer exists.");
  if (q.status === "answered") throw new FamilyError("She has already answered this one; it stays with her stories.");
  await ctx.graph.remove("FamilyQuestion", id);
}

/** The next question to ask her: oldest first, including one she put off ("not now"). */
async function nextQuestion(ctx: Ctx): Promise<FamilyQuestion | undefined> {
  return (await ctx.graph.find<FamilyQuestion>("FamilyQuestion"))
    .filter((q) => q.status !== "answered")
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
}

/** True in the afternoon window when a question is waiting and none was asked today. */
export async function questionDue(ctx: Ctx): Promise<boolean> {
  const now = ctx.clock.now();
  const min = minutesOfDay(now, ctx.household.tz);
  if (min < parseHHMM(QUESTION_WINDOW[0]) || min >= parseHHMM(QUESTION_WINDOW[1])) return false;
  const all = await ctx.graph.find<FamilyQuestion>("FamilyQuestion");
  const { from, to } = localDayBounds(now, ctx.household.tz);
  if (all.some((q) => q.askedAt && q.askedAt >= from && q.askedAt < to)) return false;
  return all.some((q) => q.status !== "answered");
}

/**
 * Elder tool. Without an answer: read her the next family question (and note when it was asked).
 * With one: keep her words verbatim as a story answering the latest question she was asked.
 */
export async function familyQuestion(ctx: Ctx, answer?: string): Promise<{
  say: string; question?: { id: string; text: string; asker: string }; sessionId?: string; saved: boolean;
}> {
  const V = voice(ctx);
  const people = await ctx.graph.find<Person>("Person");
  const askerOf = (q: FamilyQuestion) => people.find((p) => p.id === q.askedById)?.name ?? ctx.admin.name;
  if (!answer?.trim()) {
    const q = await nextQuestion(ctx);
    if (!q) return { say: V.noFamilyQuestion(), saved: false };
    await ctx.graph.upsert("FamilyQuestion", { id: q.id, status: "asked", askedAt: ctx.clock.now().toISOString() });
    return { say: V.familyQuestionPrompt(askerOf(q), q.text), question: { id: q.id, text: q.text, asker: askerOf(q) }, saved: false };
  }
  const asked = (await ctx.graph.find<FamilyQuestion>("FamilyQuestion", { status: "asked" }))
    .sort((a, b) => ((a.askedAt ?? "") < (b.askedAt ?? "") ? 1 : -1))[0];
  if (!asked) {
    // No question was put to her: keep her words as an ordinary story.
    const saved = await rememberStory(ctx, { text: answer });
    return { say: saved.say, sessionId: saved.sessionId, saved: true };
  }
  const { sessionId } = await rememberStory(ctx, { text: answer });
  await ctx.graph.upsert("Session", { id: sessionId, title: asked.text });
  await ctx.graph.link(["Session", sessionId], "ANSWERS", ["FamilyQuestion", asked.id]);
  await ctx.graph.upsert("FamilyQuestion", {
    id: asked.id, status: "answered", answerSessionId: sessionId, answeredAt: ctx.clock.now().toISOString(),
  });
  return {
    say: V.familyQuestionThanks(askerOf(asked)), question: { id: asked.id, text: asked.text, asker: askerOf(asked) },
    sessionId, saved: true,
  };
}

// Recollect MCP tools, CLAUDE.md §10. No LLM call happens in any handler (§1.3): every `say`
// comes from packages/core phrase templates and stored quotes.
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  checkDose, familySummary, keepPrivate, localAt, logDose, pauseTracking, photoMoment, processSession,
  nightReassure, recall, rememberStory, routineState, speechTrend, storyPrompt, thisIsMe, whatsToday, whereIs, whoIs,
  logAsk, todayChat, memoryLane, carerCoach, ensureCarePlan, fidelityView, shareFamilyMemory, findPerson, phrases,
  askQuestion, familyQuestion, weeklyDigest, missedDoses, lifeTimeline, FamilyError,
  type Ctx,
} from "@recollect/core";
import { CARDS, cardHtml, type CardName } from "@recollect/ui-cards";
import { z, type ZodRawShape } from "zod";
import { sendAlertSms } from "./sms.ts";

export type ToolRole = "elder" | "family";
const SAY = "Read the `say` field exactly as written.";
const BOTH: ToolRole[] = ["elder", "family"];
// MCP annotations. readOnlyHint only where nothing is written: the elder's tools all log asks
// (silently, for the family view) or update routine/device state, so they are not read-only.
const READ_ONLY = new Set([
  "family_summary", "speech_trend", "this_is_me", "carer_coach", "memory_fidelity", "memory_lane", "weekly_digest",
  "life_timeline",
]);

export interface ToolLog { tool: string; ms: number; ok: boolean }
export interface ServerDeps {
  ctx: Ctx;
  /** Runs work after the tool has answered (embedding, retell markers). Never awaited by a tool. */
  background: (job: () => Promise<unknown>) => void;
  log: (line: ToolLog) => void;
}

type Payload = { say: string } & Record<string, unknown>;

export function buildServer(deps: ServerDeps, role: ToolRole): McpServer {
  const { ctx, background, log } = deps;
  const server = new McpServer({ name: "recollect", version: "0.1.0" });

  // MCP Apps cards (§10): single-file HTML resources; tools point at them with _meta.ui.resourceUri.
  for (const [name, uri] of Object.entries(CARDS) as [CardName, string][]) {
    registerAppResource(server, `${name} card`, uri, { description: `Recollect ${name} card` }, async () => ({
      contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: cardHtml(name) }],
    }));
  }

  function tool<S extends ZodRawShape>(
    name: string, roles: ToolRole[], description: string, inputSchema: S,
    run: (args: z.objectOutputType<S, z.ZodTypeAny>) => Promise<Payload>,
    card?: CardName,
  ): void {
    if (!roles.includes(role)) return;
    const handler = async (args: z.objectOutputType<S, z.ZodTypeAny>): Promise<CallToolResult> => {
      const t0 = performance.now();
      try {
        const payload = await run(args);
        const ms = Math.round(performance.now() - t0);
        log({ tool: name, ms, ok: true });
        return {
          content: [{ type: "text", text: payload.say }], structuredContent: payload,
          _meta: { "recollect/latencyMs": ms },
        };
      } catch (e) {
        const ms = Math.round(performance.now() - t0);
        log({ tool: name, ms, ok: false });
        console.error(e);
        return {
          content: [{ type: "text", text: "Recollect could not do that just now." }], isError: true,
          _meta: { "recollect/latencyMs": ms },
        };
      }
    };
    // The SDK's callback type is conditional on the schema generic; the shapes match at runtime.
    const _meta = card ? { ui: { resourceUri: CARDS[card] }, "ui/resourceUri": CARDS[card] } : undefined;
    const annotations = { readOnlyHint: READ_ONLY.has(name), openWorldHint: false };
    server.registerTool(name, { description: `${description} ${SAY}`, inputSchema, annotations, ...(_meta ? { _meta } : {}) }, handler as never);
  }

  tool("remember_story", ["elder"],
    "Save a story or memory she has just told, in her exact words. Pass everything she said, unedited. " +
    "Use when she tells you about her life, her family or her past.",
    {
      text: z.string().min(1).describe("Her words exactly as spoken, the whole story, in the language she used. Never translate."),
      private: z.boolean().optional().describe("True if she asked to keep this one to herself."),
      audioRef: z.string().optional().describe("Simulator only: reference to consented story-mode audio."),
    },
    async ({ text, private: priv, audioRef }) => {
      const { say, sessionId } = await rememberStory(ctx, {
        text, ...(priv === undefined ? {} : { private: priv }), ...(audioRef ? { audioRef } : {}),
      });
      background(() => processSession(ctx, sessionId));
      return { say, sessionId };
    });

  tool("recall_memory", BOTH,
    "Answer a question about her past using only what she has told Recollect before. Returns her own " +
    "words with the date she said them, or says that nothing is saved. Never add to or rephrase the answer.",
    { question: z.string().min(1).describe("The question as asked, in English: translate it if she asked in Hindi. The answer is still her own stored words.") },
    async ({ question }) => {
      const r = await recall(ctx, question, role);
      if (role === "elder") background(() => logAsk(ctx, "recall", question));
      return { say: r.say, found: r.found, quotes: r.quotes, speaker: r.speaker ?? ctx.elder.name };
    }, "story");

  tool("whats_today", ["elder"],
    "Tell her what day it is, who is coming today and which tablet is next. Use for 'what day is it' " +
    "and 'what is happening today', every time she asks.",
    {}, async () => {
      const r = await whatsToday(ctx);
      return { say: r.say, ...r.card, admin: ctx.admin.name };
    }, "today");

  tool("check_dose", ["elder"],
    "Answer 'did I take my tablet?' from today's log. Gives no advice about medicines.",
    { medicine: z.string().optional().describe("The tablet she named, in English, e.g. 'BP tablet' (for 'BP की गोली'). Omit if she did not say.") },
    async ({ medicine }) => ({ ...(await checkDose(ctx, medicine)) }));

  tool("log_dose", ["elder"],
    "Mark a tablet as taken when she says she has just taken it. Gives no advice about medicines.",
    {
      medicine: z.string().min(1).describe("The tablet she named, in English, e.g. 'BP tablet' (for 'BP की गोली')."),
      at: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe("Time taken today as HH:MM, if she gave one."),
    },
    async ({ medicine, at }) => ({
      ...(await logDose(ctx, medicine, at ? localAt(ctx.clock.now(), ctx.household.tz, at) : undefined)),
    }));

  tool("where_is", ["elder"],
    "Tell her where a family member or helper is, using the line her family wrote. Answer the same way " +
    "every time she asks.",
    { person: z.string().min(1).describe("Who she asked about, in English: a name or a relation such as 'my grandson' (for 'मेरा पोता').") },
    async ({ person }) => ({ ...(await whereIs(ctx, person)) }));

  tool("who_is", BOTH,
    "Tell her who someone is: their name and how they are related to her, with their photo.",
    {
      name: z.string().optional().describe("The name or relation she asked about, in English (e.g. 'Aman' for 'अमन')."),
      photoId: z.string().optional().describe("The photo on screen, if she asked 'who is this?'."),
    },
    async ({ name, photoId }) => ({ ...(await whoIs(ctx, { ...(name ? { name } : {}), ...(photoId ? { photoId } : {}) }, role)) }),
    "who");

  tool("night_reassure", ["elder"],
    "Use when she wants to go somewhere or leave the house, especially at night ('I need to go to the market', " +
    "'I'm going out'). Pass her words. Reassures her calmly; at night it turns on the night light and tells her " +
    "family if needed. Never argue with her or correct her.",
    { text: z.string().min(1).describe("What she said, exactly as spoken, in the language she used. Never translate.") },
    async ({ text }) => {
      const r = await nightReassure(ctx, text);
      if (r.alert) { const alert = r.alert; background(() => sendAlertSms(ctx, alert)); }
      return { say: r.say, night: r.night, alerted: Boolean(r.alert) };
    });

  tool("keep_private", ["elder"],
    "Keep the story she just told private, when she says 'keep this private' or 'don't tell anyone'.",
    {}, async () => ({ ...(await keepPrivate(ctx)) }));

  tool("pause_tracking", ["elder"],
    "Stop tracking changes in her speech when she asks, e.g. 'stop tracking my speech'.",
    {}, async () => ({ ...(await pauseTracking(ctx)) }));

  tool("story_prompt", BOTH,
    "Get a gentle question that invites her to tell a story. Use when the conversation goes quiet.",
    {}, async () => ({ ...(await storyPrompt(ctx)) }));

  tool("photo_moment", ["elder"],
    "The weekly photo. Call with no text to show this week's photo and invite her to describe it. Call " +
    "again with her words to save them. Never correct or quiz her about the photo.",
    { text: z.string().optional().describe("Her description of the photo, exactly as spoken, in the language she used.") },
    async ({ text }) => {
      const r = await photoMoment(ctx, text);
      const { sessionId } = r;
      if (sessionId) background(() => processSession(ctx, sessionId));
      return { ...r };
    }, "photo");

  tool("routine_state", BOTH,
    "The current home routine (evening, night or none), whether replies should be kept to one short " +
    "sentence, and the state of the lights and speaker.",
    {}, async () => {
      const r = await routineState(ctx);
      return { say: r.greeting ?? "", ...r };
    });

  tool("family_summary", ["family"],
    "For family: today's tablets, how many stories she told, and which questions she repeated. Counts " +
    "only, never private stories.",
    { date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("A day as YYYY-MM-DD. Defaults to today.") },
    async ({ date }) => ({ ...(await familySummary(ctx, date)) }));

  tool("speech_trend", ["family"],
    "For family: the latest stored note on how her speech compares with her own usual pattern. This is " +
    "not a medical assessment and must never be presented as one.",
    { weeks: z.number().int().positive().optional().describe("How many recent weeks the family wants to see.") },
    async () => ({ ...(await speechTrend(ctx)) }), "trend");

  tool("talk_about_today", ["elder"],
    "A gentle chat about her day. Call with no answer to ask her about it; call again with her words " +
    "exactly as spoken. She always hears the same thanks: never confirm, correct or quiz her about her day.",
    { answer: z.string().optional().describe("What she said about her day, exactly as spoken, in the language she used.") },
    async ({ answer }) => ({ ...(await todayChat(ctx, answer)) }));

  tool("memory_lane", ["elder"],
    "A short Memory Lane session: some of her own stories in her own words, with photos and a family " +
    "member's memory where there is one, and a gentle question on each. Use when she would like to look " +
    "back, or the conversation goes quiet. There are no right answers.",
    {}, async () => ({ ...(await memoryLane(ctx)) }), "lane");

  tool("share_family_memory", ["family"],
    "For family: keep a family member's own memory of one of her stories, in their words, linked to her " +
    "story. It is always attributed to them and never presented as hers.",
    {
      from: z.string().min(1).describe("Who is sharing it: their name or relation, e.g. 'Aman'."),
      text: z.string().min(1).describe("Their memory, exactly as they said it."),
      about: z.string().optional().describe("Which of her stories it is about, in a few words, e.g. 'the radio'."),
    },
    async ({ from, text, about }) => {
      const person = await findPerson(ctx, from);
      if (!person) return { say: phrases.whoIsUnknown(ctx.admin.name) };
      let aboutSessionId: string | undefined;
      if (about) {
        const r = await recall(ctx, about, "family");
        const hit = r.found && r.speaker === ctx.elder.name ? r.quotes[0]?.sessionId : undefined;
        aboutSessionId = hit;
      }
      const saved = await shareFamilyMemory(ctx, { personId: person.id, text, ...(aboutSessionId ? { aboutSessionId } : {}) });
      background(() => processSession(ctx, saved.sessionId));
      const say = about && !aboutSessionId ? `${saved.say} ${phrases.familyMemoryNoStory()}` : saved.say;
      return { say, sessionId: saved.sessionId, linked: Boolean(aboutSessionId) };
    });

  tool("carer_coach", ["family"],
    "For family: ideas for hard moments (asking for a parent, wanting to go out, repeated questions, " +
    "evenings), with conversation starters that quote her own stories.",
    {}, async () => ({ say: phrases.coachReady(ctx.elder.name), tips: await carerCoach(ctx) }));

  tool("memory_fidelity", ["family"],
    "For family: how her retellings compare with her first tellings, and her recent memory beside her " +
    "long-ago memory, compared only with herself. This is not a medical assessment.",
    {}, async () => {
      const v = await fidelityView(ctx);
      return { say: v.recentVsOld.say, ...v };
    });

  tool("care_follow_through", ["family"],
    "For family: when her speech has changed, the next steps Recollect has prepared for approval: a " +
    "pre-visit summary, questions for the doctor, a check-up invitation, a book of her stories and a " +
    "tablet check. Recollect never books, buys or orders anything itself.",
    {}, async () => {
      const steps = await ensureCarePlan(ctx);
      return {
        say: steps.length ? phrases.careReady(ctx.elder.name, steps.length) : phrases.careNone(ctx.elder.name),
        steps,
      };
    });

  tool("family_question", ["elder"],
    "A question her family left for her (\"Ask Biji\"). Call with no answer to ask her the next one; call " +
    "again with her words, exactly as spoken in the language she used, to keep her answer. Never press her: " +
    "if she says not now, leave it.",
    { answer: z.string().optional().describe("Her answer, exactly as spoken, in the language she used. Never translate.") },
    async ({ answer }) => {
      const r = await familyQuestion(ctx, answer);
      const { sessionId } = r;
      if (sessionId) background(() => processSession(ctx, sessionId));
      return { ...r };
    });

  tool("ask_question", ["family"],
    "For family: leave a question for her, e.g. 'Ask Grandma what her wedding day was like'. Recollect asks " +
    "her at a calm time of day, at most once a day, and keeps her answer in her own words.",
    {
      from: z.string().min(1).describe("Who is asking: their name or relation, e.g. 'Aman'."),
      question: z.string().min(3).max(200).describe("The question, in their words, as it should be read to her."),
    },
    async ({ from, question }) => {
      try {
        const r = await askQuestion(ctx, from, question);
        return { say: r.say, id: r.question.id };
      } catch (e) {
        if (e instanceof FamilyError) return { say: e.message };
        throw e;
      }
    });

  tool("weekly_digest", ["family"],
    "For family: the last seven days in a few lines: stories she told, memories the family added, questions " +
    "she answered, tablets marked, and the questions she asked most. Counts only.",
    {}, async () => {
      const [digest, missed] = await Promise.all([weeklyDigest(ctx), missedDoses(ctx)]);
      return { ...digest, missed };
    });

  tool("life_timeline", ["family"],
    "For family: her life on a timeline, from the stories she told, each at the year she said or the year the " +
    "family confirmed, with her exact words.",
    {}, async () => {
      const t = await lifeTimeline(ctx, "family");
      const dated = t.events.filter((e) => e.year !== null).length;
      return { say: phrases.timelineReady(ctx.elder.name, t.events.length, dated), ...t };
    });

  tool("this_is_me", ["family"],
    "For family: her printable 'This is me' page for carers and hospitals, built from what the family wrote and approved.",
    {}, async () => ({ ...(await thisIsMe(ctx)) }));

  return server;
}

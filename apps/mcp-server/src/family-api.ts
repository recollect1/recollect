// REST for the family page (§13), family token only. Setup and consent writes live here, not in
// MCP tools, because they are admin screens rather than things anyone says to Alexa.
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  acknowledgeAlert, approveFact, changeConsent, familyAlerts, chooseWeeklyPhoto, deleteEverything, factCandidates, familyOverview, familyStories,
  familySummary, FamilyError, saveMedicine, saveProfile, setStatusLine, speechTrend, thisIsMe, type Ctx,
} from "@recollect/core";
import { z } from "zod";

type Json = (res: ServerResponse, status: number, body: unknown) => void;

const Medicine = z.object({
  id: z.string().optional(), name: z.string().min(1).max(60), purpose: z.string().max(200).default(""),
  aliases: z.array(z.string().max(40)).max(12).default([]), times: z.array(z.string()).max(6),
});
const Consent = z.object({
  elderAgreed: z.boolean().optional(), familyAgreed: z.boolean().optional(),
  fullVoice: z.boolean().optional(), off: z.boolean().optional(),
});
const List = z.array(z.string().max(200)).max(20);
const Profile = z.object({
  preferredName: z.string().max(60).optional(), likes: List.optional(), calms: List.optional(),
  upsets: List.optional(), routines: List.optional(), communicationTips: List.optional(),
});

/** Returns true when it handled the request. */
export async function familyApi(
  ctx: Ctx, req: IncomingMessage, res: ServerResponse, path: string, body: unknown, json: Json,
): Promise<boolean> {
  const route = `${req.method} ${path}`;
  try {
    switch (route) {
      case "GET /api/family/overview": return json(res, 200, await familyOverview(ctx)), true;
      case "GET /api/family/today": return json(res, 200, await familySummary(ctx)), true;
      case "GET /api/family/stories": return json(res, 200, await familyStories(ctx)), true;
      case "GET /api/family/trend": return json(res, 200, await speechTrend(ctx)), true;
      case "GET /api/family/alerts": return json(res, 200, await familyAlerts(ctx)), true;
      case "POST /api/family/alert-ack": {
        await acknowledgeAlert(ctx, z.object({ id: z.string() }).parse(body).id);
        return json(res, 200, { ok: true }), true;
      }
      case "GET /api/family/this-is-me":
        return json(res, 200, { ...(await thisIsMe(ctx)), candidates: await factCandidates(ctx) }), true;
      case "POST /api/family/status": {
        const b = z.object({ personId: z.string(), statusLine: z.string().max(200) }).parse(body);
        await setStatusLine(ctx, b.personId, b.statusLine);
        return json(res, 200, { ok: true }), true;
      }
      case "POST /api/family/medicine": return json(res, 200, { id: await saveMedicine(ctx, Medicine.parse(body)) }), true;
      case "POST /api/family/weekly-photo": {
        await chooseWeeklyPhoto(ctx, z.object({ photoId: z.string() }).parse(body).photoId);
        return json(res, 200, { ok: true }), true;
      }
      case "POST /api/family/consent": return json(res, 200, await changeConsent(ctx, Consent.parse(body))), true;
      case "POST /api/family/delete-everything": {
        z.object({ confirm: z.literal("delete everything") }).parse(body);
        return json(res, 200, await deleteEverything(ctx)), true;
      }
      case "POST /api/family/profile": await saveProfile(ctx, Profile.parse(body)); return json(res, 200, { ok: true }), true;
      case "POST /api/family/fact": {
        const b = z.object({ fact: z.string(), approve: z.boolean().default(true) }).parse(body);
        await approveFact(ctx, b.fact, b.approve);
        return json(res, 200, { ok: true }), true;
      }
      default: return false;
    }
  } catch (e) {
    if (e instanceof z.ZodError) return json(res, 400, { error: "invalid request", issues: e.issues }), true;
    if (e instanceof FamilyError) return json(res, 400, { error: e.message }), true;
    throw e;
  }
}

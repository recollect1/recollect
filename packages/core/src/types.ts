// Graph model, CLAUDE.md §6. Timestamps are ISO-8601 UTC strings.
export type Role = "elder" | "family" | "helper";
export type SessionMode = "story" | "daily" | "family" | "photo_desc";
export type EntityKind = "person" | "place" | "event" | "thing";
export type AskIntent = "recall" | "whats_today" | "where_is" | "check_dose" | "who_is" | "night_out";

export interface Household {
  id: string; name: string; tz: string; elderId: string; adminId: string;
  /** The language she hears (default English). */
  lang?: "en" | "hi";
}
export interface Person {
  id: string; name: string; role: Role; aliases: string[]; relation: string;
  relationToElder?: string; statusLine?: string; photoUrl?: string;
  /** Family-written Hindi versions, used when she hears Hindi. */
  relationToElderHi?: string; statusLineHi?: string;
}
export interface Session {
  id: string; startedAt: string; speakerId: string; mode: SessionMode;
  private: boolean; hasAudio: boolean; storyKey?: string;
  /** Family memory network: the story of hers that a family member's memory is about. */
  aboutSessionId?: string;
}
export interface Quote {
  id: string; text: string; speakerId: string; saidAt: string; sessionId: string;
  seq: number; private: boolean; embedding?: number[];
}
export interface Entity { id: string; kind: EntityKind; name: string; aliases: string[]; year?: number }
export interface Photo { id: string; url: string; caption: string }
export interface StoryPrompt { id: string; text: string; basedOnEntityId: string; used: boolean }
export interface Medicine { id: string; name: string; purpose: string; aliases: string[]; nameHi?: string }
export interface Schedule { id: string; medicineId: string; time: string; qty: number }
export interface DoseEvent { id: string; medicineId: string; at: string }
export interface Visit { id: string; personId: string; daysOfWeek: number[]; time: string; kind: "visit" | "call" }
export interface AskEvent { id: string; intent: AskIntent; detail: string; at: string }
export interface Consent {
  id: string; personId: string; trackingOn: boolean; fullVoiceOn: boolean;
  byElderAt?: string; byFamilyAt?: string;
}
export interface Profile {
  id: string; personId: string; preferredName: string; likes: string[]; calms: string[];
  upsets: string[]; routines: string[]; communicationTips: string[]; approvedFacts: string[];
  /** Hindi versions of what calms her, for the evening greeting in Hindi. */
  calmsHi?: string[];
}
export interface WeeklyPhoto { id: string; photoId: string; week: string; sessionId?: string }
export interface Device { id: string; kind: "light" | "speaker"; room: string; state: string }
export interface RoutineEvent { id: string; kind: "evening" | "night"; at: string; actions: string[]; escalated: boolean }
/** Shown to the family (§9.4 night escalation). `sms` is set once an SNS message was sent. */
export interface FamilyAlert {
  id: string; at: string; kind: "night"; say: string; place?: string; acknowledged: boolean; sms?: boolean;
}
/** Per-session speech markers (§7). `simulated` marks demo data, which every screen must label. */
export interface MarkerSet {
  id: string; sessionId: string; computedAt: string; mode: SessionMode; simulated: boolean;
  retold?: boolean; [metric: string]: unknown;
}
/** A short message a family member leaves her; read out when she asks where they are. */
export interface FamilyMessage { id: string; personId: string; text: string; at: string }
/**
 * Memory Fidelity Engine: one "tell me about your day" chat, compared silently with who actually
 * visited or called. Never shown or said to her; family view only, and only while tracking is on.
 */
export interface RecentRecall {
  id: string; at: string; sessionId?: string; expected: string[]; mentioned: string[];
  matched: boolean; simulated: boolean;
}
/** Care follow-through: one step Recollect prepares when a change card appears. Never acted on alone. */
export interface CareAction {
  id: string; planId: string; trendCardId: string; kind: "summary" | "questions" | "appointment" | "memory_book" | "tablet_check";
  order: number; title: string; detail: string; items: string[]; status: "proposed" | "approved" | "dismissed";
  createdAt: string; decidedAt?: string; simulated: boolean;
}
// Written by the trends agent (§9.3); read, never computed, by the speech_trend tool.
export interface TrendCard {
  id: string; personId: string; createdAt: string; kind: "stable" | "change";
  say: string; changes: string[]; since?: string; weeks: number; simulated: boolean;
}

// Graph model, CLAUDE.md §6. Timestamps are ISO-8601 UTC strings.
export type Role = "elder" | "family" | "helper";
export type SessionMode = "story" | "daily" | "family" | "photo_desc";
export type EntityKind = "person" | "place" | "event" | "thing";
export type AskIntent = "recall" | "whats_today" | "where_is" | "check_dose" | "who_is";

export interface Household { id: string; name: string; tz: string; elderId: string; adminId: string }
export interface Person {
  id: string; name: string; role: Role; aliases: string[]; relation: string;
  relationToElder?: string; statusLine?: string; photoUrl?: string;
}
export interface Session {
  id: string; startedAt: string; speakerId: string; mode: SessionMode;
  private: boolean; hasAudio: boolean; storyKey?: string;
}
export interface Quote {
  id: string; text: string; speakerId: string; saidAt: string; sessionId: string;
  seq: number; private: boolean; embedding?: number[];
}
export interface Entity { id: string; kind: EntityKind; name: string; aliases: string[]; year?: number }
export interface Photo { id: string; url: string; caption: string }
export interface StoryPrompt { id: string; text: string; basedOnEntityId: string; used: boolean }
export interface Medicine { id: string; name: string; purpose: string; aliases: string[] }
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
}
export interface WeeklyPhoto { id: string; photoId: string; week: string; sessionId?: string }
export interface Device { id: string; kind: "light" | "speaker"; room: string; state: string }
export interface RoutineEvent { id: string; kind: "evening" | "night"; at: string; actions: string[]; escalated: boolean }
// Written by the trends agent (§9.3); read, never computed, by the speech_trend tool.
export interface TrendCard {
  id: string; personId: string; createdAt: string; kind: "stable" | "change";
  say: string; changes: string[]; since?: string; weeks: number; simulated: boolean;
}

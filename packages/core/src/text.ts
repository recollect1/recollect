import { randomUUID } from "node:crypto";

export const newId = (prefix: string) => `${prefix}-${randomUUID()}`;

export const wordCount = (text: string) => (text.trim().match(/\S+/g) ?? []).length;

/**
 * Split a told story into quotes, one sentence each. The pieces are exact substrings of the input
 * (only the whitespace between sentences is dropped): stored words are never rewritten (§1.1).
 * A fragment under four words stays attached to the sentence before it.
 */
export function splitQuotes(text: string): string[] {
  const sentences = text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  const out: string[] = [];
  for (const s of sentences) {
    if (out.length && wordCount(s) < 4) out[out.length - 1] += ` ${s}`;
    else out.push(s);
  }
  return out;
}

export const normalise = (text: string) =>
  ` ${text.toLowerCase().replace(/[’']s\b/g, "").replace(/[^a-z0-9-]+/g, " ").trim()} `;

/** True when `span` occurs in `text` as whole words (case-sensitive). */
export function hasSpan(text: string, span: string): boolean {
  const esc = span.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z])${esc}(?![A-Za-z-])`).test(text);
}
